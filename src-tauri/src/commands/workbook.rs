//! Workbook lifecycle commands: new, open, save, close, undo/redo.

use serde::Serialize;
use tauri::State;

use crate::{
    engine::{dto::WorkbookInfo, Session, WorkbookStats},
    error::{AppError, AppResult},
    state::AppState,
    storage::{FileFormat, Location},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenResult {
    pub info: WorkbookInfo,
    /// True when the file was already open (the frontend should focus it).
    pub already_open: bool,
}

pub(crate) fn new_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

#[tauri::command(async)]
pub fn workbook_new(state: State<'_, AppState>, template: Option<String>) -> AppResult<WorkbookInfo> {
    let config = state.config();
    let (model, title, untouched) = match template.as_deref() {
        None | Some("") | Some("blank") => {
            let title = state.next_title();
            let mut model = config.new_model(&title)?;
            let extra = state.settings.lock().unwrap().value.sheets_in_new_workbook.saturating_sub(1);
            for _ in 0..extra {
                model.new_sheet();
            }
            (model, title, true)
        }
        Some(id) => {
            let model = state
                .templates
                .build(id, &config)
                .ok_or_else(|| AppError::Invalid("Template not found".into()))??;
            let base = state.templates.name_of(id).unwrap_or_else(|| "Book".into());
            let n = state.next_title();
            let title = format!("{}{}", base, n.trim_start_matches("Book"));
            (model, title, false)
        }
    };
    let mut session = Session::new(new_id(), title, model, None);
    session.untouched = untouched;
    let info = session.info();
    state.insert(session);
    Ok(info)
}

#[tauri::command(async)]
pub fn workbook_open(state: State<'_, AppState>, path: String) -> AppResult<OpenResult> {
    if let Some(id) = state.find_by_path(&path) {
        let info = state.read(&id, |s| Ok(s.info()))?;
        state.recent.lock().unwrap().touch(&path);
        return Ok(OpenResult { info, already_open: true });
    }
    let location = Location::from_path(&path)?;
    let config = state.config();
    let model = state.store.load(&location, &config)?;
    let title = location.display_name();
    // Macro-enabled workbooks are never overwritten (macros would be lost):
    // the first save asks where to store an .xlsx copy.
    let session = if location.is_macro_enabled() {
        let mut s = Session::new(new_id(), title, model, None);
        s.source_path = Some(path.clone());
        s
    } else {
        Session::new(new_id(), title, model, Some(location))
    };
    let info = session.info();
    state.insert(session);
    state.recent.lock().unwrap().touch(&path);
    Ok(OpenResult { info, already_open: false })
}

#[tauri::command(async)]
pub fn workbook_info(state: State<'_, AppState>, book: String) -> AppResult<WorkbookInfo> {
    state.read(&book, |s| Ok(s.info()))
}

/// Keeps the file's previous content in the version history, then writes.
fn save_with_history(state: &AppState, s: &Session, location: &Location) -> AppResult<()> {
    let keep = state.settings.lock().unwrap().value.keep_versions as usize;
    state.versions.backup(&location.path, keep);
    state.store.save(s, location, &state.config())
}

#[tauri::command(async)]
pub fn workbook_save(state: State<'_, AppState>, book: String) -> AppResult<WorkbookInfo> {
    let info = state.with(&book, |s| {
        let location = s
            .location
            .clone()
            .ok_or_else(|| AppError::Invalid("NO_LOCATION".into()))?;
        save_with_history(&state, s, &location)?;
        s.dirty = false;
        Ok(s.info())
    })?;
    state.recovery.discard_live(&book);
    if let Some(path) = &info.path {
        state.recent.lock().unwrap().touch(path);
    }
    Ok(info)
}

#[tauri::command(async)]
pub fn workbook_save_as(state: State<'_, AppState>, book: String, path: String) -> AppResult<WorkbookInfo> {
    let location = Location::for_save(&path)?;
    let info = state.with(&book, |s| {
        save_with_history(&state, s, &location)?;
        // Saving as CSV keeps editing the workbook but future saves go to the CSV.
        s.title = location.display_name();
        s.location = Some(location.clone());
        s.source_path = None;
        s.dirty = false;
        s.untouched = false;
        Ok(s.info())
    })?;
    state.recovery.discard_live(&book);
    state.recent.lock().unwrap().touch(&path);
    Ok(info)
}

/// Writes a copy (e.g. CSV export) without changing the workbook's location.
#[tauri::command(async)]
pub fn workbook_export(state: State<'_, AppState>, book: String, path: String) -> AppResult<()> {
    let location = Location::for_save(&path)?;
    state.read(&book, |s| state.store.save(s, &location, &state.config()))
}

#[tauri::command(async)]
pub fn workbook_close(state: State<'_, AppState>, book: String) -> AppResult<()> {
    state.remove(&book);
    Ok(())
}

#[tauri::command(async)]
pub fn workbook_undo(state: State<'_, AppState>, book: String) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.undo()?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn workbook_redo(state: State<'_, AppState>, book: String) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.redo()?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn workbook_stats(state: State<'_, AppState>, book: String) -> AppResult<WorkbookStats> {
    state.read(&book, |s| Ok(s.stats()))
}

#[tauri::command(async)]
pub fn workbook_recalculate(state: State<'_, AppState>, book: String) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.recalculate();
        Ok(s.info())
    })
}

/// True when saving to `path` would drop features (CSV keeps values of one sheet).
#[tauri::command(async)]
pub fn format_is_lossy(path: String) -> AppResult<bool> {
    Ok(FileFormat::from_path(std::path::Path::new(&path))?.is_lossy())
}
