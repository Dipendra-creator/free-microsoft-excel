//! Tauri command handlers. They are thin wrappers that locate the session and
//! delegate to the engine; all spreadsheet logic lives in `engine`.

pub mod app;
pub mod cells;
pub mod sheet;
pub mod workbook;
