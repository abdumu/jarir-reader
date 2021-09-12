const arabicTrans = require("./transliteration");

function Book(id, name, url, index, publisher, authors, cover, type, thumb, bookPath) {
    if (typeof id === "object") {
        Object.assign(this, id);
        return this;
    }

    if (!(this instanceof Book)) {
        if (typeof id === "object") {
            return new Book(id);
        } else {
            return new Book(id, name, url, index, publisher, authors, cover, type, thumb, bookPath);
        }
    }

    if (!["pdf", "epub", "mp3"].includes(type)) {
        type = "-";
    }

    this.id = id;
    this.value = index;
    this.title = name;
    this.url = url;
    this.type = type;
    this.short = this.id;
    this.publisher = publisher;
    this.authors = authors || [];
    this.cover = cover;
    this.thumb = thumb;
    this.bookPath = bookPath;
    this.name = this.id + { pdf: "🟥", epub: "📗", mp3: "🔉 mp3", "-": "" }[this.type] + ": " + arabicTrans(this.title) + "  (" + this.title + ")";
}

Book.prototype.urlFilename = function urlFilename() {
    return this.url.split("/").pop();
};
Book.prototype.setInfo = function setInfo(item, value) {
    return (this[item] = value);
};

module.exports = Book;
