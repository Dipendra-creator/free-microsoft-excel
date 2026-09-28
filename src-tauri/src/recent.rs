//! Recently opened files, persisted as JSON in the app config directory.

use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

const MAX_ENTRIES: usize = 50;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct Entry {
    path: String,
    #[serde(default)]
    pinned: bool,
    #[serde(default)]
    last_opened: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RecentItem {
    pub path: String,
    pub name: String,
    pub folder: String,
    pub pinned: bool,
    pub last_opened: i64,
    /// File modification time (ms since epoch), 0 when unavailable.
    pub modified: i64,
    pub exists: bool,
}

pub struct RecentStore {
    file: PathBuf,
    entries: Vec<Entry>,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn same_path(a: &str, b: &str) -> bool {
    // Windows paths are case-insensitive
    a.replace('/', "\\").eq_ignore_ascii_case(&b.replace('/', "\\"))
}

impl RecentStore {
    pub fn load(dir: &Path) -> RecentStore {
        let file = dir.join("recent.json");
        let entries = fs::read(&file)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        RecentStore { file, entries }
    }

    fn persist(&self) {
        if let Some(parent) = self.file.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_vec_pretty(&self.entries) {
            let _ = fs::write(&self.file, json);
        }
    }

    pub fn touch(&mut self, path: &str) {
        let pinned = self
            .entries
            .iter()
            .find(|e| same_path(&e.path, path))
            .map(|e| e.pinned)
            .unwrap_or(false);
        self.entries.retain(|e| !same_path(&e.path, path));
        self.entries.insert(
            0,
            Entry {
                path: path.to_string(),
                pinned,
                last_opened: now_ms(),
            },
        );
        // Keep pinned entries even beyond the limit
        let mut unpinned = 0;
        self.entries.retain(|e| {
            if e.pinned {
                return true;
            }
            unpinned += 1;
            unpinned <= MAX_ENTRIES
        });
        self.persist();
    }

    pub fn set_pinned(&mut self, path: &str, pinned: bool) {
        for e in self.entries.iter_mut() {
            if same_path(&e.path, path) {
                e.pinned = pinned;
            }
        }
        self.persist();
    }

    pub fn remove(&mut self, path: &str) {
        self.entries.retain(|e| !same_path(&e.path, path));
        self.persist();
    }

    pub fn clear_unpinned(&mut self) {
        self.entries.retain(|e| e.pinned);
        self.persist();
    }

    pub fn list(&self) -> Vec<RecentItem> {
        self.entries
            .iter()
            .map(|e| {
                let path = Path::new(&e.path);
                let meta = fs::metadata(path).ok();
                let modified = meta
                    .as_ref()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);
                RecentItem {
                    path: e.path.clone(),
                    name: path
                        .file_name()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_else(|| e.path.clone()),
                    folder: path
                        .parent()
                        .and_then(|p| p.file_name())
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default(),
                    pinned: e.pinned,
                    last_opened: e.last_opened,
                    modified,
                    exists: meta.is_some(),
                }
            })
            .collect()
    }
}
