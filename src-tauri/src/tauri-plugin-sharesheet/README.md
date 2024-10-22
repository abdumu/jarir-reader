Share content to other apps via the Android Sharesheet or iOS Share Pane.

## Install

_This plugin requires a Rust version of at least **1.65**_

There are three general methods of installation that we can recommend.

1. Use crates.io and npm (easiest, and requires you to trust that our publishing pipeline worked)
2. Pull sources directly from Github using git tags / revision hashes (most secure)
3. Git submodule install this repo in your tauri project and then use file protocol to ingest the source (most secure, but inconvenient to use)

Install the Core plugin by adding the following to your `Cargo.toml` file:

`src-tauri/Cargo.toml`

```toml
[dependencies]
tauri-plugin-sharesheet = "0.0.1"
  # alternatively with Git:
tauri-plugin-sharesheet = { git = "https://github.com/buildyourwebapp/tauri-plugin-sharesheet" }
```

You can install the JavaScript Guest bindings using your preferred JavaScript package manager:

> Note: Since most JavaScript package managers are unable to install packages from git monorepos we provide read-only mirrors of each plugin. This makes installation option 2 more ergonomic to use.

<!-- Add the branch for installations using git! -->

```sh
pnpm add @buildyourwebapp/tauri-plugin-sharesheet
# or
npm add @buildyourwebapp/tauri-plugin-sharesheet
# or
yarn add @buildyourwebapp/tauri-plugin-sharesheet

# alternatively with Git:
pnpm add https://github.com/buildyourwebapp/tauri-plugin-sharesheet
# or
npm add https://github.com/buildyourwebapp/tauri-plugin-sharesheet
# or
yarn add https://github.com/buildyourwebapp/tauri-plugin-sharesheet
```

## Usage

First you need to register the core plugin with Tauri:

`src-tauri/src/main.rs`

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sharesheet::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Afterwards all the plugin's APIs are available through the JavaScript guest bindings:

```javascript
import { shareText } from "@buildyourwebapp/tauri-plugin-sharesheet";
shareText('Tauri is great!');
```

## Contributing

PRs accepted. Please make sure to read the Contributing Guide before making a pull request.

## License

MIT or APACHE-2.0