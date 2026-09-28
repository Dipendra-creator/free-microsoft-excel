//! User preferences persisted in the app config directory.

use std::{fs, path::{Path, PathBuf}};

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// "dark" | "light" | "system"
    pub theme: String,
    pub default_font: String,
    pub default_font_size: i32,
    pub sheets_in_new_workbook: u32,
    /// Display name; initials are derived from it.
    pub user_name: String,
    pub show_start_screen: bool,
    /// None = automatic (by region).
    pub day_first: Option<bool>,
    /// Keep "00501" and 16+ digit numbers as text instead of damaging them.
    pub preserve_literals: bool,
    /// Write a UTF-8 BOM in CSV/TXT files so Excel reads accents correctly.
    pub csv_bom: bool,
    /// AutoRecover snapshot delay in seconds (0 = off).
    pub autorecover_seconds: u32,
    /// Previous versions kept per file when saving (0 = off).
    pub keep_versions: u32,
    /// Look for a new version of Sheets in the background.
    pub check_updates: bool,
    /// Version that last ran (to say "Updated to …" once after an update).
    pub last_version: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: "dark".to_string(),
            default_font: "Aptos Narrow".to_string(),
            default_font_size: 11,
            sheets_in_new_workbook: 1,
            user_name: default_user_name(),
            show_start_screen: true,
            day_first: None,
            preserve_literals: true,
            csv_bom: true,
            autorecover_seconds: 30,
            keep_versions: 20,
            check_updates: true,
            last_version: String::new(),
        }
    }
}

fn default_user_name() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "User".to_string())
}

pub fn initials(name: &str) -> String {
    let parts: Vec<&str> = name.split_whitespace().collect();
    let letters: String = match parts.as_slice() {
        [] => "U".to_string(),
        [one] => one.chars().take(2).collect(),
        [first, .., last] => first
            .chars()
            .take(1)
            .chain(last.chars().take(1))
            .collect(),
    };
    letters.to_uppercase()
}

pub struct SettingsStore {
    file: PathBuf,
    pub value: Settings,
}

impl SettingsStore {
    pub fn load(dir: &Path) -> SettingsStore {
        let file = dir.join("settings.json");
        let value = fs::read(&file)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        SettingsStore { file, value }
    }

    pub fn save(&self) {
        if let Some(parent) = self.file.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_vec_pretty(&self.value) {
            let _ = fs::write(&self.file, json);
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn initials() {
        assert_eq!(super::initials("Dipendra Bisht"), "DB");
        assert_eq!(super::initials("dipus"), "DI");
        assert_eq!(super::initials(""), "U");
    }
}
