//! Application-wide state shared by all windows.

use std::{
    collections::HashMap,
    path::Path,
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, Mutex, RwLock,
    },
};

use crate::{
    engine::{ClipboardPayload, EngineConfig, Session},
    error::{AppError, AppResult},
    recent::RecentStore,
    recovery::{snapshot_meta, RecoveryStore, VersionStore},
    settings::{Settings, SettingsStore},
    storage::{FileStore, WorkbookStore},
    sync::{LocalOnly, SyncBackend},
    templates::{BuiltinTemplates, TemplateRegistry},
};

pub type SharedSession = Arc<Mutex<Session>>;

pub struct AppState {
    config: RwLock<EngineConfig>,
    sessions: Mutex<HashMap<String, SharedSession>>,
    /// window label -> workbook id
    windows: Mutex<HashMap<String, String>>,
    pub recent: Mutex<RecentStore>,
    pub settings: Mutex<SettingsStore>,
    pub templates: TemplateRegistry,
    pub store: Box<dyn WorkbookStore>,
    pub sync: Box<dyn SyncBackend>,
    pub clipboard: Mutex<Option<ClipboardPayload>>,
    book_counter: AtomicU32,
    /// File passed on the command line (e.g. "Open with").
    pub startup_file: Mutex<Option<String>>,
    pub recovery: RecoveryStore,
    pub versions: VersionStore,
}

/// Month-first dates are mostly used in the Americas; default by timezone.
fn day_first_for(tz: &str) -> bool {
    !tz.starts_with("America/") && tz != "Pacific/Honolulu"
}

fn detect_timezone() -> &'static str {
    let tz = iana_time_zone::get_timezone().unwrap_or_else(|_| "UTC".to_string());
    let known = ironcalc_base::get_all_timezones();
    if known.iter().any(|t| t == &tz) {
        Box::leak(tz.into_boxed_str())
    } else {
        "UTC"
    }
}

impl AppState {
    /// `config_dir` holds settings and the recent list, `data_dir` the
    /// AutoRecover snapshots and version history.
    pub fn new(config_dir: &Path, data_dir: &Path) -> AppState {
        let settings = SettingsStore::load(config_dir);
        let config = EngineConfig {
            locale: "en",
            timezone: detect_timezone(),
            language: "en",
            font_name: settings.value.default_font.clone(),
            font_size: settings.value.default_font_size,
            day_first: settings.value.day_first.unwrap_or_else(|| day_first_for(detect_timezone())),
            preserve_literals: settings.value.preserve_literals,
            csv_bom: settings.value.csv_bom,
        };
        let startup_file = std::env::args()
            .skip(1)
            .find(|a| !a.starts_with('-') && Path::new(a).is_file());
        AppState {
            config: RwLock::new(config),
            sessions: Mutex::new(HashMap::new()),
            windows: Mutex::new(HashMap::new()),
            recent: Mutex::new(RecentStore::load(config_dir)),
            settings: Mutex::new(settings),
            templates: TemplateRegistry::new(vec![Box::new(BuiltinTemplates)]),
            store: Box::new(FileStore),
            sync: Box::new(LocalOnly),
            clipboard: Mutex::new(None),
            book_counter: AtomicU32::new(0),
            startup_file: Mutex::new(startup_file),
            recovery: RecoveryStore::new(data_dir),
            versions: VersionStore::new(data_dir),
        }
    }

    pub fn config(&self) -> EngineConfig {
        self.config.read().unwrap().clone()
    }

    pub fn update_prefs(&self, settings: &Settings) {
        let mut cfg = self.config.write().unwrap();
        cfg.font_name = settings.default_font.clone();
        cfg.font_size = settings.default_font_size;
        let tz = cfg.timezone;
        cfg.day_first = settings.day_first.unwrap_or_else(|| day_first_for(tz));
        cfg.preserve_literals = settings.preserve_literals;
        cfg.csv_bom = settings.csv_bom;
    }

    pub fn next_title(&self) -> String {
        let n = self.book_counter.fetch_add(1, Ordering::SeqCst) + 1;
        format!("Book{n}")
    }

    pub fn insert(&self, session: Session) -> SharedSession {
        let id = session.id.clone();
        let shared = Arc::new(Mutex::new(session));
        self.sessions.lock().unwrap().insert(id, shared.clone());
        shared
    }

    pub fn session(&self, id: &str) -> AppResult<SharedSession> {
        self.sessions
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or(AppError::WorkbookNotFound)
    }

