//! AutoRecover and version history — the safety nets Excel users most often
//! find missing when it matters.
//!
//! * **Live snapshots.** Every workbook with unsaved changes (including ones
//!   that were never saved) is written to `recovery/live/<id>.xlsx` a few
//!   seconds after it changes. A clean save or close deletes the snapshot, so
//!   whatever is left in `live/` at startup belongs to a session that crashed;
//!   those files move to `recovery/crashed/` and are offered on the start page.
//! * **Unsaved workbooks.** Choosing "Don't Save" keeps the last state in
//!   `recovery/unsaved/` for 7 days ("Recover Unsaved Workbooks").
//! * **Version history.** Before a file is overwritten by Save, the previous
//!   copy is kept in `versions/<file key>/` (last N versions per file).

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

use crate::{error::AppResult, storage::write_atomic};

const UNSAVED_DAYS: u64 = 7;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn mtime_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SnapshotMeta {
    pub title: String,
    pub original_path: Option<String>,
    pub saved_at: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryItem {
    /// Full path of the snapshot (.xlsx).
    pub file: String,
    pub title: String,
    pub original_path: Option<String>,
    pub saved_at: u64,
    /// "crashed" | "unsaved"
    pub kind: String,
    pub size: u64,
}

struct Snap {
    seq: u64,
    at: Instant,
}

pub struct RecoveryStore {
    live: PathBuf,
    crashed: PathBuf,
    unsaved: PathBuf,
    snaps: Mutex<HashMap<String, Snap>>,
}

impl RecoveryStore {
    pub fn new(base: &Path) -> RecoveryStore {
        let root = base.join("recovery");
        let store = RecoveryStore {
            live: root.join("live"),
            crashed: root.join("crashed"),
            unsaved: root.join("unsaved"),
            snaps: Mutex::new(HashMap::new()),
        };
        for dir in [&store.live, &store.crashed, &store.unsaved] {
            let _ = fs::create_dir_all(dir);
        }
        store.adopt_leftovers();
        store.purge_unsaved();
        store
    }

    /// Snapshots left by a previous run mean that run ended abnormally.
    fn adopt_leftovers(&self) {
        let Ok(entries) = fs::read_dir(&self.live) else { return };
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name() {
                let _ = fs::rename(&path, self.crashed.join(name));
            }
        }
    }

    fn purge_unsaved(&self) {
        let limit = Duration::from_secs(UNSAVED_DAYS * 24 * 3600);
        let Ok(entries) = fs::read_dir(&self.unsaved) else { return };
        for entry in entries.flatten() {
            let old = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.elapsed().ok())
                .map(|age| age > limit)
                .unwrap_or(false);
            if old {
                let _ = fs::remove_file(entry.path());
            }
        }
    }

    /// True when a snapshot of `seq` is due (changed and older than `interval`).
    pub fn is_due(&self, id: &str, seq: u64, interval: Duration) -> bool {
        match self.snaps.lock().unwrap().get(id) {
            Some(s) => s.seq != seq && s.at.elapsed() >= interval,
            None => true,
        }
    }

    pub fn has_snapshot(&self, id: &str) -> bool {
        self.snaps.lock().unwrap().contains_key(id)
    }

    fn write_pair(dir: &Path, id: &str, meta: &SnapshotMeta, bytes: &[u8]) -> AppResult<()> {
        write_atomic(&dir.join(format!("{id}.xlsx")), bytes)?;
        let json = serde_json::to_vec(meta).unwrap_or_default();
        write_atomic(&dir.join(format!("{id}.json")), &json)?;
        Ok(())
    }

    pub fn write_live(&self, id: &str, seq: u64, meta: &SnapshotMeta, bytes: &[u8]) -> AppResult<()> {
        Self::write_pair(&self.live, id, meta, bytes)?;
        self.snaps.lock().unwrap().insert(id.to_string(), Snap { seq, at: Instant::now() });
        Ok(())
    }

    /// The workbook was saved or closed cleanly: its live snapshot is obsolete.
    pub fn discard_live(&self, id: &str) {
        if self.snaps.lock().unwrap().remove(id).is_some() {
            let _ = fs::remove_file(self.live.join(format!("{id}.xlsx")));
            let _ = fs::remove_file(self.live.join(format!("{id}.json")));
        }
    }

    /// Closed with "Don't Save": keep the last state for a few days.
    pub fn keep_unsaved(&self, id: &str, meta: &SnapshotMeta, bytes: &[u8]) {
        let _ = Self::write_pair(&self.unsaved, id, meta, bytes);
        self.discard_live(id);
    }

    pub fn list(&self) -> Vec<RecoveryItem> {
        let mut out = Vec::new();
        for (dir, kind) in [(&self.crashed, "crashed"), (&self.unsaved, "unsaved")] {
            let Ok(entries) = fs::read_dir(dir) else { continue };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e != "xlsx").unwrap_or(true) {
                    continue;
                }
                let meta: SnapshotMeta = fs::read(path.with_extension("json"))
                    .ok()
                    .and_then(|b| serde_json::from_slice(&b).ok())
                    .unwrap_or_default();
                let fs_meta = entry.metadata().ok();
                out.push(RecoveryItem {
                    file: path.to_string_lossy().to_string(),
                    title: if meta.title.is_empty() { "Workbook".into() } else { meta.title },
                    original_path: meta.original_path,
                    saved_at: if meta.saved_at > 0 {
                        meta.saved_at
                    } else {
                        fs_meta.as_ref().map(mtime_ms).unwrap_or(0)
                    },
                    kind: kind.to_string(),
                    size: fs_meta.map(|m| m.len()).unwrap_or(0),
                });
            }
        }
        out.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
        out
    }

    /// Only files inside the recovery folders may be opened or deleted.
    pub fn owns(&self, file: &Path) -> bool {
        let parent = file.parent().map(|p| p.to_path_buf()).unwrap_or_default();
        (parent == self.crashed || parent == self.unsaved)
            && file.extension().map(|e| e == "xlsx").unwrap_or(false)
    }

    pub fn remove_item(&self, file: &Path) {
        if self.owns(file) {
            let _ = fs::remove_file(file);
            let _ = fs::remove_file(file.with_extension("json"));
        }
    }

    /// Moves a recovered file to be the live snapshot of a new session, so it
    /// stays protected until the user saves it.
    pub fn adopt(&self, file: &Path, new_id: &str, seq: u64, meta: &SnapshotMeta) -> AppResult<()> {
        if !self.owns(file) {
            return Ok(());
        }
        let target = self.live.join(format!("{new_id}.xlsx"));
        if fs::rename(file, &target).is_err() {
            fs::copy(file, &target)?;
            let _ = fs::remove_file(file);
        }
        let _ = fs::remove_file(file.with_extension("json"));
        let json = serde_json::to_vec(meta).unwrap_or_default();
        write_atomic(&self.live.join(format!("{new_id}.json")), &json)?;
        self.snaps
            .lock()
            .unwrap()
            .insert(new_id.to_string(), Snap { seq, at: Instant::now() });
        Ok(())
    }
}

