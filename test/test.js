
const crypto = require('crypto');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const StreamZip = require('node-stream-zip');
const CryptoJS = require('crypto-js');

const sha1Hash = (str) => {
    return crypto.createHash('sha1').update(str).digest('hex');
};

const decryptBinary = (data, keyArray) => {
    const key = new Int8Array(Buffer.from(keyArray));
    const keyHex = Array.from(key).map(byte => {
        const hex = (byte & 0xff).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');

    const keyNew = CryptoJS.enc.Hex.parse(keyHex);
    const encryptedWordArray = CryptoJS.enc.Latin1.parse(data.toString('binary'));
    const decrypted = CryptoJS.RC4.decrypt(
        { ciphertext: encryptedWordArray },
        keyNew
    );

    const outputBuffer = CryptoJS.enc.Latin1.stringify(decrypted);
    return outputBuffer;
};

const decryptText = (data, keyArray) => {
    const key = new Int8Array(Buffer.from(keyArray));
    const keyHex = Array.from(key).map(byte => {
        const hex = (byte & 0xff).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');

    const keyNew = CryptoJS.enc.Hex.parse(keyHex);
    const encryptedWordArray = CryptoJS.enc.Latin1.parse(data.toString('binary'));
    const decrypted = CryptoJS.RC4.decrypt(
        { ciphertext: encryptedWordArray },
        keyNew
    );

    const outputBuffer = CryptoJS.enc.Latin1.stringify(decrypted);

    // Debugging: Check the first few bytes of the decrypted data
    const firstBytes = Buffer.from(outputBuffer, 'binary').slice(0, 10);
    console.log("First bytes of decrypted data: " + firstBytes.toString('hex'));

    let responseInflateBuffer;
    try {
        responseInflateBuffer = zlib.inflateSync(Buffer.from(outputBuffer, 'binary')).toString();
        console.log("Decompression successful.");
    } catch (e) {
        console.log("Decompression failed: " + e.message);
        responseInflateBuffer = "";
    }

    return responseInflateBuffer;
};

const appendFiles = async (bookFile, headerHash, userAccessToken, filePath) => {
    const sha1HashValue = sha1Hash(userAccessToken + "platform");
    console.log("SHA1 hash: " + sha1HashValue);
    const key = sha1HashValue.padEnd(32, '0').slice(0, 32);
    console.log("Key: " + key);
    const iv = '1234567812345678'; // IV should be 16 bytes long
    const decodedBytes = Buffer.from(headerHash, 'base64');
    console.log("Decoded bytes: " + decodedBytes.toString('hex'));
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    console.log("Decipher created.");
    const headerBytes = Buffer.concat([decipher.update(decodedBytes), decipher.final()]);
    console.log("Header bytes: " + headerBytes.toString('hex'));
    const bodyBytes = fs.readFileSync(bookFile);
    const combinedBuffer = Buffer.concat([headerBytes, bodyBytes]);
    console.log("Combined buffer created.");

    const tempFile = path.join(require('os').tmpdir(), 'combined_data.zip');
    fs.writeFileSync(tempFile, combinedBuffer);

    const zip = new StreamZip.async({ file: tempFile });
    let headerKey = null;

    const entries = await zip.entries();
    for (const entry of Object.values(entries)) {
        if (entry.name === 'header') {
            const headerBuffer = await zip.entryData(entry);
            headerKey = Array.from(headerBuffer);
            console.log("Header key: " + headerKey);
        } else if (entry.name === 'body') {
            const outputStream = fs.createWriteStream(filePath);
            const stream = await zip.stream(entry.name);
            stream.pipe(outputStream);
            await promisify(stream.on.bind(stream))('end');
        }
    }

    await zip.close();
    fs.unlinkSync(tempFile);
    return headerKey;
};

const deleteAll = (item) => {
    if (fs.existsSync(item)) {
        if (fs.lstatSync(item).isDirectory()) {
            fs.readdirSync(item).forEach((file) => {
                const curPath = path.join(item, file);
                deleteAll(curPath);
            });
            fs.rmdirSync(item);
        } else {
            fs.unlinkSync(item);
        }
    }
};

// Example usage
(async () => {
    try {
        const hash = '---add here---'
        const token =  '---add here---';
        const bodyFile = '---add here---';
        const filePath = './output.zip';

        const headerKey = await appendFiles(bodyFile, hash, token, filePath);

        deleteAll('./output');
        const zip = new StreamZip.async({ file: filePath });
        await zip.extract(null, './output');
        await zip.close();
        console.log("Files extracted successfully.");

        const files = fs.readdirSync('./output');
        for (const file of files) {
            console.log("File: " + file);
            if (file === '.' || file === '..') continue;

            const filePath = path.join('./output', file);
            if (fs.lstatSync(filePath).isDirectory()) {
                const subFiles = fs.readdirSync(filePath);
                for (const subFile of subFiles) {
                    console.log("Subfile: " + subFile);
                    if (subFile === '.' || subFile === '..') continue;

                    if ((subFile.endsWith('.html') || subFile.endsWith('.spans') || subFile.endsWith('.json')) && subFile !== 'info.json') {
                        console.log("Decrypting " + subFile);
                        const fileContents = fs.readFileSync(path.join(filePath, subFile));
                        const decryptedFileContents = decryptText(fileContents, headerKey);
                        fs.writeFileSync(path.join(filePath, subFile), decryptedFileContents);
                    }
                }
            }
        }

        console.log("Files appended and processed successfully.");
    } catch (e) {
        console.log("Error: " + e.message);
    }
})();