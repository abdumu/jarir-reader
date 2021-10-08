const { rename } = require("fs");
const { resolve: pathResolve } = require("path");
const bookEpubGenerator = require("./epub");
const { getBookIndex } = require("./helpers");
const BottomInfo = require("./bottom-info");
const bookAudioGenerator = require("./audio");
const { getAppDataPath } = require("./cross-platform");

const bookGenerator = (book) => {
    return new Promise((resolve, reject) => {
        const bInfo = new BottomInfo("Generating", "", ["📁", "⚡", "🧲", "📦️"]);
        bInfo.start();

        const info = getBookIndex(book, "info");
        if (info === false) {
            reject(new Error("Can not parse info json file!"));
            bInfo.end();
            return;
        }

        if (["mp3"].includes(info.type)) {
            bookAudioGenerator(book, info)
                .then((res) => {
                    bInfo.end();
                    resolve(res);
                })
                .catch((error) => {
                    bInfo.end();
                    reject(error);
                });
        } else if (info.type === "pdf") {
            const newPath = pathResolve(getAppDataPath("jarir-cli"), "books", book.title + "." + info.type);

            try {
                renameSync(pathResolve(getAppDataPath("jarir-cli"), "books", "" + book.id, "Text", "DATA.DATAx"), newPath);
            } catch (e) {
                bInfo.end();
                if (err) {
                    reject(err);
                }
            }
            resolve(newPath);
        } else if (info.type === "epub") {
            bookEpubGenerator(book, info)
                .then((res) => {
                    bInfo.end();
                    resolve(res);
                })
                .catch((err) => {
                    bInfo.end();
                    reject(err);
                });
        } else {
            bInfo.end();
            reject(new Error("file type: " + info.type + " is not supported yet!"));
        }
    });
};

module.exports = bookGenerator;