pub fn snapshot_meta(title: &str, original_path: Option<String>) -> SnapshotMeta {
    SnapshotMeta {
        title: title.to_string(),
        original_path,
        saved_at: now_ms(),
    }
}

// ----------------------------------------------------------------------
// Version history
// ----------------------------------------------------------------------

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VersionItem {
    pub file: String,
    /// When that version was written (ms since epoch).
    pub saved_at: u64,
    pub size: u64,
}

pub struct VersionStore {
    dir: PathBuf,
}

/// FNV-1a: stable across builds (unlike `DefaultHasher`), so folders keep
/// matching their files after an app update.
fn fnv1a(text: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in text.bytes() {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

impl VersionStore {
    pub fn new(base: &Path) -> VersionStore {
        let dir = base.join("versions");
        let _ = fs::create_dir_all(&dir);
        VersionStore { dir }
    }

    fn folder_for(&self, path: &Path) -> PathBuf {
        let key = path.to_string_lossy().to_lowercase();
        let stem: String = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default()
            .chars()
            .filter(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | ' '))
            .take(40)
            .collect();
        self.dir.join(format!("{}-{:016x}", stem.trim(), fnv1a(&key)))
    }

    /// Keeps the current content of `path` before it is overwritten.
    pub fn backup(&self, path: &Path, keep: usize) {
        if keep == 0 {
            return;
        }
        let Ok(meta) = fs::metadata(path) else { return };
        if !meta.is_file() {
            return;
        }
        let folder = self.folder_for(path);
        if fs::create_dir_all(&folder).is_err() {
            return;
        }
        let ext = path
            .extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_else(|| "xlsx".into());
        let stamp = match mtime_ms(&meta) {
            0 => now_ms(),
            t => t,
        };
        let target = folder.join(format!("{stamp}.{ext}"));
        if !target.exists() {
            let _ = fs::copy(path, &target);
        }
        let mut items = self.list(path);
        while items.len() > keep {
            if let Some(oldest) = items.pop() {
                let _ = fs::remove_file(oldest.file);
            }
        }
    }

    /// Versions of a file, newest first.
    pub fn list(&self, path: &Path) -> Vec<VersionItem> {
        let Ok(entries) = fs::read_dir(self.folder_for(path)) else {
            return vec![];
        };
        let mut out: Vec<VersionItem> = entries
            .flatten()
            .filter_map(|e| {
                let p = e.path();
                let stamp: u64 = p.file_stem()?.to_string_lossy().parse().ok()?;
                Some(VersionItem {
                    file: p.to_string_lossy().to_string(),
                    saved_at: stamp,
                    size: e.metadata().map(|m| m.len()).unwrap_or(0),
                })
            })
            .collect();
        out.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
        out
    }

    pub fn owns(&self, file: &Path) -> bool {
        file.starts_with(&self.dir)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sheets-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn crash_leftovers_are_offered() {
        let dir = temp_dir("recovery");
        {
            let store = RecoveryStore::new(&dir);
            store.write_live("abc", 1, &snapshot_meta("Budget", None), b"data").unwrap();
            // no clean shutdown: the store is simply dropped
        }
        let store = RecoveryStore::new(&dir);
        let items = store.list();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Budget");
        assert_eq!(items[0].kind, "crashed");
        let file = PathBuf::from(&items[0].file);
        store.adopt(&file, "new", 3, &snapshot_meta("Budget", None)).unwrap();
        assert!(store.list().is_empty());
        assert!(store.has_snapshot("new"));
        store.discard_live("new");
        assert!(!dir.join("recovery/live/new.xlsx").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn versions_are_pruned() {
        let dir = temp_dir("versions");
        let store = VersionStore::new(&dir);
        let file = dir.join("book.xlsx");
        for i in 0..5u8 {
            fs::write(&file, [i]).unwrap();
            // distinct timestamps
            let t = SystemTime::now() - Duration::from_secs(100 - i as u64);
            let f = fs::File::options().write(true).open(&file).unwrap();
            f.set_modified(t).unwrap();
            store.backup(&file, 3);
        }
        let list = store.list(&file);
        assert_eq!(list.len(), 3);
        assert_eq!(fs::read(&list[0].file).unwrap(), vec![4]);
        let _ = fs::remove_dir_all(&dir);
    }
}
