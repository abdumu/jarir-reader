use crate::backend::book::Book;
use crate::backend::book_generator::book_generator;
use crate::backend::cross_platform::get_app_data_path;
use crate::backend::decrypt::{combine_zip, unzip_book};
use crate::backend::helpers::{
    clear_residue, compare_versions, get_settings, logout_from_app, random_company, set_settings,
};
use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use openssl::sha::Sha1;
use rand::Rng;
use reqwest::header::HOST;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::fs::File;
use std::io::Write;
use std::option::Option;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Settings {
    pub initial_token: Option<String>,
    pub expires: Option<u64>,
    pub email: Option<String>,
    pub password: Option<String>,
    pub auth: Option<String>,
    pub username: Option<String>,
    pub device_name: Option<String>,
    pub device_uid: Option<String>,
    pub books: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResult {
    pub username: String,
    pub auth: String,
    pub device_name: String,
    pub device_uid: String,
    pub app_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadInfo {
    pub url: String,
    pub header: String,
}

fn get_base_url(app_type: &str) -> String {
    if app_type == "rufoof" {
        return "api.rufoof.com".to_string();
    }
    "api.jarirreader.com".to_string()
}

fn nonce() -> String {
    let mut rng = rand::thread_rng();
    let mut sb = String::with_capacity(64);
    for _ in 0..64 {
        sb.push_str(&rng.gen_range(0..10).to_string());
    }
    sb
}

#[derive(Debug, Clone, Copy)]
enum Operation {
    MULTIPLY,
    DIVIDE,
    #[allow(dead_code)]
    ADD,
    #[allow(dead_code)]
    SUBTRACT,
    #[allow(dead_code)]
    MODULE,
}

fn generate_secret() -> String {
    const COMPOSITION_LOCAL_MAP_KEY: i32 = 202;
    const PROVIDER_MAPS_KEY: i32 = 204;

    let left_operands: Vec<i32> = vec![
        17,
        106,
        COMPOSITION_LOCAL_MAP_KEY,
        PROVIDER_MAPS_KEY,
        106,
        PROVIDER_MAPS_KEY,
        96,
        106,
        33,
        96,
        25,
        17,
        49,
        33,
        27,
        33,
        13,
        194,
        7,
        25,
        106,
        106,
        19,
        13,
        25,
        5,
        13,
        COMPOSITION_LOCAL_MAP_KEY,
        200,
        49,
        96,
        28,
    ];
    let right_operands: Vec<i32> = vec![
        3, 2, 2, 2, 2, 2, 2, 2, 3, 2, 2, 3, 2, 3, 2, 3, 4, 2, 7, 2, 2, 2, 3, 4, 2, 11, 4, 2, 2, 2,
        2, 2,
    ];
    let operations: Vec<Operation> = vec![
        Operation::MULTIPLY,
        Operation::DIVIDE,
        Operation::DIVIDE,
        Operation::DIVIDE,
        Operation::DIVIDE,
        Operation::DIVIDE,
        Operation::DIVIDE,
        Operation::DIVIDE,
        Operation::MULTIPLY,
        Operation::DIVIDE,
        Operation::MULTIPLY,
        Operation::MULTIPLY,
        Operation::MULTIPLY,
        Operation::MULTIPLY,
        Operation::MULTIPLY,
        Operation::MULTIPLY,
        Operation::MULTIPLY,
        Operation::DIVIDE,
        Operation::MULTIPLY,
        Operation::MULTIPLY,
        Operation::DIVIDE,
        Operation::DIVIDE,
        Operation::MULTIPLY,
        Operation::MULTIPLY,
        Operation::MULTIPLY,
        Operation::MULTIPLY,
        Operation::MULTIPLY,
        Operation::DIVIDE,
        Operation::DIVIDE,
        Operation::MULTIPLY,
        Operation::DIVIDE,
        Operation::MULTIPLY,
    ];

    let mut secret = String::new();
    for i in 0..operations.len() {
        let left = left_operands[i];
        let right = right_operands[i];
        let op = operations[i];
        let result = match op {
            Operation::MULTIPLY => left * right,
            Operation::DIVIDE => left / right,
            Operation::ADD => left + right,
            Operation::SUBTRACT => left - right,
            Operation::MODULE => left % right,
        };
        secret.push(std::char::from_u32(result as u32).unwrap_or('\0'));
    }
    secret
}

fn byte_array_to_hex_string(bytes: &[u8]) -> String {
    bytes.iter().fold(String::new(), |mut result, &byte| {
        let hex = format!("{:x}", (byte as u16) + 256);
        result.push_str(&hex[1..]);
        result
    })
}

fn checksum(time: u64, nonce: &str) -> String {
    let secret = generate_secret();
    // println!("Generated secret: {:?}", secret);

    let string = format!("{}{}{}", time, nonce, secret);
    // println!("Checksum input: {}", string);

    let mut hasher = Sha1::new();
    hasher.update(string.as_bytes());
    let result = hasher.finish();

    let hex_result = byte_array_to_hex_string(&result);
    // println!("Calculated checksum: {}", hex_result);

    hex_result
}

fn request_time() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

fn get_request_check() -> String {
    let request_nonce = nonce();
    let request_time = request_time();
    // println!("Nonce: {}, Time: {}", request_nonce, request_time);
    let checksum = checksum(request_time, &request_nonce);

    let json = json!({
        "nonce": request_nonce,
        "checksum": checksum,
        "timestamp": request_time.to_string(),
        "platform": "android"
    });

    // println!("Request JSON: {}", json.to_string());

    let encoded = general_purpose::STANDARD_NO_PAD.encode(json.to_string().as_bytes());
    // println!("Request check: {}", encoded);
    encoded
}

pub async fn get_initial_auth(client: &Client) -> Result<(String, u64), String> {
    let settings = get_settings(None).unwrap_or_default();

    let app_type = settings
        .get("app")
        .and_then(|v| v.as_str())
        .unwrap_or("jarir");

    if let Some(settings) = settings.get("initial_token").and_then(|v| v.as_object()) {
        if let (Some(initial_token), Some(expires)) = (
            settings.get("initial_token").and_then(|v| v.as_str()),
            settings.get("expires").and_then(|v| v.as_u64()),
        ) {
            return Ok((initial_token.to_string(), expires));
        }
    }

    let response = client
        .post(format!("https://{}/v7/login/token", get_base_url(app_type)))
        .form(&[
            ("grant_type", "client_credentials"),
            ("client_secret", "cfb6113dfb4ccba4da7fd18c4dd8da6d"),
            ("client_id", "accounts_manager"),
            ("platform", &"android".to_string()),
        ])
        .header("X-Request-Check", get_request_check())
        .header(HOST, get_base_url(app_type))
        .send()
        .await
        .map_err(|e| {
            format!(
                "(502) Could not retrieve initial access token! \n error: {}",
                e
            )
        })?;

    let response_text = response.text().await.map_err(|e| {
        format!(
            "(502) Could not retrieve initial access token text! \n error: {}",
            e
        )
    })?;

    // println!("Token response: {}", response_text);

    let response_data: HashMap<String, serde_json::Value> = serde_json::from_str(&response_text)
        .map_err(|e| {
            format!(
                "(502) Could not parse initial access token JSON! \n error: {} \n text: {}",
                e, response_text
            )
        })?;

    if let (Some(access_token), Some(expires_in)) = (
        response_data.get("access_token").and_then(|v| v.as_str()),
        response_data.get("expires_in").and_then(|v| v.as_u64()),
    ) {
        return Ok((access_token.to_string(), expires_in));
    }

    Err("(501) Could not retrieve initial access token!".to_string())
}

pub async fn pre_auth(client: &Client) -> Result<bool, String> {
    let settings = get_settings(None).unwrap_or_default();
    if settings.get("auth").is_some() || settings.get("initial_token").is_some() {
        auth(client, None, None, None).await.map(|_| true)
    } else {
        Ok(false)
    }
}

pub async fn auth(
    client: &Client,
    email: Option<&str>,
    password: Option<&str>,
    app_type: Option<&str>,
) -> Result<AuthResult, String> {
    let settings = get_settings(None).unwrap_or_default();
    if let Some(auth) = settings.get("auth").and_then(|v| v.as_str()) {
        if let Some(expires) = settings.get("expires").and_then(|v| v.as_u64()) {
            if expires > Utc::now().timestamp() as u64 {
                return Ok(AuthResult {
                    username: settings
                        .get("username")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    auth: auth.to_string(),
                    device_name: settings
                        .get("device_name")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    device_uid: settings
                        .get("device_uid")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    app_type: settings
                        .get("app")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                });
            }
        }
    }

    let email = email.unwrap_or(
        settings
            .get("email")
            .and_then(|v| v.as_str())
            .unwrap_or_default(),
    );
    let password = password.unwrap_or(
        settings
            .get("password")
            .and_then(|v| v.as_str())
            .unwrap_or_default(),
    );
    let app_type = app_type.unwrap_or(
        settings
            .get("app")
            .and_then(|v| v.as_str())
            .unwrap_or("jarir"),
    );
    if email.is_empty() || password.is_empty() {
        return Err("(505z) Can not login! empty username or password!".to_string());
    }

    let (initial_token, expires) = get_initial_auth(client).await?;

    let uuid = Uuid::new_v4().to_string();
    let device_uid = settings
        .get("device_uid")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or(uuid);
    let device_name = settings
        .get("device_name")
        .and_then(|v| v.as_str())
        .unwrap_or_else(|| random_company());

    let response = client
        .post(format!("https://{}/v7/login/login", get_base_url(app_type)))
        .form(&[
            ("access_token", &initial_token.to_string()),
            ("deviceUID", &device_uid.to_string()),
            ("appId", &"1".to_string()),
            ("email", &email.to_string()),
            ("deviceName", &device_name.to_string()),
            ("password", &password.to_string()),
            ("prev_access_token", &"x_access".to_string()),
            ("platform", &"android".to_string()),
        ])
        .header("X-Request-Check", get_request_check())
        .header(HOST, get_base_url(app_type))
        .send()
        .await
        .map_err(|e| format!("(505y) Can not login! check your info! \nerror: {}", e))?;

    let response_text = response
        .text()
        .await
        .map_err(|e| format!("(505x) Cannot read response text! \nerror: {}", e))?;

    // println!("Auth response text: {}", response_text);

    let response_data: HashMap<String, serde_json::Value> = serde_json::from_str(&response_text)
        .map_err(|e| {
            format!(
                "(505x) Can not parse login response! \nerror: {} \ntext: {}",
                e, response_text
            )
        })?;

    if let Some(result) = response_data.get("result") {
        let username = result
            .get("user")
            .and_then(|u| u.get("fullName").or_else(|| u.get("nickname")))
            .and_then(|n| n.as_str())
            .unwrap_or_default()
            .to_string();

        let auth = result
            .get("access_token")
            .and_then(|a| a.as_str())
            .unwrap_or_default()
            .to_string();

        let new_settings = json!({
            "app": app_type,
            "initial_token": initial_token.clone(),
            "expires": expires,
            "email": email,
            "password": password,
            "auth": auth.clone(),
            "username": username.clone(),
            "device_name": device_name.to_string(),
            "device_uid": device_uid.clone().to_string(),
        });
        set_settings(new_settings).expect("Could not save settings");

        return Ok(AuthResult {
            username,
            auth,
            device_name: device_name.to_string(),
            device_uid: device_uid.clone().to_string(),
            app_type: app_type.to_string(),
        });
    }

    Err("(505t) Can not login! check your info! \nerror: null data".to_string())
}

pub async fn get_user_books(client: &Client) -> Result<Vec<Book>, String> {
    let settings = get_settings(None).unwrap_or_default();
    let app_type = settings
        .get("app")
        .and_then(|v| v.as_str())
        .unwrap_or("jarir");
    let mut cached_books: HashMap<String, Book> = HashMap::new();

    if let Some(books) = settings.get("books").and_then(|v| v.as_object()) {
        if let Some(cached_at) = books.get("cached_at").and_then(|v| v.as_u64()) {
            let cached_at_seconds = cached_at / 1000;
            let current_time = Utc::now().timestamp() as u64;

            if cached_at_seconds > current_time - 18000 {
                if let Some(items) = books.get("items").and_then(|v| v.as_array()) {
                    let result: Vec<Book> = items
                        .iter()
                        .map(|item| {
                            let mut book = Book::default();
                            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                                book.id = id.to_string();
                            }
                            if let Some(title) = item.get("title").and_then(|v| v.as_str()) {
                                book.title = title.to_string();
                            }
                            if let Some(url) = item.get("url").and_then(|v| v.as_str()) {
                                book.url = url.to_string();
                            }
                            if let Some(book_type) = item.get("type").and_then(|v| v.as_str()) {
                                book.book_type = book_type.to_string();
                            }
                            if let Some(publisher) = item.get("publisher").and_then(|v| v.as_str())
                            {
                                book.publisher = publisher.to_string();
                            }
                            if let Some(authors) = item.get("authors").and_then(|v| v.as_array()) {
                                book.authors = authors
                                    .iter()
                                    .filter_map(|a| a.as_str().map(|s| s.to_string()))
                                    .collect();
                            }
                            if let Some(cover) = item.get("cover").and_then(|v| v.as_str()) {
                                book.cover = Some(cover.to_string());
                            }
                            if let Some(thumb) = item.get("thumb").and_then(|v| v.as_str()) {
                                book.thumb = Some(thumb.to_string());
                            }
                            if let Some(book_path) = item.get("book_path").and_then(|v| v.as_str())
                            {
                                book.book_path = Some(book_path.to_string());
                            }
                            if let Some(name) = item.get("name").and_then(|v| v.as_str()) {
                                book.name = name.to_string();
                            }
                            if let Some(access) = item.get("access").and_then(|v| v.as_i64()) {
                                book.access = access != 0;
                            }
                            if let Some(file_md5) = item.get("file_md5").and_then(|v| v.as_str()) {
                                book.file_md5 = file_md5.to_string();
                            }
                            if let Some(header) = item.get("header").and_then(|v| v.as_str()) {
                                book.header = header.to_string();
                            }
                            if let Some(key) = item.get("key").and_then(|v| v.as_array()) {
                                book.key = key
                                    .iter()
                                    .filter_map(|k| k.as_i64().map(|i| i as i32))
                                    .collect();
                            }
                            if let Some(file_id) = item.get("file_id").and_then(|v| v.as_str()) {
                                book.file_id = file_id.to_string();
                            }
                            if let Some(latest_file_id) =
                                item.get("latest_file_id").and_then(|v| v.as_str())
                            {
                                book.latest_file_id = latest_file_id.to_string();
                            }
                            if let Some(size) = item.get("size").and_then(|v| v.as_u64()) {
                                book.size = size;
                            }
                            if let Some(downloaded_at) =
                                item.get("downloaded_at").and_then(|v| v.as_u64())
                            {
                                book.downloaded_at = Some(downloaded_at);
                            }
                            if let Some(book_path) = item.get("book_path").and_then(|v| v.as_str())
                            {
                                book.book_path = Some(book_path.to_string());
                            }
                            book
                        })
                        .collect();

                    return Ok(result);
                }
            } else if let Some(items) = books.get("items").and_then(|v| v.as_array()) {
                for item in items {
                    let mut book = Book::default();
                    if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                        book.id = id.to_string();
                    }
                    if let Some(book_path) = item.get("book_path").and_then(|v| v.as_str()) {
                        book.book_path = Some(book_path.to_string());
                        if let Some(downloaded_at) =
                            item.get("downloaded_at").and_then(|v| v.as_u64())
                        {
                            book.downloaded_at = Some(downloaded_at);
                        }
                        cached_books.insert(book.id.clone(), book);
                    }
                }
            }
        }
    }

    let auth_result = auth(
        client,
        settings.get("email").and_then(|v| v.as_str()),
        settings.get("password").and_then(|v| v.as_str()),
        Some(app_type),
    )
    .await?;
    let response = client
        .post(format!(
            "https://{}/v7/books/get-user-books",
            get_base_url(app_type)
        ))
        .form(&[
            ("access_token", &auth_result.auth),
            ("platform", &"android".to_string()),
            ("deviceName", &auth_result.device_name),
            ("deviceUID", &auth_result.device_uid),
        ])
        .header("X-Request-Check", get_request_check())
        .header(HOST, get_base_url(app_type))
        .send()
        .await
        .map_err(|e| {
            format!(
                "(601) There was a problem retrieving the books list! => {}",
                e
            )
        })?;

    let response_data: HashMap<String, serde_json::Value> = response.json().await.map_err(|e| {
        format!(
            "(601-1) There was a problem retrieving the books list! => {}",
            e
        )
    })?;
    if let Some(result) = response_data.get("result") {
        let books: Vec<Book> = result
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .map(|item| {
                let mut book = Book {
                    id: item
                        .get("book_id")
                        .and_then(|v| v.as_u64())
                        .unwrap_or_default()
                        .to_string(),
                    title: item
                        .get("title")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    name: item
                        .get("title")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    url: item
                        .get("book_file_url")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    publisher: "جرير للنشر".to_string(),
                    authors: item
                        .get("authors_name")
                        .and_then(|v| v.as_array())
                        .unwrap_or(&vec![])
                        .iter()
                        .map(|a| a.as_str().unwrap_or_default().to_string())
                        .collect(),
                    cover: item
                        .get("cover_thumb_url")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    book_type: item
                        .get("file_type")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    thumb: item
                        .get("cover_thumb_url")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    access: item
                        .get("book_access")
                        .and_then(|v| v.as_u64())
                        .unwrap_or_default()
                        == 1,
                    file_md5: item
                        .get("book_file_md5")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    file_id: item
                        .get("bookfile_id")
                        .and_then(|v| v.as_u64())
                        .unwrap_or_default()
                        .to_string(),
                    latest_file_id: item
                        .get("latest_file_id")
                        .and_then(|v| v.as_u64())
                        .unwrap_or_default()
                        .to_string(),
                    size: item
                        .get("size")
                        .and_then(|v| v.as_u64())
                        .unwrap_or_default(),
                    book_path: None,
                    key: vec![],
                    header: "".to_string(),
                    downloaded_at: None,
                };

                if let Some(cached_book) = cached_books.get(&book.id) {
                    book.book_path = cached_book.book_path.clone();
                    book.downloaded_at = cached_book.downloaded_at;
                }

                book
            })
            .collect();

        let new_settings = json!({
            "books": {
                "cached_at": Utc::now().timestamp_millis() as u64,
                "items": books,
            },
        });
        set_settings(new_settings).expect("Could not save settings");
        return Ok(books);
    }

    Err("(600) There was a problem retrieving the books list! (empty api response)".to_string())
}