    pub fn remove(&self, id: &str) {
        let session = self.sessions.lock().unwrap().remove(id);
        // Closed with unsaved changes ("Don't Save", or the app is quitting):
        // keep the last state so it can still be recovered for a few days.
        if let Some(shared) = session {
            if let Ok(s) = shared.lock() {
                if s.dirty && !s.untouched && s.edit_seq > 0 {
                    if let Ok(bytes) = snapshot_bytes(&s) {
                        let meta = snapshot_meta(&s.title, s.location.as_ref().map(|l| l.path.to_string_lossy().to_string()));
                        self.recovery.keep_unsaved(id, &meta, &bytes);
                    }
                }
            }
        }
        self.recovery.discard_live(id);
        self.windows.lock().unwrap().retain(|_, book| book != id);
        let mut clip = self.clipboard.lock().unwrap();
        if clip.as_ref().map(|c| c.book_id == id).unwrap_or(false) {
            *clip = None;
        }
        self.sync.closed(id);
    }

    /// Finds an open workbook by file path.
    pub fn find_by_path(&self, path: &str) -> Option<String> {
        let sessions = self.sessions.lock().unwrap();
        for (id, s) in sessions.iter() {
            if let Ok(s) = s.try_lock() {
                if let Some(loc) = &s.location {
                    if loc.path.to_string_lossy().eq_ignore_ascii_case(path) {
                        return Some(id.clone());
                    }
                }
            }
        }
        None
    }

    pub fn bind_window(&self, label: &str, book: Option<String>) {
        let mut windows = self.windows.lock().unwrap();
        match book {
            Some(b) => {
                windows.insert(label.to_string(), b);
            }
            None => {
                windows.remove(label);
            }
        }
    }

    pub fn book_of_window(&self, label: &str) -> Option<String> {
        let book = self.windows.lock().unwrap().get(label).cloned()?;
        self.sessions.lock().unwrap().contains_key(&book).then_some(book)
    }

    pub fn bound_windows(&self) -> Vec<(String, String)> {
        self.windows
            .lock()
            .unwrap()
            .iter()
            .map(|(l, b)| (l.clone(), b.clone()))
            .collect()
    }

    pub fn window_of(&self, book: &str) -> Option<String> {
        self.windows
            .lock()
            .unwrap()
            .iter()
            .find(|(_, b)| b.as_str() == book)
            .map(|(l, _)| l.clone())
    }

    /// A window was destroyed: close the workbook it was showing.
    pub fn window_destroyed(&self, label: &str) {
        let book = self.windows.lock().unwrap().remove(label);
        if let Some(book) = book {
            self.remove(&book);
        }
    }

    /// Runs `f` on a session and forwards produced diffs to the sync backend.
    pub fn with<T>(&self, id: &str, f: impl FnOnce(&mut Session) -> AppResult<T>) -> AppResult<T> {
        let shared = self.session(id)?;
        let mut session = shared.lock().map_err(|_| AppError::Engine("Workbook is busy".into()))?;
        session.preserve_literals = self.config.read().unwrap().preserve_literals;
        let result = f(&mut session);
        let diffs = session.take_outgoing_diffs();
        if !diffs.is_empty() {
            self.sync.publish(id, &diffs);
        }
        result
    }

    /// Read-only access to a session.
    pub fn read<T>(&self, id: &str, f: impl FnOnce(&Session) -> AppResult<T>) -> AppResult<T> {
        let shared = self.session(id)?;
        let session = shared.lock().map_err(|_| AppError::Engine("Workbook is busy".into()))?;
        f(&session)
    }
}

/// Serialises a session as .xlsx bytes (AutoRecover snapshots).
pub fn snapshot_bytes(session: &Session) -> AppResult<Vec<u8>> {
    let model = session.export_model()?;
    encode_xlsx(&model)
}

pub fn encode_xlsx(model: &ironcalc_base::Model) -> AppResult<Vec<u8>> {
    let cursor = ironcalc::export::save_xlsx_to_writer(model, std::io::Cursor::new(Vec::new()))?;
    Ok(cursor.into_inner())
}

impl AppState {
    /// One AutoRecover pass: snapshots every changed workbook whose last
    /// snapshot is older than the configured delay. Called every few seconds
    /// from a background thread; busy workbooks are simply skipped this time.
    pub fn autorecover_tick(&self) {
        let seconds = self.settings.lock().unwrap().value.autorecover_seconds;
        if seconds == 0 {
            return;
        }
        let interval = std::time::Duration::from_secs(seconds as u64);
        let sessions: Vec<(String, SharedSession)> = self
            .sessions
            .lock()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        for (id, shared) in sessions {
            let Ok(s) = shared.try_lock() else { continue };
            if !s.dirty || s.untouched {
                if self.recovery.has_snapshot(&id) {
                    self.recovery.discard_live(&id);
                }
                continue;
            }
            let seq = s.edit_seq;
            if !self.recovery.is_due(&id, seq, interval) {
                continue;
            }
            let meta = snapshot_meta(&s.title, s.location.as_ref().map(|l| l.path.to_string_lossy().to_string()));
            let Ok(model) = s.export_model() else { continue };
            drop(s);
            if let Ok(bytes) = encode_xlsx(&model) {
                let _ = self.recovery.write_live(&id, seq, &meta, &bytes);
            }
        }
    }
}
