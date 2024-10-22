const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { message } = window.__TAURI_PLUGIN_DIALOG__;
const { shareFile } = window.__TAURI_PLUGIN_SHARESHEET__;

const actions = {
  openFolder() {
    // console.log("Opening folder");
    invoke("base_action", { action: "folder" });
  },
  openDeveloperPage() {
    // console.log("Opening developer page");
    invoke("base_action", { action: "devPage" });
  },
  openPage() {
    // console.log("Opening Book page");
    invoke("base_action", { action: "BookPage" });
  },
  rejectTos() {
    // console.log("Rejecting TOS");
    invoke("base_action", { action: "close" });
  },
  openTOS() {
    // console.log("Opening TOS");
    invoke("base_action", { action: "TOS" });
  },

  async pre_auth() {
    // console.log("Pre-authentication");
    return await invoke("pre_auth_action");
  },
  async logout() {
    // console.log("Logging out");
    return await invoke("logout_action");
  },
  async auth(email, password, app_type) {
    // console.log("Authenticating with email:" + email + " app_type: " + app_type + " password: " + password);
    return await invoke("auth_action", {
      action: "auth",
      email,
      password,
      app_type,
    });
  },
  async getUsername() {
    // console.log("Getting username");
    return await invoke("settings_action", { action: "username" });
  },
  async getAppType() {
    // console.log("Getting app type");
    return await invoke("settings_action", { action: "app" });
  },
  async getTargetOs() {
    // console.log("Getting os type");
    return await invoke("settings_action", { action: "os" });
  },
  async getBooks() {
    // console.log("Getting books");
    return await invoke("get_books");
  },
  visitBookPage(bookId) {
    //Unhandled Promise Rejection: invalid args `bookId` for command `visit_book`: command visit_book missing required key bookId
    // console.log("Visiting book page with ID:", bookId);
    invoke("visit_book", { bookId: bookId.toString() });
  },
  async downloadBook(book) {
    // console.log("Downloading book:", book);
    return await invoke("download_book", { bookId: book.id.toString() });
  },
  openBook(book) {
    // console.log("Opening book from actions.openBook:", book);
    invoke("open_book", { filePath: book.book_path });
  },
  async checkUpdate() {
    // console.log("Checking for updates");
    return await invoke("check_updates");
  },
};

