const { resolve: pathResolve } = require("path");
const { cleanFilename, getBookIndex } = require("./helpers");
const { renameSync, writeFileSync, existsSync, mkdirSync } = require("fs");
const { getAppDataPath } = require("./cross-platform");

const bookAudioGenerator = (book, info) => {
    return new Promise((resolve, reject) => {
        //create directory
        const path = pathResolve(getAppDataPath("jarir-cli"), "books", book.title);
        if (!existsSync(path)) {
            mkdirSync(path, {
                recursive: true,
            });
        }

        //initiate m3u writer
        const toc = getBookIndex(book, "toc") || [];

        var m3u8List = [];

        for (let index = 1; index <= info.chapters; index++) {
            var currentTocItem =
                toc.length >= index
                    ? toc[index - 1]
                    : {
                          title: `chapter-${String(index).padStart(2, 0)}`,
                          length: 0,
                      };
            var filename = `${book.authors.join("+").replace("_", "-")}_${cleanFilename(book.title, " ")}_${String(index).padStart(2, 0)}_${
                currentTocItem["title"]
            }.mp3`;
            var chapterName = `${book.authors.join("+").replace("_", "-")} - ${cleanFilename(book.title, " ")} - ${currentTocItem["title"]}`;

            m3u8List.push({
                name: chapterName,
                seconds: currentTocItem.length,
                path: cleanFilename(filename, " "),
            });

            var newPath = pathResolve(getAppDataPath("jarir-cli"), "books", cleanFilename(book.title, " "), cleanFilename(filename, " "));
            try {
                renameSync(pathResolve(getAppDataPath("jarir-cli"), "books", "" + book.id, "Audio", `chapter-${String(index).padStart(3, 0)}.datx`), newPath);
            } catch (e) {
                reject(new Error("Error trying generating book from downloading files! (datx->mp3)!"));
                return;
            }
        }

        var m3u8Filename = `${book.authors.join("+").replace("_", "-")}_${cleanFilename(book.title, " ")}_00_Playlist.m3u8`;
        var m3u8Path = pathResolve(getAppDataPath("jarir-cli"), "books", cleanFilename(book.title, " "), cleanFilename(m3u8Filename, " "));
        try {
            writeFileSync(m3u8Path, createM3U8(m3u8List, info.cover, book.authors.join("+")));
        } catch (e) {}
        resolve(path);
    });
};

const createM3U8 = (list, cover, author) => {
    var content = "#EXTM3U\n#EXTENC: UTF-8";
    if (cover) {
        content += `\n#EXTIMG:${cover}`;
    }
    if (author) {
        content += `\n#EXTALB:${author}`;
    }

    list.forEach((file) => {
        content += `\n#EXTINF:${file.seconds},${file.name}\${file.path}`;
    });

    return content;
};

module.exports = bookAudioGenerator;
