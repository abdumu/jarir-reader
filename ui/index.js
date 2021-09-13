const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const { existsSync } = require("fs");
const path = require("path");
const { auth, getUserBooks, downloadAndGenerateBook, getAppDataPath, getSettings, logoutFromApp, initiateCli } = require("jarir-cli");

if (require("electron-squirrel-startup")) {
    app.quit();
}

const createWindow = () => {
    if (app.commandLine.hasSwitch("cli")) {
        return initiateCli();
    }

    const mainWindow = new BrowserWindow({
        width: 500,
        height: 600,
        autoHideMenuBar: true,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, "js/preload.js"),
            nativeWindowOpen: true,
        },
    });

    mainWindow.loadFile(path.join(__dirname, "index.html"));

    // Open the DevTools.
    // mainWindow.webContents.openDevTools();

    ipcMain.on("visitBook", (event, bookId) => {
        shell.openExternal(`https://jarirreader.com/book/${bookId}/github-abdumu`);
    });
    ipcMain.handle("downloadBook", async (event, book) => {
        return await downloadAndGenerateBook(book);
    });
    ipcMain.on("openBook", (event, book) => {
        shell.showItemInFolder(book.bookPath);
    });
    ipcMain.on("base", async (event, action) => {
        if (action === "close") {
            mainWindow.close();
        } else if (action === "folder") {
            const booksPath = path.resolve(getAppDataPath("jarir-cli"), "books/.");
            if (existsSync(booksPath)) {
                shell.showItemInFolder(booksPath);
            } else {
                dialog.showErrorBox("عفواً", "لم تقم بتحميل كتب بعد...");
            }
        } else if (action === "devPage") {
            shell.openExternal("https://github.com/abdumu");
        } else if (action === "jarirPage") {
            shell.openExternal("https://jarirreader.com");
        } else if (action === "jarirTOS") {
            shell.openExternal("hhttps://jarirreader.com/site/tos");
        }
    });
    ipcMain.handle("simple", async (event, action) => {
        if (action === "username") {
            return await getSettings("username");
        } else if (action === "pre_auth") {
            return await auth();
        } else if (action === "logout") {
            return await logoutFromApp();
        } else if (action === "books") {
            return await getUserBooks();
        }
    });
    ipcMain.handle("auth", async (event, args) => {
        return await auth(args.email, args.password);
    });
};

app.on("ready", createWindow);

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
