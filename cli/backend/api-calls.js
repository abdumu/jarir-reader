const axios = require("axios").default;
const querystring = require("querystring");
const Book = require("./book");
const bottomInfo = require("./bottom-info");
const { existsSync, mkdirSync, createWriteStream } = require("fs");
const { resolve: pathResolve, resolve } = require("path");
const { createHash } = require("crypto");
const { getSettings, uuid, randomCompany, setSettings, clearResidue, blank, xAccess } = require("./helpers");
const { getAppDataPath } = require("./cross-platform");
const { unzipBook } = require("./decrypt");
const bookGenerator = require("./book-generator");
const https = require("https");

const getRequestCheck = () => {
    const request_nonce = nonce();
    const request_time = requestTime();

    const buf = Buffer.from(
        JSON.stringify({
            nonce: request_nonce,
            checksum: checksum(request_time, request_nonce),
            timestamp: request_time,
            platform: "android",
        })
    );
    return buf.toString("base64");
};

const nonce = () => {
    let n = "";
    for (i = 0; i < 64; ++i) {
        n += Math.floor(Math.random() * 10);
    }

    return n;
};

const checksum = (time, nonce) => {
    return createHash("sha1").update(`${time}${nonce}5b38ff418618c39775c16b90f8637b6c`, "binary").digest("hex");
};

const requestTime = () => {
    return (Date.now() / 1000) | 0;
};

const http = axios.create({
    baseURL: "https://api.jarirreader.com",
    // baseURL: "https://api.yaqut.me", //rufoof
    httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        KeepAlive: true,
    }),
});
http.defaults.headers.post["Content-Type"] = "application/x-www-form-urlencoded";
http.defaults.headers.post["User-Agent"] = "okhttp/4.3.1";
http.defaults.headers.post["Host"] = "api.jarirreader.com";
// http.defaults.headers.post["Host"] = "api.yaqut.me"; //rufoof

const getInitialAuth = () => {
    return new Promise((resolve, reject) => {
        var settings = getSettings();
        if (!blank(settings) && settings.hasOwnProperty("initialToken") && settings.hasOwnProperty("expires")) {
            resolve([settings.initialToken, settings.expires]);
        }

        http.post(
            "/v5.0.1/login/token",
            querystring.stringify({
                grant_type: "client_credentials",
                client_secret: "cfb6113dfb4ccba4da7fd18c4dd8da6d",
                // client_secret: "207250e51846693d57b1b3bb7eb36a3e", //rufoof
                client_id: "accounts_manager",
                Platform: "Android",
            }),
            {
                timeout: 10000,
                headers: {
                    "X-Request-Check": getRequestCheck(),
                },
            }
        )
            .then((response) => {
                if (response.data !== null && response.data.hasOwnProperty("access_token") && response.data.hasOwnProperty("expires_in")) {
                    resolve([response.data["access_token"], Date.now() + Number(response.data["expires_in"])]);
                    return;
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
        var settings = getSettings();

        if (!blank(settings) && settings.hasOwnProperty("auth") && !blank("auth")) {
            const expires = Number(settings.expires);

            if (expires > Date.now()) {
                resolve({ username: settings.username, auth: settings.auth, deviceName: settings.deviceName, deviceUID: settings.deviceUID });
                return;
            }
        }

        if (blank(settings)) {
            settings = {};
        }

        try {
            if (!blank(email)) {
                settings.email = email;
            } else {
                if (typeof settings === "undefined" || blank(settings.email)) {
                    reject(new Error("no info"));
                }
            }
            if (!blank(password)) {
                settings.password = password;
            }
        } catch (e) {
            reject(new Error("no info"));
            return;
        }

        return getInitialAuth()
            .then((initialAuth) => {
                const [initialToken, expires] = initialAuth;

                setSettings({
                    initialToken: initialToken,
                    expires: expires,
                    password: settings.password,
                    email: settings.email,
                });

                const deviceUID = settings.deviceUID || uuid().replace("-", "");
                const deviceName = settings.deviceName || randomCompany();
                const x_access = xAccess();

                http.post(
                    "v5.0.1/login/login",
                    querystring.stringify({
                        access_token: initialToken,
                        deviceUID: deviceUID,
                        appId: "1",
                        email: settings.email,
                        deviceName: deviceName,
                        password: settings.password,
                        prev_access_token: x_access,
                        Platform: "Android",
                    }),
                    {
                        timeout: 10000,
                        headers: {
                            "X-Request-Check": getRequestCheck(),
                        },
                    }
                )
                    .then((response) => {
                        if (blank(response) || blank(response.data)) {
                            const err = new Error("(505) Can not login! check your info! \nerror: null data");
                            err.code = 505;
                            reject(err);
                            return;
                        }

                        const result = response.data.result;
                        var username = result.user.fullName || result.user.nickname;
                        setSettings({
                            username: username,
                            auth: result.access_token,
                            expires: expires,
                            deviceName: deviceName,
                            deviceUID: deviceUID,
                        });

                        resolve({ username: username, auth: result.access_token, deviceName: deviceName, deviceUID: deviceUID });
                    })
                    .catch((error) => {
                        const err = new Error("(505) Can not login! check your info! \nerror: " + (error.message || error));
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
            .then((authResult) => {
                const settings = getSettings();
                if (
                    typeof settings === "undefined" ||
                    !settings.hasOwnProperty("books") ||
                    (settings.hasOwnProperty("books") && settings.books.cached_at < Date.now() - 1000 * 60 * 10)
                ) {
                    http.post(
                        "/v5.0.1/books/get-user-books",
                        querystring.stringify({
                            access_token: authResult.auth,
                            Platform: "Android",
                            deviceName: authResult.deviceName,
                            deviceUID: authResult.deviceUID,
                        }),
                        {
                            timeout: 10000,
                            headers: {
                                "X-Request-Check": getRequestCheck(),
                            },
                        }
                    )
                        .then((response) => {
                            var books = [];
                            if (!blank(response.data) && response.data.hasOwnProperty("result")) {
                                var bookPath, book;
                                response.data.result.forEach((item, index) => {
                                    book = Book(
                                        item["book_id"],
                                        item["title"],
                                        item["book_file_url"],
                                        index,
                                        "جرير للنشر",
                                        item["authors_name"] || ["غير معروف"],
                                        item["cover_thumb_url"] || null,
                                        item["file_type"],
                                        item["cover_thumb_url"],
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
