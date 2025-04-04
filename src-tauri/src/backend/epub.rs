use crate::backend::book::Book;
use crate::backend::cross_platform::get_app_data_path;
use crate::backend::decrypt::{base64_decode, base64_encode};
use crate::backend::helpers::{clean_filename, nl2br, uuid};
use crate::backend::transliteration::transliterate;
use epub_builder::{EpubBuilder, EpubContent, ReferenceType, ZipLibrary};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::path::PathBuf;

pub async fn book_epub_generator(
    book: Book,
    info: Option<serde_json::Value>,
) -> Result<PathBuf, String> {
    let temp_dir = get_app_data_path(Some("temp"));
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }

    let output_path =
        get_app_data_path(Some("books")).join(format!("{}.epub", clean_filename(&book.title, "-")));

    let zip = ZipLibrary::new().map_err(|e| e.to_string())?;
    let mut builder = EpubBuilder::new(zip).map_err(|e| e.to_string())?;

    builder
        .metadata("title", &book.title)
        .map_err(|e| e.to_string())?;

    builder
        .metadata("author", book.authors.join(", "))
        .map_err(|e| e.to_string())?;

    builder
        .metadata(
            "lang", // Changed from "language" to "lang"
            info.as_ref()
                .and_then(|i| i.get("language"))
                .and_then(|l| l.as_str())
                .unwrap_or("ar"),
        )
        .map_err(|e| e.to_string())?;

    builder.epub_version(epub_builder::EpubVersion::V30);
    // builder.inline_toc();

    if let Some(cover) = &book.cover {
        let cover_data = if Url::parse(cover).is_ok() {
            let response = reqwest::get(cover).await.map_err(|e| e.to_string())?;
            response.bytes().await.map_err(|e| e.to_string())?.to_vec()
        } else {
            fs::read(cover).map_err(|e| e.to_string())?
        };
        builder
            .add_cover_image("cover.jpg", &cover_data[..], "image/jpeg")
            .map_err(|e| e.to_string())?;
        let cover_page = format!(
            "<html><body><img src='data:image/jpeg;base64, {}' alt='Cover'/></body></html>",
            base64_encode(&cover_data[..])
        );
        builder
            .add_content(
                EpubContent::new("cover.xhtml", cover_page.as_bytes())
                    .reftype(ReferenceType::Cover),
            )
            .map_err(|e| e.to_string())?;
    }

    let css = r#"
        .center { text-align: center; }
        .poetry-right { text-align: right; margin-left: 20px; }
        .poetry-left { text-align: left; margin-right: 20px; }
        .quran { font-family: 'Amiri', 'Traditional Arabic', serif; color: #006400; }
        blockquote { margin: 1.5em 10px; padding: 0.5em 10px; border-left: 3px solid #ccc; color: #666;; }
        code { font-family: monospace; background-color: #f4f4f4; padding: 2px 4px; border-radius: 4px; }
        u { text-decoration: underline; }
        sup { vertical-align: super; }
        sub { vertical-align: sub; }
        body {text-align: right; font-family: 'Amiri', 'Traditional Arabic', serif; color: #000; }
        h1 { font-size: 2em; }
        h2 { font-size: 1.5em; }
        h3 { font-size: 1.2em; }
        h4 { font-size: 1.1em; }
        h5 { font-size: 1em; }
        h6 { font-size: 0.9em; }
        p { margin: 1em 0; }
        small { font-size: 0.8em; }
        img { max-width: 100%; height: auto; }
    "#;

    builder
        .stylesheet(css.as_bytes())
        .map_err(|e| e.to_string())?;

    let content = parse_chapter(&book, &info).await?;

    for chapter in content.iter() {
        builder
            .add_content(
                EpubContent::new(chapter.filename.clone(), chapter.data.as_bytes())
                    .title(&chapter.title)
                    .reftype(ReferenceType::Text),
            )
            .map_err(|e| e.to_string())?;
    }

    let images_dir = get_app_data_path(Some("books"))
        .join(&book.id)
        .join("Images");
    if images_dir.exists() {
        for entry in fs::read_dir(images_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_file() {
                let image_data = fs::read(&path).map_err(|e| e.to_string())?;
                let image_id = format!("Images/{}", path.file_name().unwrap().to_str().unwrap());
                builder
                    .add_resource(&image_id, &image_data[..], "image/jpeg")
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    let nav_page = format!(
        r#"<html><head><title>{}</title></head><body><nav epub:type='toc'><ol>{}</ol></nav></body></html>"#,
        "TOC",
        content
            .iter()
            .map(|chapter| {
                format!(
                    "<li><a href=\"{}\">{}</a></li>",
                    chapter.filename, chapter.title
                )
            })
            .collect::<String>()
    );
    builder
        .add_content(
            EpubContent::new("nav.xhtml", nav_page.as_bytes())
                .reftype(ReferenceType::Toc),
        )
        .map_err(|e| e.to_string())?;

    let mut output_file = File::create(&output_path).map_err(|e| e.to_string())?;
    builder
        .generate(&mut output_file)
        .map_err(|e| e.to_string())?;

    Ok(output_path)
}

#[derive(Debug, Serialize, Deserialize)]
struct Chapter {
    title: String,
    data: String,
    filename: String,
}

async fn parse_chapter(
    book: &Book,
    info: &Option<serde_json::Value>,
) -> Result<Vec<Chapter>, String> {
    let mut content = Vec::new();
    let mut total_offset = 0;

    let chapters = info
        .as_ref()
        .and_then(|i| i.get("chapters"))
        .and_then(|c| c.as_u64())
        .unwrap_or(0);

    for index in 1..=chapters {
        let chapter_path = get_app_data_path(Some("books"))
            .join(&book.id)
            .join("Text")
            .join(format!("chapter-{:03}.html", index));
        let spans_path = get_app_data_path(Some("books"))
            .join(&book.id)
            .join("Text")
            .join(format!("chapter-{:03}.html.spans", index));
        let toc_path = get_app_data_path(Some("books"))
            .join(&book.id)
            .join("Index")
            .join("toc.json");

        if !chapter_path.exists() {
            return Err(format!("Chapter file does not exist: {:?}", chapter_path));
        }

        if !spans_path.exists() {
            return Err(format!("Spans file does not exist: {:?}", spans_path));
        }

        if !toc_path.exists() {
            return Err(format!("TOC file does not exist: {:?}", toc_path));
        }

        let text = fs::read_to_string(&chapter_path).map_err(|e| e.to_string())?;

        let mut spans_bytes = fs::read(&spans_path).map_err(|e| e.to_string())?;
        if spans_bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
            spans_bytes = spans_bytes[3..].to_vec();
        }
        let spans =
            String::from_utf8(spans_bytes).map_err(|e| format!("Invalid UTF-8 in spans: {}", e))?;

        let toc_bytes = fs::read(&toc_path).map_err(|e| e.to_string())?;
        let toc = match String::from_utf8(toc_bytes) {
            Ok(toc_str) => serde_json::from_str::<Vec<TocEntry>>(&toc_str).unwrap_or_default(),
            Err(e) => return Err(format!("Failed to read TOC file as UTF-8: {}", e)),
        };

        let spans: Vec<Vec<serde_json::Value>> = serde_json::from_str(&spans).unwrap_or_default();

        let last_offset = total_offset;
        total_offset += text.chars().count();
        let chapter_title = get_chapter_title(last_offset, total_offset, &toc);
        let chapter_filename = if chapter_title != "---" {
            format!(
                "chapter-{}-{}",
                index,
                transliterate(&chapter_title).replace(" ", "-")
            )
        } else {
            format!("chapter-{}-{}", index, uuid())
        };
        let language = info
            .as_ref()
            .and_then(|i| i.get("language"))
            .and_then(|l| l.as_str())
            .unwrap_or("en")
            .to_string();

        let chapter_data = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE html>
            <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
            <head>
                <meta charset="UTF-8" />
                <title>{}</title>
                <link rel="stylesheet" type="text/css" href="../stylesheet.css" />
            </head>
            <body dir="{}">{}</body>
            </html>"#,
            chapter_title,
            if language.eq("ar") { "rtl" } else { "ltr" },
            nl2br(&parse_span(&text, &spans), language.eq("en") == false)
        );
        content.push(Chapter {
            title: chapter_title,
            data: chapter_data,
            filename: chapter_filename,
        });
    }

    let language = info
        .as_ref()
        .and_then(|i| i.get("language"))
        .and_then(|l| l.as_str())
        .unwrap_or("en")
        .to_string();

    let last_chapter_text = "KNiq2YXYqikKCi0tLS0tLS0tLS0KCjEtINmH2LDYpyDYp9mE2YPYqtin2Kgg2KrZhSDYp9i12K/Yp9ix2Ycg2YjYp9mG2KrYp9is2Ycg2YTZgtin2LHYpiDYrNix2YrYsS/YsdmB2YjZgSDZiNmK2YXZhti5INmF2YbYudin2Ysg2KjYp9iq2KfZiyDZhti02LHZhyDYqNiv2YjZhiDYp9iw2YYg2K7Yt9mKINmF2YYg2LTYsdmD2Kkg2KzYsdmK2LEv2LHZgdmI2YEuCjItINin2LDYpyDZgtmF2Kog2KjZhti02LEg2KfZhNmD2KrYp9ioINmB2KPZhtmDINiq2YPZiNmGINmC2K8g2KfZgtiq2LHZgdiqINiu2LfYoyDZgtin2YbZiNmG2YrYp9mLINmK2KzYsdmF2Ycg2KfZhNmC2KfZhtmI2YYg2YjZitit2YIg2YTYtNix2YPYqSDYrNix2YrYsS/YsdmB2YjZgSDZhdmC2KfYttin2KrZgyDZiNmF2YTYp9it2YLYqtmDINmC2KfZhtmI2YbZitin2YsuCjMtINmE2Kcg2YrYqtit2YXZhCDZhdi32YjYsSDYo9iv2KfYqSDYp9mE2YXYrdmI2YQg2KfZhNiw2Yog2KrZhSDYqNmH2Kcg2KfYs9iq2K7Ysdin2Kwg2KfZhNmD2KrYp9ioINij2Yog2KrYqNi52KfYqiDZgtin2YbZiNmG2YrYqSDYqtit2K/YqyDZhdmGINij2Yog2YHYsdivINin2Ygg2YXYpNiz2LPYqSDYo9mIINis2YfYqSDYo9mKINmD2KfZhiDZhtmI2LnZh9inINiq2YLZiNmFINio2YHYudmEINi62YrYsSDZgtin2YbZiNmKINio2KfZhNin2K/Yp9ipINmD2YbYtNixINin2YTZg9iq2Kgg2K/ZiNmGINin2LDZhiDZhdmGINi02LHZg9ipINis2LHZitixL9ix2YHZiNmBLgo0LSDYo9mGINmG2LTYsdmDINmE2YfYsNinINin2YTZg9iq2KfYqCDZhNi12YrYutipINin2K7YsdmJINi52KjYsSDYp9mE2KfYr9in2Kkg2YfZiiDZhNin2LLYp9mE2Kkg2KfZhNiv2Yog2KfYsSDYp9mFINmI2KfZhNmC2LHYp9ih2Kkg2KjYsdin2K3YqSDYudmE2Ykg2KfZiiDYudin2LHYtiDYp9iu2LHZiSDZhNmDINi02K7YtdmK2Kcg2YjZhNin2YrYudi32YrZgyDYp9mE2K3ZgiDYqNmG2LTYsSDYp9mE2YPYqtin2Kgg2YjZhNinINiq2YjYstmK2LnZhy4KOTktIERvIG5vdCBzaGFyZSwgc2VsbCwgYW5kL29yIGRpc3RyaWJ1dGUgdGhpcyBjb3B5cmlnaHRlZCBtYXRlcmlhbCEgQnkgdmlvbGF0aW5nIHRoZXNlIHRlcm1zLCB5b3UgYXJlIHN1YmplY3RlZCB0byBsZWdhbCBwcm9jZWVkaW5ncyBhZ2FpbnN0IHlvdSBieSBKYXJpci9SdWZvb2YgY29tcGFueSBhbmQgd2UgKHRvb2wgZGV2ZWxvcGVyKSBhcmUgbm90IHJlc3BvbnNpYmxlIGJ5IGFueSBtZWFucyBieSB5b3VyIGZvdWwgYWN0aW9ucy5vdXIgcGVyc29uYWwgdXNlIG9ubHkgYW5kIHRoYXQgeW8iCgoKLS0tLS0tLS0tLQ==";
    let last_chapter_text = String::from_utf8(base64_decode(last_chapter_text).unwrap())
        .map_err(|e| format!("Invalid UTF-8 in copyright: {}", e))?;
    let last_chapter_string = last_chapter_text.as_str();

    content.push(Chapter {
        title: if language.eq("ar") {
            "حقوق الناشر".to_string()
        } else {
            "Copyrights".to_string()
        },
        filename: "copyrights".to_string(),
        data: nl2br(
            &parse_span(
                last_chapter_string,
                &[vec![
                    serde_json::json!(0),
                    serde_json::json!(5),
                    serde_json::json!(0),
                ]],
            ),
            true,
        ),
    });

    Ok(content)
}

#[derive(Debug, Serialize, Deserialize)]
struct TocEntry {
    offset: usize,
    title: String,
}

fn parse_span(text: &str, spans: &[Vec<serde_json::Value>]) -> String {
    let mut result = String::new();
    let mut last_end = 0;

    let mut sorted_spans = tidy_spans(spans);
    sorted_spans.sort_by_key(|a| a[0].as_u64().unwrap());

    for el in &sorted_spans {
        let start = el[0].as_u64().unwrap() as usize;
        let end = el[1].as_u64().unwrap() as usize;

        if start > last_end {
            let unformatted = text
                .chars()
                .skip(last_end)
                .take(start - last_end)
                .collect::<String>();
            result.push_str(&unformatted);
        }

        let snippet = text
            .chars()
            .skip(start)
            .take(end - start)
            .collect::<String>();
        let mut changed_snippet = snippet.clone();

        let block_types = [2, 4, 9, 10, 11, 12, 102, 104];
        let inline_types = [0, 1, 3, 5, 6, 7, 8, 100, 101];

        let types = el[2].as_array().unwrap();
        let main_block_type = types.iter().find(|t| {
            if let Some(id) = t.as_u64() {
                block_types.contains(&id)
            } else {
                false
            }
        });
        let inline_types: Vec<_> = types
            .iter()
            .filter(|t| {
                if let Some(id) = t.as_u64() {
                    inline_types.contains(&id)
                } else {
                    false
                }
            })
            .collect();

        for inline_type in inline_types {
            match inline_type.as_u64().unwrap() {
                0 => changed_snippet = format!("<strong>{}</strong>", changed_snippet),
                1 => changed_snippet = format!("<em>{}</em>", changed_snippet),
                3 => changed_snippet = format!("<small>{}</small>", changed_snippet),
                5 => changed_snippet = format!("<code>{}</code>", changed_snippet),
                6 => changed_snippet = format!("<u>{}</u>", changed_snippet),
                7 => changed_snippet = format!("<sup>{}</sup>", changed_snippet),
                8 => changed_snippet = format!("<sub>{}</sub>", changed_snippet),
                100 => {
                    changed_snippet = format!(
                        "<span style=\"color:{}\">{}</span>",
                        el[3].as_str().unwrap_or(""),
                        changed_snippet
                    )
                }
                101 => {
                    changed_snippet = format!(
                        "<a href=\"{}\">{}</a>",
                        el[3].as_str().unwrap_or(""),
                        changed_snippet
                    )
                }
                _ => println!("Warning: Unsupported inline type_id {}", inline_type),
            }
        }

        if let Some(block_type) = main_block_type {
            match block_type.as_u64().unwrap() {
                104 => {
                    if let Some(img_path_str) = el[3].as_str() {
                        let img_path = format!("./{}", img_path_str.trim_start_matches("/").trim_start_matches("./"));
                        changed_snippet = format!("<img src=\"{}\">", img_path);
                    }
                }
                id => {
                    let (tag, default_class) = match id {
                        2 => ("h3", None),
                        4 => ("blockquote", None),
                        9 => ("div", Some("poetry-right")),
                        10 => ("div", Some("poetry-left")),
                        11 => ("p", Some("center")),
                        12 => ("div", Some("quran")),
                        102 => ("h1", None),
                        _ => ("p", None),
                    };
                    let mut classes = Vec::new();
                    if let Some(class) = default_class {
                        classes.push(class);
                    }
                    if id != 11 && types.iter().any(|t| t.as_u64() == Some(11)) {
                        classes.push("center");
                    }
                    let class_attr = if !classes.is_empty() {
                        format!(" class=\"{}\"", classes.join(" "))
                    } else {
                        String::new()
                    };
                    changed_snippet = format!(
                        "<{}{}>{}</{}>",
                        tag, class_attr, changed_snippet, tag
                    );
                }
            }
        }

        result.push_str(&changed_snippet);
        last_end = end;
    }

    if last_end < text.chars().count() {
        let remaining = text.chars().skip(last_end).collect::<String>();
        result.push_str(&remaining);
    }

    result
}

fn tidy_spans(spans: &[Vec<serde_json::Value>]) -> Vec<Vec<serde_json::Value>> {
    let mut spans = spans.to_vec();
    spans.sort_by_key(|a| a[0].as_u64().unwrap());

    let mut ob = std::collections::HashMap::new();
    for el in spans {
        let key = format!("{}-{}", el[0], el[1]);
        let entry = ob.entry(key).or_insert_with(|| {
            vec![
                el[0].clone(),
                el[1].clone(),
                serde_json::json!([]),
                serde_json::json!(null),
            ]
        });
        entry[2].as_array_mut().unwrap().push(el[2].clone());

        if el.len() > 3 {
            entry[3] = el[3].clone();
        }
    }

    ob.into_values().collect()
}

fn get_chapter_title(offset_start: usize, offset_end: usize, toc: &[TocEntry]) -> String {
    for el in toc {
        if el.offset >= offset_start && el.offset <= offset_end {
            return el.title.clone();
        }
    }
    "---".to_string()
}
