//! Cell and range commands.

use tauri::State;

use crate::{
    engine::{
        a1::Rect,
        dto::{CellInfo, CellsChunk, SelectionStats, StylePatch, WorkbookInfo},
        DefinedNameDto, FillMode, FillReport, FindOptions, FlashFillResult, FoundCell, PasteSpecial, SeriesSpec, SortKey,
    },
    error::{AppError, AppResult},
    state::AppState,
};

fn norm(r: Rect) -> Rect {
    Rect::new(r.r1, r.c1, r.r2, r.c2)
}

#[tauri::command(async)]
pub fn cells_get(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect, show_formulas: bool) -> AppResult<CellsChunk> {
    state.read(&book, |s| s.cells(sheet, norm(rect), show_formulas))
}

#[tauri::command(async)]
pub fn cell_info(state: State<'_, AppState>, book: String, sheet: u32, row: i32, col: i32) -> AppResult<CellInfo> {
    state.read(&book, |s| s.cell_info(sheet, row, col))
}

#[tauri::command(async)]
pub fn cell_set(state: State<'_, AppState>, book: String, sheet: u32, row: i32, col: i32, input: String) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.set_input(sheet, row, col, &input, state.config().day_first)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn range_set(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect, input: String) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.set_range_input(sheet, norm(rect), &input, state.config().day_first)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn range_clear(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect, what: String) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.clear(sheet, norm(rect), &what)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn range_style(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect, patch: StylePatch) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.apply_style(sheet, norm(rect), &patch)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn range_borders(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect, kind: String, style: String, color: String) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.set_borders(sheet, norm(rect), &kind, &style, &color)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn range_decimals(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect, row: i32, col: i32, delta: i32) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.change_decimals(sheet, norm(rect), (row, col), delta)?;
        Ok(s.info())
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(async)]
pub fn range_table_style(
    state: State<'_, AppState>,
    book: String,
    sheet: u32,
    rect: Rect,
    header: StylePatch,
    odd: StylePatch,
    even: StylePatch,
    has_header: bool,
) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.format_as_table(sheet, norm(rect), &header, &odd, &even, has_header)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn range_merge(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect, mode: String) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.merge(sheet, norm(rect), &mode)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn rows_insert(state: State<'_, AppState>, book: String, sheet: u32, at: i32, count: i32) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.insert_rows(sheet, at, count.max(1))?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn rows_delete(state: State<'_, AppState>, book: String, sheet: u32, at: i32, count: i32) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.delete_rows(sheet, at, count.max(1))?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn cols_insert(state: State<'_, AppState>, book: String, sheet: u32, at: i32, count: i32) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.insert_columns(sheet, at, count.max(1))?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn cols_delete(state: State<'_, AppState>, book: String, sheet: u32, at: i32, count: i32) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.delete_columns(sheet, at, count.max(1))?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn cols_width(state: State<'_, AppState>, book: String, sheet: u32, c1: i32, c2: i32, px: f64) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.set_column_width(sheet, c1.min(c2), c1.max(c2), px)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn cols_widths(state: State<'_, AppState>, book: String, sheet: u32, widths: Vec<(i32, f64)>) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.set_column_widths(sheet, &widths)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn rows_height(state: State<'_, AppState>, book: String, sheet: u32, r1: i32, r2: i32, px: f64) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.set_row_height(sheet, r1.min(r2), r1.max(r2), px)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn rows_heights(state: State<'_, AppState>, book: String, sheet: u32, heights: Vec<(i32, f64)>) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.set_row_heights(sheet, &heights)?;
        Ok(s.info())
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(async)]
pub fn axis_hidden(state: State<'_, AppState>, book: String, sheet: u32, axis: String, a: i32, b: i32, hidden: bool) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.set_hidden(sheet, &axis, a.min(b), a.max(b), hidden)?;
        Ok(s.info())
    })
}

// ---------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------

/// Copies (or cuts) a range. Returns the tab separated text for the OS clipboard.
#[tauri::command(async)]
pub fn clipboard_copy(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect, cut: bool) -> AppResult<String> {
    let payload = state.with(&book, |s| s.copy(sheet, norm(rect), cut))?;
    let text = payload.text.clone();
    *state.clipboard.lock().unwrap() = Some(payload);
    Ok(text)
}

#[tauri::command(async)]
pub fn clipboard_clear(state: State<'_, AppState>) -> AppResult<()> {
    *state.clipboard.lock().unwrap() = None;
    Ok(())
}

