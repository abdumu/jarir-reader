use crate::backend::book::Book;
use crate::backend::cross_platform::get_app_data_path;
use crate::backend::helpers::{clean_filename, get_book_index};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::{self, rename, write};
use std::path::PathBuf;
use thiserror::Error;

// TODO: THIS IS NOT COMPLETE

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TocItem {
    title: String,
    length: usize,
}

#[derive(Debug, Error)]
pub enum BookAudioGeneratorError {
    #[error("IO Error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Serde JSON Error: {0}")]
    SerdeJsonError(#[from] serde_json::Error),
}
pub async fn book_audio_generator(
    book: Book,
    info: Option<Value>,
) -> Result<PathBuf, BookAudioGeneratorError> {
    let path = get_app_data_path(Some("books")).join(&book.title);
    if !path.exists() {
        fs::create_dir_all(&path)?;
    }

    let toc_value: Value = get_book_index(&book.id, "toc").unwrap_or_default();
    let toc: Vec<TocItem> = serde_json::from_value(toc_value).unwrap_or_default();
    let mut m3u8_list = Vec::new();

    let chapters = info
        .as_ref()
        .and_then(|i| i.get("chapters"))
        .and_then(|c| c.as_u64())
        .unwrap_or(0);

    for index in 1..=chapters {
        let index = index as usize;
        let current_toc_item = toc.get(index - 1).cloned().unwrap_or(TocItem {
            title: format!("chapter-{:02}", index),
            length: 0,
        });

        let filename = format!(
            "{}_{}_{}_{}.mp3",
            book.authors.join("+").replace("_", "-"),
            clean_filename(&book.title, " "),
            index,
            current_toc_item.title
        );

        let chapter_name = format!(
            "{} - {} - {}",
            book.authors.join("+").replace("_", "-"),
            clean_filename(&book.title, " "),
            current_toc_item.title
        );

        m3u8_list.push(M3u8Item {
            name: chapter_name,
            seconds: current_toc_item.length,
            path: clean_filename(&filename, " "),
        });

        let new_path = get_app_data_path(Some("books"))
            .join(clean_filename(&book.title, " "))
            .join(clean_filename(&filename, " "));

        let old_path = get_app_data_path(Some("books"))
            .join(&book.id)
            .join("Audio")
            .join(format!("chapter-{:03}.datx", index));

        if let Err(e) = rename(&old_path, &new_path) {
            return Err(BookAudioGeneratorError::IoError(e));
        }
    }

    let m3u8_filename = format!(
        "{}_{}_00_Playlist.m3u8",
        book.authors.join("+").replace("_", "-"),
        clean_filename(&book.title, " ")
    );

    let m3u8_path = get_app_data_path(Some("books"))
        .join(clean_filename(&book.title, " "))
        .join(clean_filename(&m3u8_filename, " "));

    let cover = info
        .as_ref()
        .and_then(|i| i.get("cover"))
        .and_then(|c| c.as_str().map(|s| s.to_string()));
    let m3u8_content = create_m3u8(&m3u8_list, cover.as_deref(), &book.authors.join("+"));
    write(&m3u8_path, m3u8_content)?;

    Ok(path)
}

#[derive(Debug, Serialize, Deserialize)]
struct M3u8Item {
    name: String,
    seconds: usize,
    path: String,
}

fn create_m3u8(list: &[M3u8Item], cover: Option<&str>, author: &str) -> String {
    let mut content = String::from("#EXTM3U\n#EXTENC: UTF-8");
    if let Some(cover) = cover {
        content.push_str(&format!("\n#EXTIMG:{}", cover));
    }
    if !author.is_empty() {
        content.push_str(&format!("\n#EXTALB:{}", author));
    }

    for file in list {
        content.push_str(&format!(
            "\n#EXTINF:{},{}\n{}",
            file.seconds, file.name, file.path
        ));
    }

    content
}
