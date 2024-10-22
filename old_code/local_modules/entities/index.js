
exports.decode = (text, level) => text;
exports.encode = (text, level) => text;
exports.encodeHTML = (text, level) => text;
exports.encodeHTML5 = (text, level) => text;
exports.encodeHTML4 = (text, level) => text;
exports.decodeHTML = (text, level) => text;
exports.decodeHTML4 = (text, level) => text;
exports.decodeHTMLStrict = (text, level) => text;
exports.decodeHTML4Strict = (text, level) => text;
exports.decodeHTML5Strict = (text, level) => text;
exports.decodeHTML5 = (text, level) => text;
exports.encodeXML = (text, level) => text;
exports.decodeXML = (text, level) => text;
exports.decodeXMLStrict = (text, level) => text;
exports.decodeStrict = (text, level) => text;
exports.escape = (text, level) =>  {
    return text.replace(/\</g, '&lt;')
    .replace(/\>/g, '&gt;')
    .replace(/\&/g, '&#x00026;')
    // .replace(/\u0026/g, '&amp;')
    .replace(/\'/g, '&apos;')
    .replace(/"/g, '&quot;')
};;
