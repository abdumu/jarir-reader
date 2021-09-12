const Epub = require("epub-gen");
const {
    nl2br,
    uuid,
    escapeOurXml,
} = require("./helpers");
const arabicTrans = require('./transliteration');
const {
    readFileSync, existsSync, mkdirSync
} = require("fs");
const {
    resolve: pathResolve
} = require("path");
const { getAppDataPath } = require('./cross-platform');


const bookEpubGenerator = (book, info) => {
    
    return new Promise((resolve, reject) => {
        if (!existsSync(pathResolve(getAppDataPath('jarir-cli'), 'temp'))) {
            try {
                mkdirSync(pathResolve(getAppDataPath('jarir-cli'), 'temp'), { recursive: true});
            }catch(e){
                reject(e);
                return;
            }
        }

        const option = {
            verbose: true,
            tempDir: pathResolve(getAppDataPath('jarir-cli'), 'temp'),
            title: book.title,
            author: book.author || [],
            publisher: book.publisher,
            cover: book.cover,
            lang: info.language || 'en',
            appendChapterTitles: false,
            customOpfTemplatePath: pathResolve(__dirname, '../', 'public', 'template.opf.ejs'),
            customNcxTocTemplatePath: pathResolve(__dirname, '../', 'public', 'toc.ncx.ejs'),
            customHtmlTocTemplatePath: pathResolve(__dirname, '../', 'public', 'toc.xhtml.ejs'),
            css: readFileSync(pathResolve(__dirname,  '../', 'public', 'template.css')).toString().replace(/{{direction}}/g, (info.language || 'ar') === 'en' ? 'left' : 'right'),
            tocTitle: info.language && info.language == 'ar' ? 'الفهرس' : 'Table Of Contents',
            fonts: [pathResolve(__dirname, '../', 'public', 'font1.otf'), pathResolve(__dirname, '../', 'public','font2.otf')]
        };
        parseChapter(book, info).then(content => {
            option.content = content
            const oldLogger = console.log;
            try {
                console.log = () => {};
            } catch (e) {
                reject(e);
            }
            new Epub(option, pathResolve(getAppDataPath('jarir-cli'), 'books', `${book.title}.epub`)).promise.then(() => {
                try {
                    console.log = oldLogger;
                } catch (e) {
                    reject(e);
                }

                resolve(pathResolve(getAppDataPath('jarir-cli'), 'books', `${book.title}.epub`));
            }, err => {
                try {
                    console.log = oldLogger;
                } catch (e) {
                    reject(e);
                }
                reject(err);
            })

        }).catch(err => {
            reject(err);
        })
    })
}


const parseChapter = (book, info) => {
    return new Promise((resolve, reject) => {
        const content = [];
        var totalOffset = 0
        for (let index = 1; index <= info.chapters; index++) {
            var chapter = {
                title: '',
                data: '',
                // excludeFromToc: false,
                filename: ''
            };
            try {
                var text = readFileSync(pathResolve(getAppDataPath('jarir-cli'), 'books', book.id, 'Text', 'chapter-' + String(index).padStart(3, 0) + '.htmlx')).toString();
                var spans = readFileSync(pathResolve(getAppDataPath('jarir-cli'), 'books', book.id, 'Text', 'chapter-' + String(index).padStart(3, 0) + '.html.spans')).toString();
                var toc = readFileSync(pathResolve(getAppDataPath('jarir-cli'), 'books', book.id, 'Index', 'toc.json')).toString();
            } catch (err) {
                reject(err);
                return;
            }
    
            try {
                toc = JSON.parse(toc);
                spans = JSON.parse(spans);
            } catch (err) {
                spans = [];
                tocs = [];
            }

            var lastOffset = totalOffset;
            totalOffset += text.length - 1;
            chapter.title = getChapterTitle(lastOffset, totalOffset, toc);
            // chapter.excludeFromToc = chapter.title === '';
            chapter.filename = chapter.title !== '---' ? arabicTrans(chapter.title).replace(/\s/g, '-') : uuid();
            chapter.data = `<body>${nl2br(parseSpan(book, text, spans), info.language !== 'en')}</body>`;

            content.push(chapter);
        }

        try {
            content.push({
                title: info.language === 'ar' ? 'حقوق الناشر' : 'Copyrights',
                filename: 'copyrights',
                data: nl2br(parseSpan(book, readFileSync(pathResolve(__dirname, '../', 'public', 'last-chapter.txt')).toString(), [
                    [0, 5, 0]
                ]), true)
            });
            // console.log(content)
        } catch (err) {
            reject(err);
            return;
        }

        resolve(content);
    });
}

const parseSpan = (book, text, spans) => {
    var result = text;
    var offsetAdded = 0;
    tidySpans(spans).forEach(el => {
        var offsetStart = el[0] + offsetAdded;
        var offsetEnd = el[1] + offsetAdded;
        var snippet = result.substring(offsetStart, offsetEnd);
        var changedSnippet = snippet;
        el[2].forEach(types => {
            //[offsetStart, offsetEnd,[[type, item?]]]
            //type: 0 = bold <strong></strong>
            //type: 102: center p.center
            //type: 11: ?  chapters + sections [toc?] <h2></h2>
            //type: 101: reference //,[31306,31307,101,"#ftn.3"], [not supported by Jarir yet!]
            //type: 7: reference ? italic? sub <em></em>
            //type: 104 = image

            if (types[0] === 0) {
                changedSnippet = `[strong]${changedSnippet}[/strong]`;
            } else if (types[0] === 102) {
                changedSnippet = `[center]${changedSnippet}[/center]`;
            } else if (types[0] === 104) {
                var img = pathResolve(getAppDataPath('jarir-cli'), 'books', book.id, types[1].replace(/^\/+/, ''));
                changedSnippet = `[img=${img}]`;
            }
        });
        offsetAdded += changedSnippet.length - snippet.length;
        result = result.substring(0, offsetStart) + changedSnippet + result.substr(offsetEnd);
    });

    return cleanAndParse(result);
}


const tidySpans = (spans) => {
    // [[0,18,102,"0"],[0,18,0],[0,18,11]] => [0,18,[[102,"0"][0][11]] 
    var spans = spans.sort(function (a, b) {
        return a[0] - b[0];
    });

    var ob = {}
    spans.forEach(el => {
        if (!ob.hasOwnProperty(`${el[0]}-${el[1]}`)) {
            ob[`${el[0]}-${el[1]}`] = [el[0], el[1],
                []
            ];
        }

        ob[`${el[0]}-${el[1]}`][2].push(el.slice(2));
    })

    return Object.values(ob).sort(function (a, b) {
        return a[0] - b[0];
    });
}


const getChapterTitle = (offsetStart, offsetEnd, toc) => {
    // console.log(offsetStart, offsetEnd, toc)
    for (let index = 0; index < toc.length; index++) {
        const el = toc[index];
        if (el.offset >= offsetStart && el.offset <= offsetEnd) {
            return el.title || '---';
        }
    }

    return '---';
}


const cleanAndParse = (text) => {
    try{
        text = escapeOurXml(text);
    } catch(e) {}

    return text
        .replace(/\[img=(.*?)\]/g, `<img src="$1">`)
        .replace(/\[strong\]((?:[^](?!\[strong\]))*?)\[\/strong\]/g, `<strong>$1</strong>`)
        .replace(/\[center\]((?:[^](?!\[center\]))*?)\[\/center\]/g, `<p class="center">$1</p>`);
}


module.exports = bookEpubGenerator;