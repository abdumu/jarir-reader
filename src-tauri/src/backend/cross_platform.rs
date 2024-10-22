use std::path::PathBuf;
use app_dirs2::{get_app_root, AppDataType, AppInfo};

const APP_INFO: AppInfo = AppInfo{name: "jreader", author: "abdumu"};

pub fn get_app_data_path(path: Option<&str>) -> PathBuf {
    let app_data_path = get_app_root(AppDataType::UserConfig, &APP_INFO).map_err(|e| {
        eprintln!("jrr| Error getting app data path: {:?}", e);
        e
    }).unwrap();

    //app_data_path is PathBuf
    if let Some(p) = path {
        app_data_path.join(p).to_path_buf()
    } else { 
        app_data_path
    }
}
