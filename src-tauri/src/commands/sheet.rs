//! Worksheet-level commands.

use tauri::State;

use crate::{
    engine::dto::{SheetLayout, WorkbookInfo},
    error::AppResult,
    state::AppState,
};

#[tauri::command(async)]
pub fn sheet_layout(state: State<'_, AppState>, book: String, sheet: u32) -> AppResult<SheetLayout> {
    state.read(&book, |s| s.layout(sheet))
}

#[tauri::command(async)]
pub fn sheet_activate(state: State<'_, AppState>, book: String, sheet: u32) -> AppResult<()> {
    state.with(&book, |s| s.set_active_sheet(sheet))
}

#[tauri::command(async)]
pub fn sheet_add(state: State<'_, AppState>, book: String, after: Option<u32>) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.add_sheet(after)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn sheet_delete(state: State<'_, AppState>, book: String, sheet: u32) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.delete_sheet(sheet)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn sheet_rename(state: State<'_, AppState>, book: String, sheet: u32, name: String) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.rename_sheet(sheet, &name)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn sheet_move(state: State<'_, AppState>, book: String, from: u32, to: u32) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.move_sheet(from, to)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn sheet_duplicate(state: State<'_, AppState>, book: String, sheet: u32) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.duplicate_sheet(sheet)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn sheet_set_hidden(state: State<'_, AppState>, book: String, sheet: u32, hidden: bool) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.set_sheet_hidden(sheet, hidden)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn sheet_set_color(state: State<'_, AppState>, book: String, sheet: u32, color: String) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.set_sheet_color(sheet, &color)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn sheet_freeze(state: State<'_, AppState>, book: String, sheet: u32, rows: i32, cols: i32) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.freeze(sheet, rows.max(0), cols.max(0))?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn sheet_grid_lines(state: State<'_, AppState>, book: String, sheet: u32, show: bool) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.set_grid_lines(sheet, show)?;
        Ok(s.info())
    })
}
