const axios = require("axios").default;
const querystring = require("querystring");
const Book = require("./book");
const bottomInfo = require("./bottom-info");
const { existsSync, mkdirSync, createWriteStream } = require("fs");
const { resolve: pathResolve } = require("path");
const { getSettings, uuid, randomCompany, setSettings, clearResidue } = require("./helpers");
const { getAppDataPath } = require("./cross-platform");
const { unzipBook } = require("./decrypt");
const bookGenerator = require("./book-generator");

const http = axios.create({
    baseURL: "https://api.jarirreader.com",
});
http.defaults.headers.post["Content-Type"] = "application/x-www-form-urlencoded";

const getInitialAuth = () => {
    return new Promise((resolve, reject) => {
        http.post(
            "/oauth2.0/token.php",
            querystring.stringify({
                grant_type: "client_credentials",
                client_secret: "cfb6113dfb4ccba4da7fd18c4dd8da6d",
                client_id: "accounts_manager",
            }),
            {
                timeout: 10000,
            }
        )
            .then((response) => {
                if (response.data.hasOwnProperty("access_token") && response.data.hasOwnProperty("expires_in")) {
                    resolve([response.data["access_token"], Date.now() + Number(response.data["expires_in"])]);
                }

                const err = new Error("(501) Could not retrieve initial access token!");
                err.code = 501;

                reject(err);
            })
            .catch((error) => {
                const err = new Error("(502) Could not retrieve initial access token! \n error:" + error.message);
                err.code = 502;
                reject(err);
            });
    });
};

const auth = (email, password) => {
    return new Promise((resolve, reject) => {
        var auth = null;

        var settings;
        if (typeof email === "undefined") {
            settings = getSettings();

            if (settings === null || !(settings.hasOwnProperty("auth") && settings.hasOwnProperty("expires"))) {
                const invalidErr = new Error("(503) auth & expires are not set! Please re-run the command again!");
                invalidErr.code = 503;
                reject(invalidErr);
                return;
            } else {
                const expires = Number(settings.expires);
                if (expires > Date.now()) {
                    resolve(settings.auth);
                    return;
                } else {
                    setSettings({
                        auth: null,
                        expires: null,
                    });
                    const invalidErr = new Error("(503) auth has expired! Please re-run the command again!");
                    invalidErr.code = 503;
                    reject(invalidErr);
                    return;
                }
            }
        } else {
            settings = {
                email: email,
                password: password,
            };
        }

        return getInitialAuth()
            .then((initialAuth) => {
                const [initialToken, expires] = initialAuth;

                http.post(
                    "/login/v1.0/login.php",
                    querystring.stringify({
                        access_token: initialToken,
                        password: settings.password,
                        email: settings.email,
                        appId: "1",
                        deviceUID: uuid().replace("-", ""),
                        deviceName: randomCompany(),
                    })
                )
                    .then((response) => {
                        if (response.data.hasOwnProperty("result") && response.data.result.hasOwnProperty("access_token")) {
                            auth = response.data["result"];
                            var username = auth.user.fullName || auth.user.nickname;
                            setSettings({
                                username: username,
                                auth: auth.access_token,
                                expires: expires,
                            });
                        }

                        if (auth.access_token === null) {
                            const err = new Error("(504) Can not login! check your info! \nerror: " + error.message);
                            err.code = 504;
                            reject(err);
                            return;
                        }

                        resolve(auth.access_token);
                    })
                    .catch((error) => {
                        const err = new Error("(505) Can not login! check your info! \nerror: " + error.message);
                        err.code = 505;
                        reject(err);
                    });
            })
            .catch((error) => reject(error));
    });
};

