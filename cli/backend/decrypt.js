const { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, unlinkSync } = require("fs");
const bottomInfo = require("./bottom-info");
const StreamZip = require("node-stream-zip");

const { resolve: pathResolve } = require("path");
// const Crypto = require("crypto");
const CryptoJS = require("crypto-js");
const { inflateSync } = require("zlib");
const { getAppDataPath } = require("./cross-platform");

const unzipBook = (book) => {
    const bInfo = new bottomInfo("Decrypting", "", ["🔒", "🔑", "🔏", "🔓"]);

    return new Promise((resolve, reject) => {
        if (typeof book.id === "undefined" || Number(book.id) === NaN) {
            reject(new Error("book.id is not valid!"));
        }

        const outputFolder = pathResolve(getAppDataPath("jarir-cli"), "books", "" + book.id);

        if (!existsSync(outputFolder + ".zip")) {
            reject(new Error(`file doesn't exist: ${outputFolder}.zip`));
            return;
        }

        const fileStat = statSync(outputFolder + ".zip");
        if (fileStat["size"] === 0) {
            unlinkSync(outputFolder + ".zip");
            reject(new Error(`Downloaded file is corrupted, try again!`));
            return;
        }

        bInfo.start();

        try {
            if (!existsSync(outputFolder)) {
                mkdirSync(outputFolder, {
                    recursive: true,
                });
            }
        } catch (e) {
            bInfo.end();
            reject(e);
        }

        const zip = new StreamZip({
            file: outputFolder + ".zip",
            storeEntries: true,
        });

        zip.on("error", (err) => {
            bInfo.end();
            reject(err);
        });

        zip.on("ready", () => {
            zip.extract(null, outputFolder, (err, count) => {
                if (err) {
                    bInfo.end();
                    zip.close();
                    reject(err);
                }

                bInfo.end();
                zip.close();
                resolve(count);
            });
        });

        zip.on("extract", async (entry, file) => {
            if (entry.isFile && /DATA\.DATA$/.test(file)) {
                decryptBinary(file);
            }
            if (entry.isFile && /chapter-[0-9]+.dat$/.test(file)) {
                decryptBinary(file);
            }
            if (entry.isFile && /\.html$/.test(file)) {
                decryptText(file);
            }
        });
    });
};

const decryptBinary = (file) => {
    const key = new Int8Array(Buffer.from([115, -36, 110, -93, 78, -22, 63, -71, 97, -126, 86, 66, -36, 46, 13, -96]));
    // const cipher = Crypto.createDecipheriv("rc4", key, "");
    // let outputBuffer = cipher.update(readFileSync(file), null, "binary") + cipher.final("binary");

    const keyHex = Array.from(keyArray).map(byte => {
        const hex = (byte & 0xff).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
    
    const keyNew = CryptoJS.enc.Hex.parse(keyHex);
    const encryptedData = readFileSync(file, 'binary');
    const encryptedWordArray = CryptoJS.enc.Latin1.parse(encryptedData);
    const decrypted = CryptoJS.RC4.decrypt(
        { ciphertext: encryptedWordArray },
        key
    );

    const outputBuffer = CryptoJS.enc.Latin1.stringify(decrypted);

    writeFileSync(file + "x", outputBuffer, {
        encoding: "binary",
    });
};

const decryptText = async (file) => {
    const key = new Int8Array(Buffer.from([115, -36, 110, -93, 78, -22, 63, -71, 97, -126, 86, 66, -36, 46, 13, -96]));
    // const cipher = Crypto.createDecipheriv("rc4", key, "");
    // let outputBuffer = cipher.update(readFileSync(file), null, "binary") + cipher.final("binary");
    const keyHex = Array.from(key).map(byte => {
        const hex = (byte & 0xff).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
    
    const keyNew = CryptoJS.enc.Hex.parse(keyHex);
    const encryptedData = readFileSync(file, 'binary');
    const encryptedWordArray = CryptoJS.enc.Latin1.parse(encryptedData);
    const decrypted = CryptoJS.RC4.decrypt(
        { ciphertext: encryptedWordArray },
        keyNew
    );

    const outputBuffer = CryptoJS.enc.Latin1.stringify(decrypted);

    writeFileSync(file + "_x", outputBuffer, {
        encoding: "binary",
    });

    var responseInflateBuffer;
    try {
        responseInflateBuffer = inflateSync(readFileSync(file + "_x")).toString();
    } catch (e) {
        responseInflateBuffer = "";
    }
    writeFileSync(file + "x", responseInflateBuffer, {
        encoding: "utf8",
    });
};

const jsonFileData = (file) => {
    return {};
};

module.exports = {
    unzipBook,
};
