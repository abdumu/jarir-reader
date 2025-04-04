use crate::backend::book::Book;
use crate::backend::cross_platform::get_app_data_path;
use base64::{engine::general_purpose, DecodeError, Engine as _};
use flate2::read::ZlibDecoder;
use openssl::error::ErrorStack;
use openssl::sha::Sha1;
use openssl::symm::{Cipher, Crypter, Mode};
use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Cursor, Read, Write};
use std::iter::Iterator;
use std::path::Path;
use std::str;
use thiserror::Error;
use zip::ZipArchive;

#[derive(Debug, Error)]
pub enum DecryptError {
    #[error("IO Error: {0}")]
    IoError(#[from] io::Error),
    #[error("Decryption Error: {0}")]
    DecryptionError(String),
    //add errorStack
    #[error("Error Stack: {0}")]
    ErrorStack(#[from] ErrorStack),
}

struct RC4 {
    s: [u8; 256],
    i: usize,
    j: usize,
}

impl RC4 {
    fn new() -> Self {
        RC4 {
            s: [0; 256],
            i: 0,
            j: 0,
        }
    }

    fn set_key(&mut self, key: &[u8]) {
        let key_length = key.len();
        for i in 0..256 {
            self.s[i] = i as u8;
        }
        let mut j = 0;
        for i in 0..256 {
            j = (j + self.s[i] as usize + key[i % key_length] as usize) % 256;
            self.swap(i, j);
        }
    }

    fn decrypt(&mut self, data: &[u8]) -> Vec<u8> {
        let mut result = Vec::with_capacity(data.len());
        for &byte in data {
            self.i = (self.i + 1) % 256;
            self.j = (self.j + self.s[self.i] as usize) % 256;
            self.swap(self.i, self.j);
            let k = self.s[(self.s[self.i] as usize + self.s[self.j] as usize) % 256];
            result.push(byte ^ k);
        }
        result
    }

    fn swap(&mut self, i: usize, j: usize) {
        self.s.swap(i, j);
    }
}

pub async fn read_book_info(book_file: &Path) -> Result<serde_json::Value, DecryptError> {
    let file = File::open(book_file)?;
    let mut archive = ZipArchive::new(file).map_err(|e| DecryptError::IoError(e.into()))?;
    let mut info = serde_json::json!({ "formatVersion": 5 });
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| DecryptError::IoError(e.into()))?;
        if file.name() == "Index/info.json" {
            let mut contents = String::new();
            file.read_to_string(&mut contents)?;
            drop(file);
            info = serde_json::from_str(&contents).unwrap_or_default();
            break;
        }
    }
    Ok(info)
}

pub async fn unzip_book(book: Book) -> Result<Book, DecryptError> {
    let output_folder = get_app_data_path(Some("books")).join(book.id.clone());
    if !output_folder.with_extension("zip").exists() {
        return Err(DecryptError::IoError(io::Error::new(
            io::ErrorKind::NotFound,
            format!("file doesn't exist: {}.zip", output_folder.display()),
        )));
    }

    let file_stat = fs::metadata(output_folder.with_extension("zip"))?;
    if file_stat.len() == 0 {
        fs::remove_file(output_folder.with_extension("zip"))?;
        return Err(DecryptError::IoError(io::Error::new(
            io::ErrorKind::InvalidData,
            "Downloaded file is corrupted, try again!",
        )));
    }

    let book_info = read_book_info(&output_folder.with_extension("zip")).await?;
    if !output_folder.exists() {
        fs::create_dir_all(&output_folder)?;
    }

    let file = File::open(output_folder.with_extension("zip"))?;
    let mut archive = ZipArchive::new(file).map_err(|e| DecryptError::IoError(e.into()))?;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| DecryptError::IoError(e.into()))?;
        let out_path = output_folder.join(file.name());
        if file.is_file() {
            let parent_dir = out_path.parent().ok_or_else(|| {
                DecryptError::IoError(io::Error::new(io::ErrorKind::Other, "Invalid file path"))
            })?;
            fs::create_dir_all(parent_dir)?;

            let mut buffer = Vec::new();
            file.read_to_end(&mut buffer)?;
            drop(file);
            fs::write(&out_path, buffer)?;
            if ["DATA", "dat"].contains(
                &out_path
                    .extension()
                    .unwrap_or_default()
                    .to_str()
                    .unwrap_or_default(),
            ) {
                decrypt_binary(&out_path, &book.key)?;
            } else if out_path.extension().unwrap_or_default() == "html"
                || (book_info["formatVersion"].as_u64().unwrap_or(5) >= 10
                    && ["json", "spans"].contains(
                        &out_path
                            .extension()
                            .unwrap_or_default()
                            .to_str()
                            .unwrap_or_default(),
                    )
                    && out_path.file_name().unwrap_or_default() != "info.json")
            {
                decrypt_text(&out_path, &book.key).map_err(|e| {
                    println!("Decryption failed: {:?}", e);
                    DecryptError::DecryptionError(format!("Decryption failed: {:?}", e))
                })?;
            }
        }
    }

    Ok(book)
}

fn decrypt_binary(file: &Path, x_key: &[i32]) -> Result<(), DecryptError> {
    let key: Vec<u8> = x_key.iter().map(|&b| b as u8).collect();
    let encrypted_data = fs::read(file)?;
    let mut cipher = RC4::new();
    cipher.set_key(&key);
    let decrypted_data = cipher.decrypt(&encrypted_data);
    fs::write(file, decrypted_data)?;
    Ok(())
}

