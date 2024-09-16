const { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, unlinkSync, createWriteStream } = require("fs");
const bottomInfo = require("./bottom-info");
const StreamZip = require("node-stream-zip");
const { resolve: pathResolve, join: pathJoin } = require("path");
const CryptoJS = require("crypto-js");
const crypto = require('crypto');
const { promisify } = require('util');
const { inflateSync } = require("zlib");
const { getAppDataPath } = require("./cross-platform");

const readBookInfo = async (bookFile) => {
    const zip = new StreamZip.async({ file: bookFile });
    let info = {
        formatVersion: 5
    };

    const entries = await zip.entries();
    for (const entry of Object.values(entries)) {
        if (entry.name === 'info.json') {
            info = await zip.entryData(entry);
            break;
        }
    }

    await zip.close();
    return info;
}

const unzipBook = (book) => {
    const bInfo = new bottomInfo("Decrypting", "", ["🔒", "🔑", "🔏", "🔓"]);

    return new Promise(async (resolve, reject) => {
        
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
        const bookInfo = await readBookInfo(outputFolder + ".zip");

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
            try {
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
            } catch (err) {
                bInfo.end();
                zip.close();
                reject(err);
            }
        });

        zip.on("extract", async (entry, file) => {
            const formatVersion = Number(bookInfo.formatVersion) || 5;
            // console.log("Format version: " + formatVersion);

            if (entry.isFile && /DATA\.DATA$/.test(file)) {
                decryptBinary(file, book.key);
            }
            if (entry.isFile && /chapter-[0-9]+.dat$/.test(file)) {
                decryptBinary(file, book.key);
            }
            if (entry.isFile && /\.html$/.test(file)) {
                decryptText(file, book.key);
            }
            //if format >= 10 decrypt .json and .spans files except info.json
            if (formatVersion >= 10 && entry.isFile && /\.json$/.test(file) && /\.spans$/.test(file) && file !== 'info.json') {
                decryptText(file, book.key);
            }
        });
    });
};

const decryptBinary = (file, xkey) => {
    //[115, -36, 110, -93, 78, -22, 63, -71, 97, -126, 86, 66, -36, 46, 13, -96]
    const key = new Int8Array(Buffer.from(xkey));
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

const decryptText = async (file, xkey) => {
    const key = new Int8Array(Buffer.from(xkey));
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

//for new version
const appendFiles = async (bookFile, headerHash, userAccessToken, filePath) => {
    const sha1HashValue = crypto.createHash('sha1').update(userAccessToken + "platform").digest('hex');
    const key = sha1HashValue.padEnd(32, '0').slice(0, 32);
    const iv = '1234567812345678'; // IV should be 16 bytes long
    const decodedBytes = Buffer.from(headerHash, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const headerBytes = Buffer.concat([decipher.update(decodedBytes), decipher.final()]);
    const bodyBytes = readFileSync(bookFile);
    const combinedBuffer = Buffer.concat([headerBytes, bodyBytes]);

    const tempFile = pathJoin(require('os').tmpdir(), 'combined_data.zip');
    writeFileSync(tempFile, combinedBuffer);

    const zip = new StreamZip.async({ file: tempFile });
    let headerKey = null;

    const entries = await zip.entries();
    for (const entry of Object.values(entries)) {
        if (entry.name === 'header') {
            const headerBuffer = await zip.entryData(entry);
            headerKey = Array.from(headerBuffer);
        } else if (entry.name === 'body') {
            const outputStream = createWriteStream(filePath);
            const stream = await zip.stream(entry.name);
            stream.pipe(outputStream);
            await promisify(stream.on.bind(stream))('end');
        }
    }

    await zip.close();
    unlinkSync(tempFile);
    return headerKey;
};

module.exports = {
    unzipBook,
    appendFiles
};