fn normalize_text(t: &str) -> String {
    t.replace("\r\n", "\n").trim_end_matches('\n').to_string()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasteResult {
    pub info: WorkbookInfo,
    pub rect: Rect,
    /// Workbook whose content changed because of a cut from another workbook.
    pub source_book: Option<String>,
}

/// Pastes. Uses the internal clipboard when `text` matches what we copied,
/// otherwise pastes `text` as tab separated values.
#[tauri::command(async)]
pub fn clipboard_paste(
    state: State<'_, AppState>,
    book: String,
    sheet: u32,
    rect: Rect,
    mode: String,
    text: Option<String>,
) -> AppResult<PasteResult> {
    let internal = {
        let clip = state.clipboard.lock().unwrap();
        match (&*clip, &text) {
            (Some(c), Some(t)) if normalize_text(t) == normalize_text(&c.text) => Some(c.clone()),
            (Some(c), None) => Some(c.clone()),
            _ => None,
        }
    };
    let target = norm(rect);
    match internal {
        Some(clip) => {
            let pasted = state.with(&book, |s| s.paste(sheet, target, &clip, &mode))?;
            let mut source_book = None;
            if clip.is_cut {
                *state.clipboard.lock().unwrap() = None;
                if clip.book_id != book && mode == "all" {
                    // Cut across workbooks: clear the source range there.
                    state.with(&clip.book_id, |s| s.clear(clip.sheet, clip.rect, "all"))?;
                    source_book = Some(clip.book_id.clone());
                }
            }
            let info = state.read(&book, |s| Ok(s.info()))?;
            Ok(PasteResult { info, rect: pasted, source_book })
        }
        None => {
            let text = text.ok_or_else(|| AppError::Invalid("Nothing to paste.".into()))?;
            let pasted = state.with(&book, |s| s.paste_text(sheet, target, &text))?;
            let info = state.read(&book, |s| Ok(s.info()))?;
            Ok(PasteResult { info, rect: pasted, source_book: None })
        }
    }
}

/// Home → Paste → Paste Special (Ctrl+Alt+V).
#[tauri::command(async)]
pub fn clipboard_paste_special(
    state: State<'_, AppState>,
    book: String,
    sheet: u32,
    rect: Rect,
    options: PasteSpecial,
    text: Option<String>,
) -> AppResult<PasteResult> {
    let internal = {
        let clip = state.clipboard.lock().unwrap();
        match (&*clip, &text) {
            (Some(c), Some(t)) if normalize_text(t) == normalize_text(&c.text) => Some(c.clone()),
            (Some(c), None) => Some(c.clone()),
            _ => None,
        }
    };
    let target = norm(rect);
    let pasted = match internal {
        Some(clip) => state.with(&book, |s| s.paste_special(sheet, target, &clip, &options))?,
        None => {
            // Text from another application: only its values exist
            let text = text.ok_or_else(|| AppError::Invalid("Nothing to paste.".into()))?;
            let text = if options.transpose { transpose_tsv(&text) } else { text };
            state.with(&book, |s| s.paste_text(sheet, target, &text))?
        }
    };
    let info = state.read(&book, |s| Ok(s.info()))?;
    Ok(PasteResult { info, rect: pasted, source_book: None })
}

/// Swaps rows and columns of tab separated text.
fn transpose_tsv(text: &str) -> String {
    let normalized = text.replace("\r\n", "\n");
    let rows: Vec<Vec<&str>> = normalized.trim_end_matches('\n').split('\n').map(|l| l.split('\t').collect()).collect();
    let width = rows.iter().map(Vec::len).max().unwrap_or(0);
    (0..width)
        .map(|j| rows.iter().map(|r: &Vec<&str>| r.get(j).copied().unwrap_or("")).collect::<Vec<_>>().join("\t"))
        .collect::<Vec<_>>()
        .join("\n")
}

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------

#[tauri::command(async)]
pub fn current_region(state: State<'_, AppState>, book: String, sheet: u32, row: i32, col: i32) -> AppResult<Rect> {
    state.read(&book, |s| s.current_region(sheet, row, col))
}

#[tauri::command(async)]
pub fn range_insert_cells(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect, shift: String) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.insert_cells(sheet, norm(rect), &shift)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn range_delete_cells(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect, shift: String) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.delete_cells(sheet, norm(rect), &shift)?;
        Ok(s.info())
    })
}

/// Fill handle / Ctrl+D / AutoFill Options. `target` includes the source.
#[tauri::command(async)]
pub fn range_fill(
    state: State<'_, AppState>,
    book: String,
    sheet: u32,
    source: Rect,
    target: Rect,
    mode: Option<FillMode>,
) -> AppResult<(FillReport, WorkbookInfo)> {
    state.with(&book, |s| {
        let report = s.fill(sheet, norm(source), norm(target), mode.unwrap_or_default())?;
        Ok((report, s.info()))
    })
}

/// Last row a double-click on the fill handle fills down to.
#[tauri::command(async)]
pub fn range_fill_extent(state: State<'_, AppState>, book: String, sheet: u32, source: Rect) -> AppResult<Option<i32>> {
    state.read(&book, |s| s.fill_extent(sheet, norm(source)))
}

