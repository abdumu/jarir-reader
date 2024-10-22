use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, USER_AGENT};
use reqwest::Client;
use reqwest::ClientBuilder;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::ShellExt;

mod backend;
use crate::backend::api_calls::{
    auth, check_for_new_version, download_and_generate_book, get_user_books, logout, pre_auth,
};
use crate::backend::book::Book;
use crate::backend::cross_platform::get_app_data_path;
use crate::backend::helpers::get_settings;

struct HttpClient(Client);

fn create_http_client() -> Client {
    let mut headers = HeaderMap::new();
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/x-www-form-urlencoded"),
    );
    headers.insert(USER_AGENT, HeaderValue::from_static("okhttp/4.3.1"));

    ClientBuilder::new()
        .default_headers(headers)
        .danger_accept_invalid_certs(true)
        .build()
        .unwrap()
}

#[tauri::command]
fn visit_book(app_handle: AppHandle, book_id: String) {
    app_handle
        .shell()
        .open(
            format!("https://jarirreader.com/book/{}/github-abdumu", book_id),
            None,
        )
        .unwrap();
}

#[tauri::command]
async fn download_book(state: State<'_, HttpClient>, book_id: String) -> Result<String, String> {
    let client = &state.0;
    download_and_generate_book(client, &book_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_book(app_handle: AppHandle, file_path: String) {
    app_handle.shell().open(&file_path, None).unwrap();
}

#[tauri::command]
async fn check_updates(state: State<'_, HttpClient>) -> Result<Value, String> {
    let client = &state.0;
    check_for_new_version(client)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_books(state: State<'_, HttpClient>) -> Result<Vec<Book>, String> {
    let client = &state.0;
    match get_user_books(client).await {
        Ok(books) => Ok(books),
        Err(e) => Err(e),
    }
}

#[tauri::command]
fn base_action(app_handle: AppHandle, action: String) {
    match action.as_str() {
        // "check_permissions" => {
        //     app_handle.file_permissions().check_permissions().unwrap();
        // }
        "close" => {
            app_handle.exit(0);
        }
        "folder" => {
            let book_path_root = get_app_data_path(Some("books"));
            let books_path = book_path_root.as_path();
            if books_path.exists() {
                app_handle
                    .shell()
                    .open(&*books_path.to_string_lossy(), None)
                    .unwrap();
            } else {
                let window = app_handle.get_webview_window("main").unwrap();
                window
                    .emit("custom-message", ("عفواً", "لم تقم بتحميل كتب بعد..."))
                    .unwrap();
            }
        }
        "devPage" => {
            app_handle
                .shell()
                .open("https://github.com/abdumu", None)
                .unwrap();
        }
        "BookPage" => {
            let app_type = get_settings(Some("app")).unwrap_or_else(|| {
                println!("No settings found for action: app_type");
                Value::Null
            });
            let app_type = app_type["type"].as_str().unwrap_or("jarir");
            let website = match app_type {
                "jarir" => "https://jarirreader.com",
                "rufoof" => "https://rufoof.com",
                _ => "https://jarirreader.com",
            };
            app_handle.shell().open(website, None).unwrap();
        }
        "TOS" => {
            let app_type = get_settings(Some("app")).unwrap_or_else(|| {
                println!("No settings found for action: app_type");
                Value::Null
            });
            let app_type = app_type["type"].as_str().unwrap_or("jarir");
            let website = match app_type {
                "jarir" => "https://jarirreader.com/site/tos",
                "rufoof" => "https://rufoof.com/privacy",
                _ => "https://jarirreader.com/site/tos",
            };
            app_handle.shell().open(website, None).unwrap();
        }
        _ => {}
    }
}

#[tauri::command]
async fn settings_action(action: String) -> Result<Value, String> {
    //if action == "os" return current os, android else desktop
    if action == "os" {
        #[cfg(target_os = "android")]
        return Ok(Value::String("android".to_string()));
        #[cfg(not(target_os = "android"))]
        return Ok(Value::String("desktop".to_string()));
    }

    let result = get_settings(Some(action.as_str())).unwrap_or_else(|| {
        println!("No settings found for action: {}", action);
        Value::Null
    });

    if result.is_null() {
        return Ok(Value::Null);
    }
    Ok(result)
}

#[tauri::command]
async fn auth_action(
    state: State<'_, HttpClient>,
    email: Option<String>,
    password: Option<String>,
    app_type: Option<String>,
) -> Result<(), String> {
    let client = &state.0;
    if email.is_none() || password.is_none() {
        return Err("كلمة المرور واسم المستخدم مطلوبين".to_string());
    }
    let result = auth(
        client,
        Some(&*email.unwrap()),
        Some(&*password.unwrap()),
        Some(&*app_type.unwrap_or("jarir".parse().unwrap())),
    )
    .await;
    match result {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn pre_auth_action(state: State<'_, HttpClient>) -> Result<bool, String> {
    let client = &state.0;
    pre_auth(client).await.map_err(|_| "false".to_string())
}

#[tauri::command]
async fn logout_action(state: State<'_, HttpClient>) -> Result<(), String> {
    let client = &state.0;
    logout(client).await.map(|_| ()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = create_http_client();
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(HttpClient(client))
        .invoke_handler(tauri::generate_handler![
            visit_book,
            download_book,
            open_book,
            base_action,
            settings_action,
            auth_action,
            pre_auth_action,
            logout_action,
            get_books,
            check_updates
        ]);

    #[cfg(mobile)]
    {
        builder = builder.plugin(tauri_plugin_sharesheet::init());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