fn decrypt_text(file: &Path, xkey: &[i32]) -> Result<(), Box<dyn std::error::Error>> {
    let key: Vec<u8> = xkey.iter().map(|&b| b as u8).collect();
    let encrypted_data = fs::read(file)?;
    let mut rc4 = RC4::new();
    rc4.set_key(&key);
    let temp_file_path = {
        let mut temp_path = file.to_path_buf();
        if let Some(file_name) = temp_path.file_name() {
            temp_path.set_file_name(format!("{}_x", file_name.to_string_lossy()));
        }
        temp_path
    };
    let mut temp_file = BufWriter::new(File::create(&temp_file_path)?);
    for chunk in encrypted_data.chunks(1024) {
        let decrypted_chunk = rc4.decrypt(chunk);
        temp_file.write_all(&decrypted_chunk)?;
    }
    temp_file.flush()?;
    let temp_file = BufReader::new(File::open(&temp_file_path)?);
    let mut decoder = ZlibDecoder::new(temp_file);
    let mut decompressed_data = Vec::new();
    decoder.read_to_end(&mut decompressed_data)?;
    let mut decompressed_str = String::from_utf8_lossy(&decompressed_data).into_owned();
    let problematic_chars = ["\u{FFFC}"]; // Unicode replacement character
    for &char in &problematic_chars {
        decompressed_str = decompressed_str.replace(char, "\n");
    }
    fs::write(file, decompressed_str)?;
    Ok(())
}
pub async fn combine_zip(
    book_file: &Path,
    header_hash: &str,
    user_access_token: &str,
    file_path: &Path,
) -> Result<Option<Vec<i32>>, DecryptError> {
    let header = decrypt_header(header_hash, user_access_token).map_err(|e| {
        println!("Decryption failed: {:?}", e);
        DecryptError::DecryptionError(format!("Decryption failed: {:?}", e))
    })?;

    let body = get_bytes(File::open(book_file)?).map_err(DecryptError::IoError)?;
    let header_key = append_files(&header, &body, file_path).map_err(|e| {
        println!("Error: {:?}", e);
        DecryptError::IoError(io::Error::new(io::ErrorKind::Other, e.to_string()))
    })?;

    Ok(header_key)
}

fn sha1_hash(input: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(input.as_bytes());
    let result = hasher.finish();
    convert_to_hex(result.as_ref())
}

fn convert_to_hex(bytes: &[u8]) -> String {
    let mut hex_string = String::new();
    for &byte in bytes {
        let high_nibble = (byte >> 4) & 0x0F;
        let low_nibble = byte & 0x0F;
        for nibble in [high_nibble, low_nibble] {
            hex_string.push(if nibble <= 9 {
                (nibble + b'0') as char
            } else {
                (nibble - 10 + b'a') as char
            });
        }
    }
    hex_string
}

fn decrypt_header(input: &str, user_access_token: &str) -> Result<Vec<u8>, ErrorStack> {
    let sha1 = sha1_hash(&(user_access_token.to_string() + "platform"));
    let key = if sha1.len() > 32 { &sha1[..32] } else { &sha1 };

    let decode = base64_decode(input).expect("Failed to decode base64");
    let iv = b"1234567812345678";
    let cipher = Cipher::aes_256_cbc();
    let mut decrypter = Crypter::new(cipher, Mode::Decrypt, key.as_bytes(), Some(iv))?;
    let mut decrypted = vec![0; decode.len() + cipher.block_size()];
    let mut count = decrypter.update(&decode, &mut decrypted)?;
    count += decrypter.finalize(&mut decrypted[count..])?;
    decrypted.truncate(count);
    Ok(decrypted)
}

fn get_bytes(mut input_stream: impl Read) -> io::Result<Vec<u8>> {
    let mut buffer = [0; 8192];
    let mut byte_array_output_stream = Vec::new();

    loop {
        let read = input_stream.read(&mut buffer)?;
        if read != 0 {
            byte_array_output_stream.extend_from_slice(&buffer[..read]);
        } else {
            break;
        }
    }

    Ok(byte_array_output_stream)
}

fn append_files(
    b_arr: &[u8],
    b_arr2: &[u8],
    output_path: &Path,
) -> Result<Option<Vec<i32>>, Box<dyn std::error::Error>> {
    let mut byte_array_output_stream = Vec::new();
    byte_array_output_stream.extend_from_slice(b_arr);
    byte_array_output_stream.extend_from_slice(b_arr2);

    let cursor = Cursor::new(byte_array_output_stream);
    let mut zip_input_stream = ZipArchive::new(cursor)?;

    let mut buffer = [0; 8192];
    let mut m_header_key: Option<Vec<i32>> = None;

    for i in 0..zip_input_stream.len() {
        let mut file = zip_input_stream.by_index(i)?;
        let name = file.name().to_string();

        if name == "header" {
            m_header_key = Some(
                get_bytes(&mut file)?[..]
                    .iter()
                    .map(|&b| b as i32)
                    .collect::<Vec<i32>>(),
            );
        }

        if name == "body" {
            let mut file_output_stream = File::create(output_path)?;
            loop {
                let read = file.read(&mut buffer)?;
                if read == 0 {
                    break;
                }
                file_output_stream.write_all(&buffer[..read])?;
            }
        }
    }

    Ok(m_header_key)
}

pub fn base64_decode(input: &str) -> Result<Vec<u8>, DecodeError> {
    general_purpose::STANDARD.decode(input)
}

pub fn base64_encode(input: &[u8]) -> String {
    general_purpose::STANDARD.encode(input)
}