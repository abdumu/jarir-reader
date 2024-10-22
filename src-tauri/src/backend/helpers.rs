use crate::backend::cross_platform::get_app_data_path;
use rand::Rng;
use regex::Regex;
use serde_json::Value;
use std::fs;

pub fn uuid() -> String {
    rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(16)
        .map(char::from)
        .collect()
}

pub fn random_company() -> &'static str {
    let items = [
        "Google Nexus 6",
        "Google Pixel 2",
        "Google Pixel 3",
        "Google Pixel 4",
        "Google Pixel 5",
        "Google Pixel 6",
        "Google Pixel 7",
        "Google Pixel 8",
        "Samsung Note 4",
        "Samsung Galaxy S9",
        "Samsung Galaxy S10",
        "Samsung Galaxy S20",
        "Samsung Galaxy S21",
        "Samsung Galaxy S22",
        "Samsung Galaxy S23",
        "Samsung Galaxy Note 20",
        "OnePlus 7",
        "OnePlus 8",
        "OnePlus 9",
        "OnePlus 10",
        "OnePlus 11",
    ];
    items[rand::thread_rng().gen_range(0..items.len())]
}

pub fn logout_from_app() -> Result<bool, std::io::Error> {
    let settings_path = get_app_data_path(Some("settings.json"));
    let books_path = get_app_data_path(Some("books"));

    if settings_path.exists() {
        fs::remove_file(&settings_path)?;
    }

    if books_path.exists() {
        fs::remove_dir_all(&books_path)?;
    }

    Ok(!settings_path.exists() && !books_path.exists())
}

pub fn get_settings(item: Option<&str>) -> Option<Value> {
    let settings_path = get_app_data_path(Some("settings.json"));

    if settings_path.exists() {
        let data = fs::read_to_string(settings_path).ok()?;
        if let Ok(json) = serde_json::from_str::<Value>(&data) {
            return item.map_or(Some(json.clone()), |key| json.get(key).cloned());
        }
    }
    Some(Value::Null)
}

pub fn set_settings(new_settings: Value) -> Result<(), std::io::Error> {
    let settings_path = get_app_data_path(Some("settings.json"));
    // println!("jrr| Settings path: {:?}", settings_path);

    let mut data = get_settings(None).unwrap_or_else(|| serde_json::json!({}));
    // println!("jrr| Current settings data: {:?}", data);

    if data.is_null() {
        data = serde_json::json!({});
    }

    if let Some(new_obj) = new_settings.as_object() {
        if let Some(obj) = data.as_object_mut() {
            for (key, value) in new_obj {
                obj.insert(key.clone(), value.clone());
            }
        }
    } else {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "jrr| new_settings must be a JSON object",
        ));
    }

    if let Some(parent) = settings_path.parent() {
        if !parent.exists() {
            // println!("jrr| Creating parent directory: {:?}", parent);
            fs::create_dir_all(parent)?;
        }
    }

    let serialized_data = serde_json::to_string(&data)?;
    // println!("jrr| Serialized settings data: {}", serialized_data);

    fs::write(&settings_path, serialized_data)?;
    // println!("jrr| Settings saved successfully to {:?}", settings_path);

    Ok(())
}

pub fn clear_residue(book_id: &str) -> Result<(), std::io::Error> {
    let path = get_app_data_path(Some("books")).join(book_id);
    if path.with_extension("zip").exists() {
        fs::remove_file(path.with_extension("zip"))?;
    }
    if path.with_extension("zip.body").exists() {
        fs::remove_file(path.with_extension("zip.body"))?;
    }
    if path.exists() {
        fs::remove_dir_all(path)?;
    }
    Ok(())
}

pub fn nl2br(str: &str, rtl: bool) -> String {
    str.split('\n')
        .map(|line| {
            if line.trim().is_empty() {
                "\n".to_string()
            } else {
                format!(
                    "<p{}>{}</p>",
                    if rtl { " style=\"direction:rtl\"" } else { "" },
                    line
                )
            }
        })
        .collect::<Vec<_>>()
        .join("")
}

pub fn get_book_index(book_id: &str, item: &str) -> Option<Value> {
    let path = get_app_data_path(Some("books"))
        .join(book_id)
        .join("Index")
        .join(format!("{}.json", item));

    let json = fs::read_to_string(path).ok()?;
    serde_json::from_str(&json).ok()
}

pub fn clean_filename(text: &str, replace_with: &str) -> String {
    let replace = replace_with.chars().next().unwrap_or('-');
    let re = Regex::new(r#"[/?<>\\:*|"\x00-\x1f\x80-\x9f\s]+"#).unwrap();
    let sanitized = re
        .replace_all(text, replace.to_string().as_str())
        .to_string();
    sanitized.trim_matches(replace).chars().take(255).collect()
}

pub fn compare_versions(tag_name: &str, current_version: &str) -> bool {
    let tag_parts: Vec<_> = tag_name.split('.').collect();
    let current_parts: Vec<_> = current_version.split('.').collect();

    for (tag, current) in tag_parts.iter().zip(current_parts.iter()) {
        let tag_num: u32 = tag.parse().unwrap();
        let current_num: u32 = current.parse().unwrap();

        if current_num < tag_num {
            return true;
        } else if current_num > tag_num {
            return false;
        }
    }

    false
}