const root = () => ({
  isOnline: true,
  showLoading: false,
  showTos: false,
  showAbout: false,
  authenticated: false,
  showBookInfo: false,
  username: "...",
  app_type: "jarir",
  currentOs: "desktop",
  loadingTitle: "",
  alertText: "",
  lastIncrement: 1,

  confirmAsync(message) {
    // console.log("Confirming async with message:", message);
    return new Promise((resolve) => {
      const result = confirm(message);
      resolve(result);
    });
  },
  xDelay(val, ms, increment) {
    // console.log("Delaying with value:", val, "ms:", ms, "increment:", increment);
    if (increment) {
      this.lastIncrement = this.lastIncrement + 0.5;
    }
    // console.log(ms * (increment ? this.lastIncrement - 1 : 1));
    return new Promise((resolve) => {
      setTimeout(
        () => {
          resolve(val);
        },
        ms * (increment ? this.lastIncrement - 1 : 1),
      );
    });
  },
  setupEventListeners() {
    // console.log("Setting up event listeners");
    listen("custom-message", (event) => {
      const [title, body] = event.payload;
      // console.log("Custom message received:", title, body);
      message(body, { title });
    });
  },
  checkConnection() {
    // console.log("Checking connection");
    //keep checking connection every 5 seconds
    setInterval(() => {
      this.isOnline = navigator.onLine;
    }, 5000);
  },

  mointorState() {
    //monitor state changes of any properties of these [showTos, showAbout, showBookInfo, showLoading, authenticated] and show console.log
    for (const item of [
      "showTos",
      "showAbout",
      "showBookInfo",
      "showLoading",
      "authenticated",
    ]) {
      this.$watch(item, (value) => {
        this.printStateOfAllProperties();
      });
    }
  },
  printStateOfAllProperties() {
    //print state of all properties
    for (const item of [
      "showTos",
      "showAbout",
      "showBookInfo",
      "showLoading",
      "authenticated",
    ]) {
      console.log(item + " = ", this[item]);
    }
  },
  //this gets called from withit x-data in index.html by alpinejs
  async init() {
    console.log("Initializing");

    this.setupEventListeners();
    this.checkConnection();
    this.mointorState();

    //hide scrollbars and stop scrolling when showTos is true
    //   this.$watch("showTos", (value) => {
    //     if (value) {
    //       document.body.style.overflow = "hidden";
    //     } else {
    //       document.body.style.overflow = "auto";
    //     }
    // });

    actions.getAppType().then((app_type) => {
      console.log("app_type:", app_type);
      this.app_type = app_type || "jarir";
    });

    actions.getTargetOs().then((os) => {
      console.log("os:", os);
      this.currentOs = os || "desktop";
    });

    this.downloadedBooks = Alpine.reactive({});
    this.showLoading = true;
    this.loadingTitle = "جار المصادقة مع الخادم...";
    let res;
    try {
      res = await actions.pre_auth();
      console.log("Pre-auth result:", res);
      if (res === false || res == null || res === "") {
        this.authenticated = false;
        this.showLoading = false;
        this.showTos = true;
        return;
      }
    } catch (err) {
      console.error("Pre-auth error:", err);
      if (
        err &&
        err.message &&
        (err.message.indexOf("(504) ") > -1 ||
          err.message.indexOf("(502) ") > -1)
      ) {
        this.authError = "بيانات الدخول خاطئة أو أنه لايوجد إتصال بالأنترنت!";
        console.log("Auth error:", this.authError);
        this.showAlert(this.authError);
      }
      this.authenticated = false;
      this.showLoading = false;
      this.showTos = true;
      return;
    }
    console.log("End init");

    this.showLoading = false;
    this.loadingTitle = "";

    this.authenticated = true;
    actions.getUsername().then((username) => {
      console.log("Username:", username);
      this.username = username;
    });
    //init get books
    setTimeout(() => {
      this.getBooks(":from init");
    }, 100);

    const randomNumber = Math.random();
    if (randomNumber < 0.5) {
      actions.checkUpdate().then((res) => {
        // console.log("Check update result:", res);
        if (
          res &&
          res.new_version &&
          res.new_version === true &&
          res.name &&
          res.published_at
        ) {
          this.showAlert(
            ") توجد نسخة جديدة من التطبيق، يمكنك تحميلها من الموقع الرسمي" +
              res.name +
              " تاريخ النشر: (" +
              res.published_at,
          );
        }
      });
    }
  },

  showAlert(alertText) {
    // console.log("Showing alert:", alertText);
    this.alertText = alertText;
    setTimeout(() => {
      this.alertText = "";
    }, 1000 * 3);
  },
  /**
   * TOS
   */

  acceptTos() {
    // console.log("Accepting TOS");
    this.showTos = false;
  },
  rejectTos() {
    // console.log("Rejecting TOS");
    actions.rejectTos();
  },
  visitTOS() {
    // console.log("Visiting TOS");
    actions.openTOS();
  },
  /**
   * Login
   */

  authError: null,
  email: null,
  password: null,
  async login() {
    // console.log("Logging in with email:", this.email);
    this.authError = null;

    if (
      !this.email ||
      !this.password ||
      this.email === "" ||
      this.password === ""
    ) {
      this.authError = "قم بملأ بيانات الدخول قبل تقديم النموذج!";
      return;
    }

    if (!this.app_type || this.app_type === "") {
      this.authError = "قم بتحديد نوع الحساب!";
      return;
    }

    this.showLoading = true;
    this.loadingTitle = "جار تسجيل الدخول ...";
    // await this.xDelay(null, 1000, true);

    let res;
    try {
      res = await actions.auth(this.email, this.password, this.app_type);
      // console.log("Auth result:", res);
    } catch (err) {
      // console.error("Auth error:", err);
      if (
        err &&
        err.message &&
        (err.message.indexOf("(504) ") > -1 ||
          err.message.indexOf("(502) ") > -1)
      ) {
        this.authError = "بيانات الدخول خاطئة أو أنه لايوجد إتصال بالأنترنت!";
      } else if (err && err.message && err.message.indexOf("(505) ") > -1) {
        this.authError = "بيانات الدخول خاطئة!";
      } else {
        this.authError = err.message || "حصلت مشكلة في تسجيل الدخول!";
      }

      this.authenticated = false;

      this.showLoading = false;
      this.loadingTitle = "";
      return false;
    }

    this.authenticated = true;
    this.loadingTitle = "";

    this.showLoading = false;
    actions.getUsername().then((username) => {
      console.log("Username after login:", username);
      this.username = username;
    });

    setTimeout(() => {
      this.getBooks(":from login");
    }, 100);

    return true;
  },

  /**
   * Hello/top bar
   */

  async logout() {
    // console.log("Logging out");
    const logoutConfirm = await this.confirmAsync(
      "هل أنت متأكد من تسجيل الخروج وحذف كتبتك المحملة؟",
    );
    if (logoutConfirm) {
      this.showLoading = true;
      this.loadingTitle = "جار تسجيل الخروج ...";

      try {
        await actions.logout();
      } finally {
        this.username = "...";
        this.authenticated = false;
        this.showLoading = false;
        this.loadingTitle = "";
        this.books = {};
        this.downloadedBooks = {};
        this.showAlert("تم تسجيل الخروج وحذف بياناتك من على حاسوبك!.");
      }
    }
  },

  openFolder() {
    // console.log("Opening folder");
    actions.openFolder();
  },
  toggleAbout() {
    // console.log("Toggling about section");
    this.showAbout = !this.showAbout;
  },
  visitDeveloperPage() {
    // console.log("Visiting developer page");
    actions.openDeveloperPage();
  },
  visitPage() {
    // console.log("Visiting Jarir page");
    actions.openJarirPage();
  },

  /**
   * books
   */
  books: {},
  downloadedBooks: {},
  booksCount: 0,
  selectedBook: null,
  getBooks(fromWhere) {
    // console.log("Getting books", fromWhere);
    this.showLoading = true;
    this.loadingTitle = "جار جلب بيانات الكتب ...";

    actions
      .getBooks()
      .then((books) => {
        if (typeof books === "string") {
          this.books = JSON.parse(books);
        } else {
          this.books = books;
        }
        // console.log("Books received:", this.books);
      })
      .catch((error) => {
        // console.error("Error getting books:", error);
        this.showAlert("حصلت مشكلة في جلب الكتب!");
      })
      .finally(() => {
        this.showLoading = false;
        this.loadingTitle = "";
        this.booksCount = this.books.length;
        // console.log("Books count:", this.booksCount);
      });
  },
  toggleBookInfo(bookId) {
    if (this.showBookInfo) {
      this.showBookInfo = false;
      this.selectedBook = null;
      return;
    }

    //disable scrollbar and show only bookinfo
    document.body.style.overflow = "hidden";

    this.selectedBook = this.books.find((book) => book.id === bookId);

    if (!this.selectedBook) {
      this.showAlert("حصلت مشكلة في عرض بيانات الكتاب!");
      this.selectedBook = null;
      return;
    }
    this.showBookInfo = true;
  },
  visitBookOnJarir(bookId) {
    // console.log("Visiting book on Jarir with ID:", bookId);
    actions.visitBookPage(bookId);
  },
  downloadBook(wantedBook) {
    const book = JSON.parse(JSON.stringify(wantedBook));
    if (book.type === "mp3") {
      this.showAlert("نأسف، لايمكن تحميل كتب الصوت حالياً.");
      return;
    }

    this.toggleBookInfo();
    // console.log("Downloading book:", book);
    this.showLoading = true;
    this.loadingTitle = `جاري تحميل كتاب ${book.title}...`;

    actions
      .downloadBook(book)
      .then((res) => {
        // console.log("Book downloaded:", res);
        this.showAlert("تم تحميل الكتاب بنجاح، اضغط على الكتاب لعرضه.");

        this.downloadedBooks[book.id] = res;
      })
      .catch((error) => {
        // console.error("Error downloading book:", error);
        this.showAlert(`صادفنا خطأ، تأكد من بيانات الدخول أو الانترنت ...`);
      })
      .finally(() => {
        this.showLoading = false;
        this.loadingTitle = "";
      });
  },

  //for android
  shareBook(filePath, title, save) {
    if (filePath) {
      console.log("Sharing book:", filePath);
      if (save) {
        filePath = "save://" + filePath;
      }
      shareFile(filePath, {
        file: filePath,
        title: title || "كتاب",
        mimeType: "application/octet-stream",
      }).catch((error) => {
        console.error("Error sharing book:", JSON.stringify(error));
        this.showAlert("حصلت مشكلة في مشاركة الكتاب!" + JSON.stringify(error));
      });
    } else {
      // console.error("No file path found for book:", filePath);
      this.showAlert(
        "هناك خطأ في مسار الكتاب، تأكد من تحميل الكتاب بشكل صحيح.",
      );
    }
  },

  saveBook(wantedBook) {
    const book = JSON.parse(JSON.stringify(wantedBook));
    if (book.book_path) {
      this.shareBook(book.book_path, book.title + " - " + book.author, true);
    } else if (book.id in this.downloadedBooks) {
      book.book_path = this.downloadedBooks[book.id];
      this.shareBook(book.book_path, book.title + " - " + book.author, true);
    }
  },

  openBook(wantedBook) {
    const book = JSON.parse(JSON.stringify(wantedBook));
    if (book.book_path) {
      if (this.currentOs === "android") {
        this.shareBook(book.book_path, book.title + " - " + book.author);
      } else {
        actions.openBook(book);
      }
    } else {
      if (book.id in this.downloadedBooks) {
        book.book_path = this.downloadedBooks[book.id];
        if (this.currentOs === "android") {
          this.shareBook(book.book_path, book.title + " - " + book.author);
        } else {
          actions.openBook(book);
        }
      }
    }
  },
});
document.addEventListener("alpine:init", () => {
  console.log("AlpineJS initialized");
  Alpine.data("body", root);
});