const getUserBooks = () => {
    const bInfo = new bottomInfo("Fetching", "", ["🙄", "🤔", "🤭", "🤫"]);

    return new Promise((resolve, reject) => {
        bInfo.start();
        return auth()
            .then((auth) => {
                const settings = getSettings("books");
                if (
                    typeof settings === "undefined" ||
                    !settings.hasOwnProperty("books") ||
                    (settings.hasOwnProperty("books") && settings.books.cached_at < Date.now() - 1000 * 60 * 10) /** TODO: 5 */
                ) {
                    http.post(
                        "/v1/books/get-user-books",
                        querystring.stringify({
                            access_token: auth,
                        })
                    )
                        .then((response) => {
                            var books = [];
                            if (response.data.hasOwnProperty("result")) {
                                var bookPath, book;
                                response.data.result.forEach((item, index) => {
                                    book = Book(
                                        item["book_id"],
                                        item["title"],
                                        item["book_file_url"],
                                        index,
                                        item["publisher"] || "جرير للنشر",
                                        (
                                            item["authors"] || {
                                                name: "غير معروف",
                                            }
                                        ).flatMap((o) => o.name),
                                        item["cover_url"] || null,
                                        item["file_type"],
                                        item["cover_thumb_url_162"] || item["cover_thumb_url_120"],
                                        false
                                    );
                                    bookPath = pathResolve(
                                        getAppDataPath("jarir-cli"),
                                        "books",
                                        book.title + (["epub", "pdf"].includes(book.type) ? `.${book.type}` : "")
                                    );
                                    book.bookPath = existsSync(bookPath) ? bookPath : false;
                                    books.push(book);
                                });
                            } else {
                                const err = new Error("(600) There was a problem retrieving the books list! (empty api response)");
                                err.code = 600;
                                reject(err);
                                return;
                            }

                            if (books.length > 0) {
                                setSettings({
                                    books: {
                                        cached_at: Date.now(),
                                        items: books,
                                    },
                                });
                            }
                            bInfo.end();
                            resolve(books);
                        })
                        .catch((error) => {
                            bInfo.end();
                            const err = new Error("(601) There was a problem retrieving the books list! => " + error.message);
                            err.code = 601;
                            reject(err);
                        });
                } else {
                    bInfo.end();
                    resolve(settings.books.items.map((i) => new Book(i)));
                }
            })
            .catch((error) => {
                reject(error);
                bInfo.end();
            });
    });
};

const downloadBook = (book) => {
    return new Promise((resolve, reject) => {
        if (!(book instanceof Book) && !(typeof book === "object" && "title" in book)) {
            const err = new Error("(700) Can not download book, has no valid book info!");
            err.code = 700;
            reject(err);
            return;
        }

        if (!book.url) {
            const err = new Error("(701) Can not download book, has no valid book url!");
            err.code = 701;
            reject(err);
            return;
        }

        const bInfo = new bottomInfo("Downloading", "", ["🔽", "⏬", "🔽", "⏬"]);
        bInfo.start();

        try {
            if (!existsSync(pathResolve(getAppDataPath("jarir-cli"), "books"))) {
                mkdirSync(pathResolve(getAppDataPath("jarir-cli"), "books"));
            }
        } catch (e) {
            bInfo.end();
            reject(e);
        }

        const path = pathResolve(getAppDataPath("jarir-cli"), "books", book.id + ".zip");

        if (existsSync(path)) {
            bInfo.end();
            resolve(path);
            return;
        }

        const writer = createWriteStream(path);
        writer.on("finish", () => {
            bInfo.end();
            resolve(path);
        });
        writer.on("error", (err) => {
            bInfo.end();
            reject(err);
        });

        axios({
            url: book.url,
            method: "GET",
            responseType: "stream",
            headers: {
                "Content-Type": "application/zip",
            },
        })
            .then(async (response) => {
                response.data.pipe(writer);
            })
            .catch((err) => {
                bInfo.end();
                err.message = "(702) " + err.message;
                err.code = 702;
                reject(err);
            });
    });
};

const downloadAndGenerateBook = async (book) => {
    return new Promise((resolve, reject) => {
        downloadBook(book)
            .then((r1) => {
                unzipBook(book)
                    .then((r2) => {
                        bookGenerator(book)
                            .then((r3) => {
                                resolve(r3);
                                clearResidue(book);
                                console.log(`💕️ Your book is ready: "${r3}"\n`);
                            })
                            .catch((error) => reject(error));
                    })
                    .catch((error) => reject(error));
            })
            .catch((error) => reject(error));
    });
};

module.exports = {
    auth,
    getUserBooks,
    downloadBook,
    downloadAndGenerateBook,
};
