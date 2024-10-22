use crate::backend::audio::book_audio_generator;
use crate::backend::book::Book;
use crate::backend::cross_platform::get_app_data_path;
use crate::backend::epub::book_epub_generator;
use crate::backend::helpers::get_book_index;
use std::path::PathBuf;
use thiserror::Error;
use tokio::fs::rename;

#[derive(Debug, Error)]
pub enum BookGeneratorError {
    #[error("Failed to parse info JSON file")]
    ParseError,
    #[error("File type {0} is not supported yet")]
    UnsupportedFileType(String),
    #[error("IO Error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Tokio Join Error: {0}")]
    JoinError(#[from] tokio::task::JoinError),
}

pub async fn book_generator(book: Book) -> Result<PathBuf, BookGeneratorError> {
    let info: serde_json::Value =
        get_book_index(&book.id, "info").ok_or(BookGeneratorError::ParseError)?;

    let book_type = info["type"].as_str().unwrap_or_default();

    match book_type {
        "mp3" => {
            let res = book_audio_generator(book, Some(info)).await;
            Ok(res.unwrap())
        }
        "pdf" => {
            let new_path = get_app_data_path(Some("books"))
                .join(format!(
                    "{}.{}",
                    book.title,
                    info["r#type"].as_str().unwrap_or_default()
                ));
            let old_path = get_app_data_path(Some("books"))
                .join(&book.id)
                .join("Text")
                .join("DATA.DATA");

            rename(old_path, &new_path).await?;
            Ok(new_path)
        }
        "epub" => {
            let res = book_epub_generator(book, Some(info)).await;
            Ok(res.unwrap())
        }
        _ => Err(BookGeneratorError::UnsupportedFileType(
            book_type.to_string(),
        )),
    }
}
