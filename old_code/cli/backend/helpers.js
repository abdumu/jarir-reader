const { existsSync, readFileSync, writeFileSync, unlinkSync, rmdirSync, mkdirSync } = require("fs");
const { resolve: pathResolve } = require("path");
const { type: osType } = require("os");
const { getAppDataPath } = require("./cross-platform");
const { spawn } = require("child_process");
const { randomBytes } = require("crypto");

const uuid = () => {
    return randomBytes(16).toString("hex");
};
const xAccess = () => {
    return randomBytes(20).toString("hex");
};

const blank = (parameter) => {
    if (typeof parameter === "undefined" || parameter === null || parameter === "") {
        return true;
    }
    return false;
};

const randomCompany = () => {
    const items = [
        "Google Nexus 6",
        "Google Pixel 2",
        "Google Pixel 3",
        "Google Pixel 4",
        "Google Pixel 5",
        "Google Pixel 6",
        "Google Pixel 7",
        "Google Pixel 8",
        "Samsung Note 4",
        "Samsung Galaxy S9",
        "Samsung Galaxy S10",
        "Samsung Galaxy S20",
        "Samsung Galaxy S21",
        "Samsung Galaxy S22",
        "Samsung Galaxy S23",
        "Samsung Galaxy Note 20",
        "OnePlus 7",
        "OnePlus 8",
        "OnePlus 9",
        "OnePlus 10",
        "OnePlus 11"
    ];
    return items[Math.floor(Math.random() * items.length)];
};

const logoutFromApp = () => {
    return new Promise((resolve, reject) => {
        if (existsSync(pathResolve(getAppDataPath("jarir-cli"), ".jarir-settings"))) {
            unlinkSync(pathResolve(getAppDataPath("jarir-cli"), ".jarir-settings"));
        }

        if (existsSync(pathResolve(getAppDataPath("jarir-cli"), "books"))) {
            rmdirSync(pathResolve(getAppDataPath("jarir-cli"), "books"), { recursive: true });
        }

        resolve(!existsSync(pathResolve(getAppDataPath("jarir-cli"), "books")) && !existsSync(pathResolve(getAppDataPath("jarir-cli"), ".jarir-settings")));
    });
};

const getSettings = (item) => {
    if (existsSync(pathResolve(getAppDataPath("jarir-cli"), ".jarir-settings"))) {
        const data = readFileSync(pathResolve(getAppDataPath("jarir-cli"), ".jarir-settings")).toString();
        if (IsJsonString(data)) {
            const res = JSON.parse(data);
            if (item) {
                return res[item];
            }
            return res;
        }
    }
    return null;
};

const setSettings = async (newSettings) => {
    var data = getSettings();
    if (data === null) {
        data = {};
    }

    const keys = Object.keys(newSettings);
    for (let index = 0; index < keys.length; index++) {
        const element = keys[index];
        data[element] = newSettings[element];
    }

    if (!existsSync(pathResolve(getAppDataPath("jarir-cli")))) {
        try {
            mkdirSync(pathResolve(getAppDataPath("jarir-cli")), {
                recursive: true,
            });
            mkdirSync(pathResolve(getAppDataPath("jarir-cli"), "temp"), {
                recursive: true,
            });
        } catch (e) {
            console.log(
                `Please make sure that the app have permissions to read/write to current user app-data (${getAppDataPath()}). or create a folder "jarir-cli" in that folder manually!\n`
            );
        }
    }

    writeFileSync(pathResolve(getAppDataPath("jarir-cli"), ".jarir-settings"), JSON.stringify(data));
};

function IsJsonString(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const CredentialsAreSet = () => {
    const settings = getSettings();
    if (settings === null || Object.keys(settings).length < 2) {
        return false;
    }

    if (!settings.hasOwnProperty("email") || !settings.hasOwnProperty("password")) {
        return false;
    }

    if (settings.email === null || settings.email === "" || settings.password === null || settings.password === "") {
        return false;
    }

    return true;
};

const openExplorer = (path, callback) => {
    let OSType = osType();

    path = path || (OSType === "Windows_NT" ? "=" : "/");
    const commands = {
        Windows_NT: "explorer",
        Darwin: "open",
        Linux: "xdg-open",
    };
    if (commands.hasOwnProperty(OSType)) {
        let p = spawn(commands[OSType], [path]);
        p.on("error", (err) => {
            p.kill();
            return callback(err);
        });
    } else {
        return false;
    }
};

const clearResidue = (book) => {
    const path = pathResolve(getAppDataPath("jarir-cli"), "books", "" + book.id);
    if (existsSync(path + ".zip")) {
        unlinkSync(path + ".zip");
    }
    // if (existsSync(path + ".zip.body")) {
    //     unlinkSync(path + ".zip.body");
    // }
    if (existsSync(path)) {
        rmdirSync(path, {
            recursive: true,
        });
    }
};

const nl2br = (str, rtl) => {
    if (typeof str === "undefined" || str === null) {
        return "";
    }

    var ps = "";
    (str + "").split(/\r?\n/).forEach((line) => {
        if (line.trim() !== "") {
            ps += `<p${rtl ? ' style="direction:rtl"' : ""}>${line}</p$>`;
        } else {
            ps += "\n";
        }
    });

    return ps;
    // return '<p>'+(str+'').replace(/([\n]{2,})/ig, `</p>\n<p>`).replace(/([^>])\n([^<])/ig, `$1<br${is_xhtml == true ? ' /' : ''}$2`)
};

const getBookIndex = (book, item) => {
    const path = pathResolve(getAppDataPath("jarir-cli"), "books", "" + book.id, "Index", item + ".json");
    try {
        var json = readFileSync(path);
        json = JSON.parse(json);
    } catch (err) {
        return false;
    }

    return json;
};

const escapeOurXml = (unsafe) => {
    return (
        unsafe
            .replace(/\</g, "&lt;")
            .replace(/\>/g, "&gt;")
            // .replace(/\&/g, '&#x00026;')
            .replace(/\u0026/g, "<span class=and></span>")
            .replace(/\'/g, "&apos;")
            .replace(/"/g, "&quot;")
    );
};

const cleanFilename = (text, replaceWith) => {
    var replace = replaceWith || "-";
    var sanitized = text
        .replace(/[\/\?<>\\:\*\|":]/g, replace)
        .replace(/[\x00-\x1f\x80-\x9f]/g, replace)
        .replace(/^\.+$/, replace)
        .replace(/\s/g, replace)
        .replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/gi, replace)
        .replace(new RegExp(`${replace}{2,}`, "g"), replace)
        .replace(new RegExp(`${replace}$`), "")
        .replace(new RegExp(`^${replace}`), "");
    return sanitized.length > 255 ? sanitized.substr(0, 255) : sanitized;
};

const getImage = async (url) => {
    const { data } = await axios.get(url, {
        responseType: "arraybuffer",
    });

    // width: 162px; height:222px
    return data;
};

module.exports = {
    uuid,
    randomCompany,
    getBookIndex,
    getSettings,
    setSettings,
    CredentialsAreSet,
    clearResidue,
    nl2br,
    escapeOurXml,
    cleanFilename,
    openExplorer,
    logoutFromApp,
    getImage,
    getAppDataPath,
    blank,
    xAccess,
};
