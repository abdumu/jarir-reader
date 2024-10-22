
const testSub = {
    "ته": "tah",
    "ا": "a",
    "َ": "a",
    "ِ": "e",
    "ُ": "o",
    "ّ": "",
    "أ": "a",
    "إ": "ee",
    "أُ": "oo",
    "اَ": "a",
    "اِ": "ee",
    "آ": "aa",
    "ب": "b",
    "ت": "t",
    "ث": "th",
    "د": "d",
    "ذ": "th",
    "ج": "g",
    "ح": "h",
    "خ": "kh",
    "چ": "j",
    "س": "s",
    "ش": "sh",
    "ر": "r",
    "ز": "z",
    "ص": "s",
    "ض": "d",
    "ط": "t",
    "ظ": "dh",
    "ع": "3",
    "غ": "'3",
    "ف": "f",
    "ق": "q",
    "ڤ": "v",
    "ك": "k",
    "ل": "l",
    "م": "m",
    "ن": "n",
    "ً": "oon",
    "ه": "h",
    "ة": "t",
    "و": "w",
    "ٶ": "wo",
    "ي": "y",
    "ئ": "aa",
    "ى": "a",
    "ء": "",
};


const testTrans = (text) =>{
    var keys = Object.keys(testSub);
    var values = Object.values(testSub);
    for (var i = 0; i < keys.length; i++) {
        text = text.replace(new RegExp(keys[i],"g"), values[i]);
    }
    return  text.replace(/[^a-z0-9-_. ]/ig, '');
}

module.exports = testTrans