pub async fn get_download_info(client: &Client, book: &Book) -> Result<DownloadInfo, String> {
    let auth_result = auth(client, None, None, None).await?;

    let response = client
        .post(format!(
            "https://{}/v7/books/file/download",
            get_base_url(&auth_result.app_type)
        ))
        .form(&[
            ("access_token", &auth_result.auth),
            ("file_id", &book.file_id),
            ("platform", &"android".to_string()),
        ])
        .header("X-Request-Check", get_request_check())
        .header(HOST, get_base_url(&auth_result.app_type))
        .send()
        .await
        .map_err(|e| {
            format!(
                "(801) Could not get download info! check your info! \n error: {}",
                e
            )
        })?;

    let response_data: HashMap<String, serde_json::Value> = response.json().await.map_err(|e| {
        format!(
            "(801) Could not get download info! check your info! \n error: {}",
            e
        )
    })?;

    if let Some(result) = response_data.get("result") {
        let url = result
            .get("body")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let header = result
            .get("header")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        return Ok(DownloadInfo { url, header });
    }

    Err("(800) Could not get download info! check your info!".to_string())
}

pub async fn download_book(book: &Book) -> Result<Book, String> {
    let client = Client::new();
    let path = get_app_data_path(Some("books"));
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }

    let book_path = path.join(format!("{}.zip", book.id));
    let mut book_path_write = book_path.clone();
    if book.url.ends_with(".body") && !book.header.is_empty() {
        book_path_write.set_extension("zip.body");
    }

    let mut file = File::create(&book_path_write).map_err(|e| format!("(702) {}", e))?;
    let response = client
        .get(&book.url)
        .send()
        .await
        .map_err(|e| format!("(702-1) {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "(702-2) Failed to download book: {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("(702-3) {}", e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("(702-4) {}", e))?;

    if book_path_write.exists() {
        if book.url.ends_with(".body") && !book.header.is_empty() {
            let access_token = get_settings(Some("auth")).unwrap();
            let header_key = combine_zip(
                &book_path_write,
                &book.header,
                access_token.as_str().unwrap_or_default(),
                &book_path,
            )
            .await
            .map_err(|e| format!("(702-5) {}", e))?;

            return Ok(Book {
                book_path: Some(book_path.to_string_lossy().into_owned()),
                key: header_key.clone().unwrap_or_default(),
                ..book.clone()
            });
        }

        return Ok(Book {
            book_path: Some(book_path.to_string_lossy().into_owned()),
            ..book.clone()
        });
    }

    Err("(702-6) File was not created successfully".to_string())
}

pub async fn download_and_generate_book(client: &Client, book_id: &str) -> Result<String, String> {
    let user_books = get_user_books(client).await?.clone();
    let book = user_books
        .iter()
        .find(|b| b.id == book_id)
        .ok_or_else(|| {
            let books_list: Vec<(String, String)> = user_books
                .iter()
                .map(|b| (b.id.clone(), b.name.clone()))
                .collect();
            format!(
                "(701) Book with id {} not found. Available books: {:?}",
                book_id, books_list
            )
        })?
        .clone();
    let download_info = get_download_info(client, &book).await?;

    let download_info_header = download_info.header.clone();
    let download_info_url = download_info.url.clone();

    let downloaded_book = download_book(&Book {
        url: download_info.url,
        header: download_info.header,
        ..book.clone()
    })
    .await?;

    let downloaded_book_key = downloaded_book.key.clone();

    let unzipped_book = tokio::task::spawn_blocking(move || {
        unzip_book(Book {
            book_path: downloaded_book.book_path,
            key: downloaded_book.key,
            ..book.clone()
        })
    })
    .await
    .map_err(|e| format!("(701-1) {}", e))?
    .await
    .map_err(|e| format!("(701-2) {}", e))?;

    let generated_book = book_generator(unzipped_book)
        .await
        .map_err(|e| format!("(701-3) {}", e))?;

    let downloaded_at = Utc::now().timestamp() as u64;

    let settings = get_settings(None).unwrap_or_default();
    if let Some(books) = settings.get("books").and_then(|v| v.as_object()) {
        if let Some(items) = books.get("items").and_then(|v| v.as_array()) {
            let new_items: Vec<serde_json::Value> = items
                .iter()
                .map(|item| {
                    if item.get("id").and_then(|v| v.as_str()).unwrap_or_default() == book_id {
                        let mut new_item = item.clone();
                        new_item["book_path"] =
                            serde_json::Value::String(generated_book.display().to_string());
                        new_item["downloaded_at"] = serde_json::Value::Number(downloaded_at.into());
                        new_item["url"] = serde_json::Value::String(download_info_url.clone());
                        new_item["header"] =
                            serde_json::Value::String(download_info_header.clone());
                        new_item["key"] = serde_json::Value::Array(
                            downloaded_book_key
                                .iter()
                                .map(|k| serde_json::Value::Number((*k).into()))
                                .collect(),
                        );

                        return new_item;
                    }
                    item.clone()
                })
                .collect();
            let new_books = json!({
                "cached_at": books.get("cached_at").and_then(|v| v.as_u64()).unwrap_or_default(),
                "items": new_items,
            });
            let new_settings = json!({
                "books": new_books,
            });
            set_settings(new_settings).expect("Could not save settings");
        }
    }

    clear_residue(book_id).expect("Could not clear residue");
    Ok(generated_book.display().to_string())
}

pub async fn logout(client: &Client) -> Result<bool, String> {
    let settings = get_settings(None).unwrap_or_default();
    if settings.is_null()
        || settings.as_object().map_or(true, |obj| obj.is_empty())
        || settings.get("auth").is_none()
    {
        return Ok(true);
    }
    let app_type = settings
        .get("app")
        .and_then(|v| v.as_str())
        .unwrap_or("jarir");
    let params = json!({
        "access_token": settings.get("auth").unwrap_or(&serde_json::Value::Null),
        "deviceUID": settings.get("deviceUID").unwrap_or(&serde_json::Value::Null),
        "appId": "1",
        "platform": "android",
    });

    let response = client
        .post(format!("https://{}/v7/logout", get_base_url(app_type)))
        .json(&params)
        .header("X-Request-Check", get_request_check())
        .header(HOST, get_base_url(app_type))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await;

    logout_from_app().expect("TODO: panic message");

    match response {
        Ok(resp) => {
            let response_data: HashMap<String, serde_json::Value> = resp
                .json()
                .await
                .map_err(|e| format!("(503) Could not logout! check your info! \n error: {}", e))?;
            if response_data.contains_key("result") {
                Ok(response_data["result"].as_bool().unwrap_or(false))
            } else {
                Err("(503) Could not logout! check your info!".to_string())
            }
        }
        Err(error) => Err(format!(
            "(504) Could not logout! check your info! \n error: {}",
            error
        )),
    }
}

pub async fn check_for_new_version(client: &Client) -> Result<serde_json::Value, String> {
    let response = client
        .get("https://api.github.com/repos/abdumu/jarir-reader/releases/latest")
        .send()
        .await
        .map_err(|e| format!("(901) Could not check for new version! \n error: {}", e))?;

    let response_data: HashMap<String, serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("(901) Could not check for new version! \n error: {}", e))?;

    if let (Some(tag_name), Some(name), Some(published_at)) = (
        response_data
            .get("tag_name")
            .and_then(|v| v.as_str())
            .map(|v| v.trim_start_matches("v")),
        response_data.get("name").and_then(|v| v.as_str()),
        response_data.get("published_at").and_then(|v| v.as_str()),
    ) {
        let current_version = env!("CARGO_PKG_VERSION");
        // println!("{} {}", tag_name, current_version);
        if compare_versions(tag_name, current_version) {
            return Ok(json!({
                "new_version": true,
                "name": name,
                "published_at": published_at
            }));
        }
    }

    Ok(json!({
        "new_version": false,
        "name": "",
        "published_at": ""
    }))
}
