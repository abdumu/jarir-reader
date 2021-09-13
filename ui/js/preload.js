const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("actions", {
    rejectTos() {
        ipcRenderer.send("base", "close");
    },
    async getUsername() {
        return await ipcRenderer.invoke("simple", "username");
    },
    async auth(email, password) {
        return await ipcRenderer.invoke("auth", { email: email, password: password });
    },
    async pre_auth() {
        return await ipcRenderer.invoke("simple", "pre_auth");
    },
    async logout() {
        return await ipcRenderer.invoke("simple", "logout");
    },
    openFolder() {
        ipcRenderer.send("base", "folder");
    },
    openDeveloperPage() {
        ipcRenderer.send("base", "devPage");
    },
    openJarirPage() {
        ipcRenderer.send("base", "jarirPage");
    },
    openJarirTOS() {
        ipcRenderer.send("base", "jarirTOS");
    },
    visitBookPage(bookId) {
        ipcRenderer.send("visitBook", bookId);
    },
    openBook(book) {
        ipcRenderer.send("openBook", book);
    },
    async getBooks() {
        return ipcRenderer.invoke("simple", "books");
    },
    async downloadBook(book) {
        return ipcRenderer.invoke("downloadBook", book);
    },
});
