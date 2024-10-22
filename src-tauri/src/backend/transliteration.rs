use lazy_static::lazy_static;
use regex::Regex;
use std::collections::HashMap;

lazy_static! {
    static ref TRANSLITERATION_MAP: HashMap<&'static str, &'static str> = {
        let mut m = HashMap::new();
        m.insert("ته", "tah");
        m.insert("ا", "a");
        m.insert("َ", "a");
        m.insert("ِ", "e");
        m.insert("ُ", "o");
        m.insert("ّ", "");
        m.insert("أ", "a");
        m.insert("إ", "ee");
        m.insert("أُ", "oo");
        m.insert("اَ", "a");
        m.insert("اِ", "ee");
        m.insert("آ", "aa");
        m.insert("ب", "b");
        m.insert("ت", "t");
        m.insert("ث", "th");
        m.insert("د", "d");
        m.insert("ذ", "th");
        m.insert("ج", "g");
        m.insert("ح", "h");
        m.insert("خ", "kh");
        m.insert("چ", "j");
        m.insert("س", "s");
        m.insert("ش", "sh");
        m.insert("ر", "r");
        m.insert("ز", "z");
        m.insert("ص", "s");
        m.insert("ض", "d");
        m.insert("ط", "t");
        m.insert("ظ", "dh");
        m.insert("ع", "3");
        m.insert("غ", "'3");
        m.insert("ف", "f");
        m.insert("ق", "q");
        m.insert("ڤ", "v");
        m.insert("ك", "k");
        m.insert("ل", "l");
        m.insert("م", "m");
        m.insert("ن", "n");
        m.insert("ً", "oon");
        m.insert("ه", "h");
        m.insert("ة", "t");
        m.insert("و", "w");
        m.insert("ٶ", "wo");
        m.insert("ي", "y");
        m.insert("ئ", "aa");
        m.insert("ى", "a");
        m.insert("ء", "");
        m
    };
}

pub(crate) fn transliterate(text: &str) -> String {
    let mut result = text.to_string();
    for (key, value) in TRANSLITERATION_MAP.iter() {
        let re = Regex::new(key).unwrap();
        result = re.replace_all(&result, *value).to_string();
    }
    let re = Regex::new(r"[^a-z0-9-_. ]").unwrap();
    result = re.replace_all(&result, "").to_string();
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transliteration() {
        let input = "ته اَ إ";
        let expected = "tah a ee";
        assert_eq!(transliterate(input), expected);
    }
}
