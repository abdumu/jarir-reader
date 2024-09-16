const arabicTrans = require("./transliteration");

function Book(id, name, url, index, publisher, authors, cover, type, thumb, access, file_md5, file_id, latest_file_id, size, header, key, bookPath) {
    if (typeof id === "object") {
        Object.assign(this, id);
        return this;
    }

    if (!(this instanceof Book)) {
        if (typeof id === "object") {
            return new Book(id);
        } else {
            return new Book(id, name, url, index, publisher, authors, cover, type, thumb, access, file_md5, file_id, latest_file_id, size, header, key, bookPath);
        }
    }

    if (!["pdf", "epub", "mp3"].includes(type)) {
        type = "-";
    }

    this.id = id;
    this.value = index;
    this.title = name;
    this.url = url; // this is a sample now
    this.type = type;
    this.short = this.id;
    this.publisher = publisher;
    this.authors = authors || [];
    this.cover = cover;
    this.thumb = thumb;
    this.bookPath = bookPath;
    this.name = this.id + { pdf: "🟥", epub: "📗", mp3: "🔉 mp3", "-": "" }[this.type] + ": " + arabicTrans(this.title) + "  (" + this.title + ")";
    //new items for future use
    this.access = access || 0;
    this.file_md5 = file_md5 || "";
    this.header = header || "";
    this.key = key ||  [115, -36, 110, -93, 78, -22, 63, -71, 97, -126, 86, 66, -36, 46, 13, -96];
    this.file_id = file_id || id || 0;
    this.latest_file_id = latest_file_id || file_id || id || 0;
    this.size = size || 0;
}

Book.prototype.urlFilename = function urlFilename() {
    return this.url.split("/").pop();
};
Book.prototype.setInfo = function setInfo(item, value) {
    return (this[item] = value);
};

module.exports = Book;
