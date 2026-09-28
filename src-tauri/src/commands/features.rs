//! Notes, charts, AutoFilter, data tools, workbook health check, AutoRecover
//! and version history.

use std::path::PathBuf;

use tauri::State;

use crate::{
    engine::{
        a1::Rect,
        dto::WorkbookInfo,
        extras::{ChartSpec, Note},
        FilterValue, HealthReport, PivotSpec, RangeValues, Session, SplitOptions,
    },
    error::{AppError, AppResult},
    recovery::{snapshot_meta, RecoveryItem, VersionItem},
    state::AppState,
    storage::Location,
};

use super::workbook::new_id;

fn norm(r: Rect) -> Rect {
    Rect::new(r.r1, r.c1, r.r2, r.c2)
}

// ---------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------

#[tauri::command(async)]
pub fn note_set(state: State<'_, AppState>, book: String, sheet: u32, row: i32, col: i32, text: String) -> AppResult<WorkbookInfo> {
    let author = state.settings.lock().unwrap().value.user_name.clone();
    state.with(&book, |s| {
        s.set_note(sheet, row, col, &text, &author)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn notes_delete(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.delete_notes(sheet, norm(rect))?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn notes_list(state: State<'_, AppState>, book: String, sheet: u32) -> AppResult<Vec<Note>> {
    state.read(&book, |s| s.notes(sheet))
}

// ---------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------

#[tauri::command(async)]
pub fn chart_save(state: State<'_, AppState>, book: String, sheet: u32, chart: ChartSpec) -> AppResult<(String, WorkbookInfo)> {
    state.with(&book, |s| {
        let id = s.save_chart(sheet, chart)?;
        Ok((id, s.info()))
    })
}

#[tauri::command(async)]
pub fn chart_delete(state: State<'_, AppState>, book: String, sheet: u32, id: String) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.delete_chart(sheet, &id)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn range_values(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect) -> AppResult<RangeValues> {
    state.read(&book, |s| s.range_values(sheet, norm(rect)))
}

// ---------------------------------------------------------------------
// AutoFilter
// ---------------------------------------------------------------------

#[tauri::command(async)]
pub fn filter_toggle(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.toggle_filter(sheet, norm(rect))?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn filter_values(state: State<'_, AppState>, book: String, sheet: u32, col: i32) -> AppResult<Vec<FilterValue>> {
    state.read(&book, |s| s.filter_values(sheet, col))
}

#[tauri::command(async)]
pub fn filter_set(state: State<'_, AppState>, book: String, sheet: u32, col: i32, values: Option<Vec<String>>) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.set_filter(sheet, col, values)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn filter_clear(state: State<'_, AppState>, book: String, sheet: u32) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.clear_filter(sheet)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn filter_reapply(state: State<'_, AppState>, book: String, sheet: u32) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.reapply_filter(sheet)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn filter_sort(state: State<'_, AppState>, book: String, sheet: u32, col: i32, ascending: bool) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.sort_filter(sheet, col, ascending)?;
        Ok(s.info())
    })
}

// ---------------------------------------------------------------------
// Data tools
// ---------------------------------------------------------------------

#[tauri::command(async)]
pub fn text_to_columns(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect, options: SplitOptions) -> AppResult<(Rect, WorkbookInfo)> {
    let day_first = state.config().day_first;
    state.with(&book, |s| {
        let written = s.text_to_columns(sheet, norm(rect), &options, day_first)?;
        Ok((written, s.info()))
    })
}

#[tauri::command(async)]
pub fn pivot_create(state: State<'_, AppState>, book: String, sheet: u32, spec: PivotSpec) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.create_pivot(sheet, &PivotSpec { source: norm(spec.source), ..spec.clone() })?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn health_check(state: State<'_, AppState>, book: String) -> AppResult<HealthReport> {
    state.read(&book, |s| s.health_check())
}

// ---------------------------------------------------------------------
// AutoRecover & version history
// ---------------------------------------------------------------------

#[tauri::command(async)]
pub fn recovery_list(state: State<'_, AppState>) -> AppResult<Vec<RecoveryItem>> {
    Ok(state.recovery.list())
}

/// Opens a recovered snapshot as a new, unsaved workbook.
#[tauri::command(async)]
pub fn recovery_open(state: State<'_, AppState>, file: String) -> AppResult<WorkbookInfo> {
    let path = PathBuf::from(&file);
    if !state.recovery.owns(&path) {
        return Err(AppError::Invalid("This file is not a recovered workbook.".into()));
    }
    let item = state
        .recovery
        .list()
        .into_iter()
        .find(|i| i.file == file)
        .ok_or_else(|| AppError::Invalid("The recovered workbook no longer exists.".into()))?;
    let model = state.store.load(&Location::from_path(&path)?, &state.config())?;
    let title = format!("{} (Recovered)", item.title.trim_end_matches(" (Recovered)"));
    let mut session = Session::new(new_id(), title.clone(), model, None);
    session.dirty = true;
    session.edit_seq = 1;
    let id = session.id.clone();
    let info = session.info();
    state.insert(session);
    // The snapshot becomes this workbook's live AutoRecover file until saved.
    state.recovery.adopt(&path, &id, 1, &snapshot_meta(&title, item.original_path))?;
    Ok(info)
}

#[tauri::command(async)]
pub fn recovery_discard(state: State<'_, AppState>, file: String) -> AppResult<Vec<RecoveryItem>> {
    state.recovery.remove_item(&PathBuf::from(file));
    Ok(state.recovery.list())
}

#[tauri::command(async)]
pub fn versions_list(state: State<'_, AppState>, path: String) -> AppResult<Vec<VersionItem>> {
    Ok(state.versions.list(&PathBuf::from(path)))
}

/// Opens a previous version of a file as a new, unsaved workbook.
#[tauri::command(async)]
pub fn version_open(state: State<'_, AppState>, file: String, title: String) -> AppResult<WorkbookInfo> {
    let path = PathBuf::from(&file);
    if !state.versions.owns(&path) {
        return Err(AppError::Invalid("This file is not a saved version.".into()));
    }
    let model = state.store.load(&Location::from_path(&path)?, &state.config())?;
    let mut session = Session::new(new_id(), title, model, None);
    session.dirty = true;
    let info = session.info();
    state.insert(session);
    Ok(info)
}