/// Flash Fill (Ctrl+E) for the column of the active cell.
#[tauri::command(async)]
pub fn range_flash_fill(
    state: State<'_, AppState>,
    book: String,
    sheet: u32,
    row: i32,
    col: i32,
) -> AppResult<(FlashFillResult, WorkbookInfo)> {
    state.with(&book, |s| {
        let result = s.flash_fill(sheet, row, col)?;
        Ok((result, s.info()))
    })
}

/// Home → Fill → Series. Returns the filled range.
#[tauri::command(async)]
pub fn range_fill_series(
    state: State<'_, AppState>,
    book: String,
    sheet: u32,
    rect: Rect,
    spec: SeriesSpec,
) -> AppResult<(Rect, WorkbookInfo)> {
    state.with(&book, |s| {
        let filled = s.fill_series(sheet, norm(rect), &spec)?;
        Ok((filled, s.info()))
    })
}

#[tauri::command(async)]
pub fn range_sort(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect, keys: Vec<SortKey>, has_header: bool) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.sort(sheet, norm(rect), &keys, has_header)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn range_remove_duplicates(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect, columns: Vec<i32>, has_header: bool) -> AppResult<(usize, usize, WorkbookInfo)> {
    state.with(&book, |s| {
        let (removed, remaining) = s.remove_duplicates(sheet, norm(rect), &columns, has_header)?;
        Ok((removed, remaining, s.info()))
    })
}

#[tauri::command(async)]
pub fn find_all(state: State<'_, AppState>, book: String, sheet: u32, query: String, options: FindOptions) -> AppResult<Vec<FoundCell>> {
    state.read(&book, |s| s.find(sheet, &query, &options))
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(async)]
pub fn replace(
    state: State<'_, AppState>,
    book: String,
    sheet: u32,
    query: String,
    replacement: String,
    options: FindOptions,
    only: Option<(u32, i32, i32)>,
) -> AppResult<(usize, WorkbookInfo)> {
    state.with(&book, |s| {
        let n = s.replace(sheet, &query, &replacement, &options, only)?;
        Ok((n, s.info()))
    })
}

#[tauri::command(async)]
pub fn selection_stats(state: State<'_, AppState>, book: String, sheet: u32, rect: Rect) -> AppResult<SelectionStats> {
    state.read(&book, |s| s.selection_stats(sheet, norm(rect)))
}

#[tauri::command(async)]
pub fn navigate_edge(state: State<'_, AppState>, book: String, sheet: u32, row: i32, col: i32, dir: String) -> AppResult<(i32, i32)> {
    state.read(&book, |s| s.navigate_edge(sheet, row, col, &dir))
}

#[tauri::command(async)]
pub fn format_preview(value: f64, fmt: String) -> AppResult<String> {
    Ok(crate::engine::format_preview(value, &fmt))
}

#[tauri::command(async)]
pub fn cycle_reference(state: State<'_, AppState>, book: String, text: String, start: usize, end: usize) -> AppResult<(String, i32, i32)> {
    state.read(&book, |s| s.cycle_reference(&text, start, end))
}

// ---------------------------------------------------------------------
// Names & conditional formatting
// ---------------------------------------------------------------------

#[tauri::command(async)]
pub fn names_list(state: State<'_, AppState>, book: String) -> AppResult<Vec<DefinedNameDto>> {
    state.read(&book, |s| Ok(s.defined_names()))
}

#[tauri::command(async)]
pub fn name_add(state: State<'_, AppState>, book: String, name: String, scope: Option<u32>, formula: String) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.add_name(&name, scope, &formula)?;
        Ok(s.info())
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(async)]
pub fn name_update(
    state: State<'_, AppState>,
    book: String,
    name: String,
    scope: Option<u32>,
    new_name: String,
    new_scope: Option<u32>,
    formula: String,
) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.update_name(&name, scope, &new_name, new_scope, &formula)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn name_delete(state: State<'_, AppState>, book: String, name: String, scope: Option<u32>) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.delete_name(&name, scope)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn cf_list(state: State<'_, AppState>, book: String, sheet: u32) -> AppResult<serde_json::Value> {
    state.read(&book, |s| s.conditional_formats(sheet))
}

#[tauri::command(async)]
pub fn cf_add(state: State<'_, AppState>, book: String, sheet: u32, range: String, rule: serde_json::Value) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.add_conditional_format(sheet, &range, rule)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn cf_delete(state: State<'_, AppState>, book: String, sheet: u32, index: u32) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.delete_conditional_format(sheet, index)?;
        Ok(s.info())
    })
}

#[tauri::command(async)]
pub fn cf_clear(state: State<'_, AppState>, book: String, sheet: u32, rect: Option<Rect>) -> AppResult<WorkbookInfo> {
    state.with(&book, |s| {
        s.clear_conditional_formats(sheet, rect.map(norm))?;
        Ok(s.info())
    })
}
