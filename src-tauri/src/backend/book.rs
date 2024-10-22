use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Book {
    pub id: String,
    pub title: String,
    pub url: String,
    #[serde(rename = "type")]
    pub book_type: String,
    pub publisher: String,
    pub authors: Vec<String>,
    pub cover: Option<String>,
    pub thumb: Option<String>,
    pub book_path: Option<String>,
    pub name: String,
    pub access: bool,
    pub file_md5: String,
    pub header: String,
    pub key: Vec<i32>,
    pub file_id: String,
    pub latest_file_id: String,
    pub size: u64,
    pub downloaded_at: Option<u64>,
}

impl Default for Book {
    fn default() -> Self {
        Book {
            id: "".to_string(),
            title: "".to_string(),
            url: "".to_string(),
            book_type: "".to_string(),
            publisher: "".to_string(),
            authors: Vec::new(),
            cover: None,
            thumb: None,
            book_path: None,
            name: "".to_string(),
            access: false,
            file_md5: "".to_string(),
            header: "".to_string(),
            key: Vec::from([
                115, -36, 110, -93, 78, -22, 63, -71, 97, -126, 86, 66, -36, 46, 13, -96,
            ]),
            file_id: "".to_string(),
            latest_file_id: "".to_string(),
            size: 0,
            downloaded_at: None,
        }
    }
}
