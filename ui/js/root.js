window.root = () => {
    return {
        showLoading: false,
        username: "...",
        loadingTitle: "",
        alert: "",

        async init() {
            this.downloadedBooks = Alpine.reactive({});
            this.showLoading = true;
            this.loadingTitle = "جار تسجيل الدخول...";
            var res;
            try {
                res = await window.actions.pre_auth();
            } catch (err) {
                if (err.message.indexOf("(504) ") > -1 || err.message.indexOf("(502) ") > -1) {
                    this.authError = "بيانات الدخول خاطئة أو أنه لايوجد إتصال بالأنترنت!";
                    this.showAlert(this.authError);
                }
                this.authenticated = false;
                this.showLoading = false;
                return;
            }
            console.log("end init");

            this.showLoading = false;
            this.loadingTitle = "";

            this.authenticated = true;
            window.actions.getUsername().then((username) => {
                this.username = username;
            });
            setTimeout(() => {
                this.getBooks();
            }, 100);
        },

        showAlert(alertText) {
            this.alert = alertText;
            setTimeout(() => {
                this.alert = "";
            }, 1000 * 3);
        },
        /**
         * TOS
         */
        showTos: true,
        acceptTos() {
            this.showTos = false;
        },
        rejectTos() {
            window.actions.rejectTos();
        },
        visitJarirTOS() {
            window.actions.openJarirTOS();
        },
        /**
         * Login
         */
        authenticated: false,
        authError: null,
        email: null,
        password: null,
        async login() {
            this.authError = null;

            if (!this.email || !this.password || this.email === "" || this.password === "") {
                this.authError = "قم بملأ بيانات الدخول قبل تقديم النموذج!";
                return;
            }

            this.showLoading = true;
            this.loadingTitle = "جار تسجيل الدخول ...";

            var res;
            try {
                res = await window.actions.auth(this.email, this.password);
            } catch (err) {
                if (err.message.indexOf("(504) ") > -1 || err.message.indexOf("(502) ") > -1) {
                    this.authError = "بيانات الدخول خاطئة أو أنه لايوجد إتصال بالأنترنت!";
                } else if (err.message.indexOf("(505) ") > -1) {
                    this.authError = "بيانات الدخول خاطئة!";
                } else {
                    this.authError = err.message;
                }

                this.authenticated = false;

                this.showLoading = false;
                this.loadingTitle = "";
                return false;
            }

            this.authenticated = true;
            this.loadingTitle = "";

            this.showLoading = false;
            window.actions.getUsername().then((username) => {
                this.username = username;
            });

            setTimeout(() => {
                this.getBooks();
            }, 100);

            return true;
        },

        /**
         * Hello/top bar
         */
        showAbout: false,
        async logout() {
            if (confirm("هل أنت متأكد من تسجيل الخروج وحذف كتبتك المحملة؟")) {
                this.showLoading = true;
                this.loadingTitle = "جار تسجيل الخروج ...";

                try {
                    window.actions.logout();
                } finally {
                    this.username = "...";
                    this.authenticated = false;
                    this.showLoading = false;
                    this.loadingTitle = "";
                    this.showAlert("تم تسجيل الخروج وحذف بياناتك من على حاسوبك!.");
                }
            }
        },

        openFolder() {
            window.actions.openFolder();
        },
        toggleAbout() {
            this.showAbout = !this.showAbout;
        },
        visitDeveloperPage() {
            window.actions.openDeveloperPage();
        },
        visitJarirPage() {
            window.actions.openJarirPage();
        },

        /**
         * books
         */
        books: {},
        downloadedBooks: {},
        booksCount: 0,
        getBooks() {
            this.showLoading = true;
            this.loadingTitle = "جار جلب بيانات الكتب ...";

            window.actions
                .getBooks()
                .then((books) => {
                    this.books = books;
                })
                .catch((error) => {
                    this.showAlert("حصلت مشكلة في جلب الكتب!");
                    console.log(error);
                })
                .finally(() => {
                    this.showLoading = false;
                    this.loadingTitle = "";
                    this.booksCount = this.books.length;
                });
        },
        visitBookOnJarir(bookId) {
            window.actions.visitBookPage(bookId);
        },
        downloadBook(wantedBook) {
            const book = JSON.parse(JSON.stringify(wantedBook));
            console.log(book);
            this.showLoading = true;
            this.loadingTitle = `جاري تحميل كتاب ${book.title}...`;

            window.actions
                .downloadBook(book)
                .then((res) => {
                    this.showAlert("تم تحميل الكتاب بنجاح، اضغط على الكتاب لعرضه.");

                    this.downloadedBooks[book.id] = res;
                })
                .catch((error) => {
                    console.log(error);
                    this.showAlert(`صادفنا خطأ، تأكد من بيانات الدخول أو الانترنت ...`);
                })
                .finally(() => {
                    this.showLoading = false;
                    this.loadingTitle = "";
                });
        },
        openBook(wantedBook) {
            const book = JSON.parse(JSON.stringify(wantedBook));
            if (wantedBook.id in this.downloadedBooks) {
                book.bookPath = this.downloadedBooks[wantedBook.id];
            }
            window.actions.openBook(book);
        },
    };
};
