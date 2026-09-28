//! Persistence of [`Extras`] that the xlsx writer does not support (notes,
//! charts, AutoFilter criteria).
//!
//! They are stored as JSON in a *very hidden* worksheet — the standard way
//! add-ins keep private data in a workbook. Excel preserves such sheets but
//! never shows them in the UI. The sheet is removed from the model on load and
//! re-created on every save, so it never appears inside the app either.
//! Sheets are referenced by name because Excel may renumber sheet ids.

use std::collections::HashMap;

use ironcalc_base::{cell::CellValue, types::SheetState, Model};
use serde::{Deserialize, Serialize};

use super::extras::{AutoFilter, ChartSpec, Extras, Note};
use crate::error::AppResult;

pub const META_SHEET: &str = "_SheetsMeta";
const FORMAT_VERSION: u32 = 1;
/// Characters per cell (Excel's limit is 32,767).
const CHUNK: usize = 30_000;

#[derive(Serialize, Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
struct MetaDoc {
    app: String,
    version: u32,
    sheets: Vec<SheetMeta>,
}

#[derive(Serialize, Deserialize, Default, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct SheetMeta {
    pub name: String,
    pub notes: Vec<Note>,
    pub charts: Vec<ChartSpec>,
    pub filter: Option<AutoFilter>,
}

impl SheetMeta {
    fn is_empty(&self) -> bool {
        self.notes.is_empty() && self.charts.is_empty() && self.filter.is_none()
    }
}

/// Removes the metadata sheet from `model` and returns its content by sheet name.
pub fn extract(model: &mut Model) -> HashMap<String, SheetMeta> {
    let Some(index) = model
        .workbook
        .worksheets
        .iter()
        .position(|ws| ws.name == META_SHEET)
    else {
        return HashMap::new();
    };
    let sheet = index as u32;
    let mut json = String::new();
    let mut row = 1;
    while let Ok(CellValue::String(s)) = model.get_cell_value_by_index(sheet, row, 1) {
        json.push_str(&s);
        row += 1;
    }
    let _ = model.delete_sheet(sheet);
    match serde_json::from_str::<MetaDoc>(&json) {
        Ok(doc) => doc.sheets.into_iter().map(|s| (s.name.clone(), s)).collect(),
        Err(_) => HashMap::new(),
    }
}

/// Builds the per-sheet metadata of a workbook (sheet ids resolved to names).
pub fn collect(model: &Model, extras: &Extras) -> Vec<SheetMeta> {
    model
        .workbook
        .worksheets
        .iter()
        .map(|ws| SheetMeta {
            name: ws.name.clone(),
            notes: extras.notes(ws.sheet_id).to_vec(),
            charts: extras.charts(ws.sheet_id).to_vec(),
            filter: extras.filters.get(&ws.sheet_id).cloned(),
        })
        .filter(|m| !m.is_empty())
        .collect()
}

/// Appends the very hidden metadata sheet to an export model (no-op when empty).
pub fn inject(model: &mut Model, sheets: Vec<SheetMeta>) -> AppResult<()> {
    if sheets.is_empty() {
        return Ok(());
    }
    let doc = MetaDoc {
        app: "Sheets".into(),
        version: FORMAT_VERSION,
        sheets,
    };
    let json = serde_json::to_string(&doc).map_err(|e| e.to_string())?;
    model.add_sheet(META_SHEET)?;
    let index = model
        .workbook
        .worksheets
        .iter()
        .position(|ws| ws.name == META_SHEET)
        .ok_or("metadata sheet missing")? as u32;
    model.workbook.worksheets[index as usize].state = SheetState::VeryHidden;
    for (i, chunk) in chunks(&json, CHUNK).into_iter().enumerate() {
        // Leading quote: always stored as text, never parsed as a number/formula.
        model.set_user_input(index, i as i32 + 1, 1, format!("'{chunk}"))?;
    }
    Ok(())
}

fn chunks(s: &str, size: usize) -> Vec<&str> {
    let mut out = Vec::new();
    let mut start = 0;
    let mut count = 0;
    for (i, _) in s.char_indices() {
        if count == size {
            out.push(&s[start..i]);
            start = i;
            count = 0;
        }
        count += 1;
    }
    if start < s.len() {
        out.push(&s[start..]);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunking_respects_char_boundaries() {
        let s = "aé€b".repeat(10);
        let parts = chunks(&s, 7);
        assert_eq!(parts.concat(), s);
        assert!(parts.iter().all(|p| p.chars().count() <= 7));
    }
}
