//! A `Session` is one open workbook: the IronCalc [`UserModel`] plus the state
//! IronCalc does not track itself (merged cells, file location, dirty flag) and
//! a unified undo history that can group several engine operations into one
//! user-visible step.

use std::collections::HashMap;

use ironcalc_base::{
    cell::CellValue,
    cf_types::CfRuleInput,
    expressions::types::Area,
    types::{Cell, SheetState, Style, WorksheetView},
    worksheet::NavigationDirection,
    BorderArea, Model, UserModel,
};
use serde_json::json;

use super::{
    a1::{parse_range, Rect, LAST_COLUMN, LAST_ROW},
    dto::*,
    merges::MergeStore,
    styling::{apply_patch, change_decimals, Edges},
};
use crate::{
    error::{AppError, AppResult},
    storage::Location,
};

pub type Engine = UserModel<'static>;

/// Locale / timezone / default font used when creating models.
#[derive(Clone, Debug)]
pub struct EngineConfig {
    pub locale: &'static str,
    pub timezone: &'static str,
    pub language: &'static str,
    pub font_name: String,
    pub font_size: i32,
    /// Interpret 01/02/2026 as 1 February (true) or January 2 (false).
    pub day_first: bool,
}

impl EngineConfig {
    /// Creates an empty model with Excel-like defaults (Aptos Narrow 11).
    pub fn new_model(&self, name: &str) -> AppResult<Model<'static>> {
        let mut model = Model::new_empty("Book", self.locale, self.timezone, self.language)?;
        model.workbook.name = name.to_string();
        if let Some(font) = model.workbook.styles.fonts.get_mut(0) {
            font.name = self.font_name.clone();
            font.sz = self.font_size;
        }
        Ok(model)
    }
}

#[derive(Default, Debug)]
struct HistoryEntry {
    engine_steps: u32,
    merges_before: Option<MergeStore>,
    merges_after: Option<MergeStore>,
}

/// Accumulates the engine operations of one user action.
struct Tx {
    steps: u32,
    merges_before: Option<MergeStore>,
    layout: bool,
}

/// Internal clipboard captured on copy/cut, shared across workbooks.
#[derive(Clone, Debug)]
pub struct ClipboardPayload {
    pub book_id: String,
    pub sheet: u32,
    pub rect: Rect,
    pub is_cut: bool,
    /// IronCalc clipboard data (`ClipboardData` as JSON).
    pub data: serde_json::Value,
    /// Raw values for "paste values" (row-major, same shape as `rect`).
    pub values: Vec<Vec<Option<String>>>,
    /// Styles for "paste formats" (row-major).
    pub styles: Vec<Vec<Style>>,
    /// Tab separated text written to the OS clipboard.
    pub text: String,
}

#[derive(serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SortKey {
    pub column: i32,
    pub ascending: bool,
}

#[derive(serde::Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct FindOptions {
    pub match_case: bool,
    pub whole_cell: bool,
    /// Search formulas (true) or displayed values (false).
    pub in_formulas: bool,
    pub all_sheets: bool,
}

#[derive(serde::Serialize, Debug, Clone)]
pub struct FoundCell {
    pub sheet: u32,
    pub row: i32,
    pub col: i32,
    pub text: String,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DefinedNameDto {
    pub name: String,
    pub scope: Option<u32>,
    pub formula: String,
}

#[derive(serde::Serialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookStats {
    pub sheets: usize,
    pub cells_with_data: usize,
    pub formulas: usize,
    pub merged_ranges: usize,
    pub active_sheet_cells: usize,
    pub active_sheet_formulas: usize,
    pub used_range: String,
}

pub struct Session {
    pub id: String,
    pub title: String,
    pub location: Option<Location>,
    model: Engine,
    merges: MergeStore,
    undo_stack: Vec<HistoryEntry>,
    redo_stack: Vec<HistoryEntry>,
    pub dirty: bool,
    /// A new blank workbook nobody has typed into yet (Excel replaces it on open).
    pub untouched: bool,
    layout_version: u64,
    default_font: DefaultFont,
}

fn area(sheet: u32, r: &Rect) -> Area {
    Area {
        sheet,
        row: r.r1,
        column: r.c1,
        width: r.width(),
        height: r.height(),
    }
}

fn cell_kind(cell: &Cell) -> u8 {
    use ironcalc_base::types::CellType;
    let base = match cell {
        Cell::EmptyCell { .. } => kind::EMPTY,
        _ => match cell.get_type() {
            CellType::Number => kind::NUMBER,
            CellType::Text => kind::TEXT,
            CellType::LogicalValue => kind::BOOLEAN,
            CellType::ErrorValue => kind::ERROR,
            _ => kind::TEXT,
        },
    };
    if cell.has_formula() {
        base | kind::FORMULA
    } else {
        base
    }
}

impl Session {
    pub fn new(
        id: String,
        title: String,
        mut model: Model<'static>,
        location: Option<Location>,
    ) -> Session {
        // Make sure every sheet has a view (needed for selection based APIs).
        for ws in model.workbook.worksheets.iter_mut() {
            ws.views.entry(0).or_insert(WorksheetView {
                row: 1,
                column: 1,
                range: [1, 1, 1, 1],
                top_row: 1,
                left_column: 1,
            });
        }
        let merges = MergeStore::from_workbook(&model.workbook);
        let default_font = {
            let styles = &model.workbook.styles;
            let font_id = styles
                .cell_xfs
                .first()
                .map(|x| x.font_id as usize)
                .unwrap_or(0);
            let font = styles.fonts.get(font_id).or_else(|| styles.fonts.first());
            match font {
                Some(f) => DefaultFont {
                    name: f.name.clone(),
                    size: f.sz,
                },
                None => DefaultFont {
                    name: "Aptos Narrow".to_string(),
                    size: 11,
                },
            }
        };
        let mut model = UserModel::from_model(model);
        model.evaluate();
        // Discard anything queued while loading.
        let _ = model.flush_send_queue();
        Session {
            id,
            title,
            location,
            model,
            merges,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            dirty: false,
            untouched: false,
            layout_version: 1,
            default_font,
        }
    }

    // ------------------------------------------------------------------
    // Transactions & history
    // ------------------------------------------------------------------

    fn tx<T>(
        &mut self,
        layout: bool,
        f: impl FnOnce(&mut Session, &mut Tx) -> AppResult<T>,
    ) -> AppResult<T> {
        let mut tx = Tx {
            steps: 0,
            merges_before: None,
            layout,
        };
        let result = f(self, &mut tx);
        self.commit(tx);
        result
    }

    /// Runs several value-changing engine calls with evaluation paused and
    /// evaluates once at the end.
    fn batch<T>(
        &mut self,
        layout: bool,
        f: impl FnOnce(&mut Session, &mut Tx) -> AppResult<T>,
    ) -> AppResult<T> {
        self.model.pause_evaluation();
        let result = self.tx(layout, f);
        self.model.resume_evaluation();
        self.model.evaluate();
        result
    }

    fn step(tx: &mut Tx, r: Result<(), String>) -> AppResult<()> {
        r?;
        tx.steps += 1;
        Ok(())
    }

    fn snapshot_merges(&self, tx: &mut Tx) {
        if tx.merges_before.is_none() {
            tx.merges_before = Some(self.merges.clone());
        }
    }

    fn commit(&mut self, tx: Tx) {
        let merges_changed = tx
            .merges_before
            .as_ref()
            .map(|before| before != &self.merges)
            .unwrap_or(false);
        if tx.steps == 0 && !merges_changed {
            return;
        }
        let (before, after) = if merges_changed {
            (tx.merges_before, Some(self.merges.clone()))
        } else {
            (None, None)
        };
        self.undo_stack.push(HistoryEntry {
            engine_steps: tx.steps,
            merges_before: before,
            merges_after: after,
        });
        self.redo_stack.clear();
        self.dirty = true;
        self.untouched = false;
        if tx.layout || merges_changed {
            self.layout_version += 1;
        }
    }

    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    pub fn undo(&mut self) -> AppResult<()> {
        let Some(entry) = self.undo_stack.pop() else {
            return Ok(());
        };
        self.model.pause_evaluation();
        let mut result = Ok(());
        for _ in 0..entry.engine_steps {
            if let Err(e) = self.model.undo() {
                result = Err(AppError::Engine(e));
                break;
            }
        }
        self.model.resume_evaluation();
        self.model.evaluate();
        if let Some(before) = &entry.merges_before {
            self.merges = before.clone();
        }
        self.redo_stack.push(entry);
        self.dirty = true;
        self.layout_version += 1;
        result
    }

    pub fn redo(&mut self) -> AppResult<()> {
        let Some(entry) = self.redo_stack.pop() else {
            return Ok(());
        };
        self.model.pause_evaluation();
        let mut result = Ok(());
        for _ in 0..entry.engine_steps {
            if let Err(e) = self.model.redo() {
                result = Err(AppError::Engine(e));
                break;
            }
        }
        self.model.resume_evaluation();
        self.model.evaluate();
        if let Some(after) = &entry.merges_after {
            self.merges = after.clone();
        }
        self.undo_stack.push(entry);
        self.dirty = true;
        self.layout_version += 1;
        result
    }

    /// Diffs produced since the last call (bitcode encoded IronCalc queue).
    /// This is the hook the future database sync layer consumes.
    pub fn take_outgoing_diffs(&mut self) -> Vec<u8> {
        self.model.flush_send_queue()
    }

    /// Applies diffs coming from another client (future sync).
    #[allow(dead_code)]
    pub fn apply_remote_diffs(&mut self, diffs: &[u8]) -> AppResult<()> {
        self.model.apply_external_diffs(diffs)?;
        self.layout_version += 1;
        Ok(())
    }

    // ------------------------------------------------------------------
    // Read APIs
    // ------------------------------------------------------------------

    fn m(&self) -> &Model<'_> {
        self.model.get_model()
    }

    fn sheet_id(&self, sheet: u32) -> AppResult<u32> {
        self.m()
            .workbook
            .worksheets
            .get(sheet as usize)
            .map(|ws| ws.sheet_id)
            .ok_or_else(|| AppError::Invalid("Invalid sheet".into()))
    }

    fn check_sheet(&self, sheet: u32) -> AppResult<()> {
        self.sheet_id(sheet).map(|_| ())
    }

    pub fn info(&self) -> WorkbookInfo {
        let model = self.m();
        let theme = &model.workbook.theme;
        let sheets = model
            .workbook
            .worksheets
            .iter()
            .enumerate()
            .map(|(i, ws)| SheetInfo {
                index: i as u32,
                sheet_id: ws.sheet_id,
                name: ws.name.clone(),
                hidden: ws.state != SheetState::Visible,
                color: resolve_color(&ws.color, theme),
            })
            .collect();
        WorkbookInfo {
            id: self.id.clone(),
            title: self.title.clone(),
            path: self
                .location
                .as_ref()
                .map(|l| l.path.to_string_lossy().to_string()),
            format: self.location.as_ref().map(|l| l.format.extension().to_string()),
            dirty: self.dirty,
            untouched: self.untouched,
            sheets,
            active_sheet: self.model.get_selected_sheet(),
            can_undo: self.can_undo(),
            can_redo: self.can_redo(),
            layout_version: self.layout_version,
            default_font: self.default_font.name.clone(),
            default_font_size: self.default_font.size as f64,
        }
    }

    fn style_dto(&self, style: &Style) -> StyleDto {
        style_to_dto(style, &self.m().workbook.theme, &self.default_font)
    }

    pub fn layout(&self, sheet: u32) -> AppResult<SheetLayout> {
        let model = self.m();
        let ws = model.workbook.worksheet(sheet)?;
        let mut styles = vec![self.style_dto(&Style {
            font: ironcalc_base::types::Font {
                name: self.default_font.name.clone(),
                sz: self.default_font.size,
                ..Default::default()
            },
            ..Default::default()
        })];
        let mut rows = Vec::new();
        let mut row_styles = Vec::new();
        for r in &ws.rows {
            // 16pt is IronCalc's own default height (e.g. restored by undo).
            let px = if r.hidden {
                0.0
            } else if (r.height - 16.0).abs() < 0.001 || r.height <= 0.0 {
                DEFAULT_ROW_PX
            } else {
                row_pt_to_px(r.height)
            };
            if (px - DEFAULT_ROW_PX).abs() > 0.1 {
                rows.push((r.r, px));
            }
            if r.custom_format && r.s != 0 {
                if let Ok(Some(style)) = model.get_row_style(sheet, r.r) {
                    styles.push(self.style_dto(&style));
                    row_styles.push((r.r, (styles.len() - 1) as u32));
                }
            }
        }
        rows.sort_by_key(|r| r.0);
        let mut cols = Vec::new();
        let mut col_styles = Vec::new();
        for c in &ws.cols {
            // 10 characters is IronCalc's own default width (e.g. restored by undo).
            let px = if c.hidden {
                0.0
            } else if c.custom_width && (c.width - 10.0).abs() > 1e-9 {
                col_chars_to_px(c.width)
            } else {
                DEFAULT_COL_PX
            };
            if (px - DEFAULT_COL_PX).abs() > 0.1 {
                cols.push((c.min, c.max, px));
            }
            if let Some(s) = c.style {
                if s != 0 {
                    if let Ok(Some(style)) = model.get_column_style(sheet, c.min) {
                        styles.push(self.style_dto(&style));
                        col_styles.push((c.min, c.max, (styles.len() - 1) as u32));
                    }
                }
            }
        }
        cols.sort_by_key(|c| c.0);
        let dim = ws.dimension();
        Ok(SheetLayout {
            sheet,
            version: self.layout_version,
            default_row_px: DEFAULT_ROW_PX,
            default_col_px: DEFAULT_COL_PX,
            rows,
            cols,
            merges: self
                .merges
                .get(ws.sheet_id)
                .iter()
                .map(|r| r.to_array())
                .collect(),
            frozen_rows: ws.frozen_rows,
            frozen_cols: ws.frozen_columns,
            max_row: if ws.sheet_data.is_empty() { 0 } else { dim.max_row },
            max_col: if ws.sheet_data.is_empty() { 0 } else { dim.max_column },
            show_grid_lines: ws.show_grid_lines,
            row_styles,
            col_styles,
            styles,
        })
    }

    fn cf_rects(&self, sheet: u32) -> Vec<Rect> {
        let Ok(ws) = self.m().workbook.worksheet(sheet) else {
            return vec![];
        };
        ws.conditional_formatting
            .iter()
            .flat_map(|cf| {
                cf.range
                    .split_whitespace()
                    .filter_map(parse_range)
                    .collect::<Vec<_>>()
            })
            .collect()
    }

    /// Cells of a rectangular window, ready for rendering.
    pub fn cells(&self, sheet: u32, win: Rect, show_formulas: bool) -> AppResult<CellsChunk> {
        let model = self.m();
        let theme = &model.workbook.theme;
        let ws = model.workbook.worksheet(sheet)?;
        let cf_rects: Vec<Rect> = self
            .cf_rects(sheet)
            .into_iter()
            .filter(|r| r.intersects(&win))
            .collect();
        let mut styles: Vec<StyleDto> = vec![self.style_dto(&Style {
            font: ironcalc_base::types::Font {
                name: self.default_font.name.clone(),
                sz: self.default_font.size,
                ..Default::default()
            },
            ..Default::default()
        })];
        let mut style_index: HashMap<i32, u32> = HashMap::new();
        style_index.insert(0, 0);
        let mut cells: Vec<CellDto> = Vec::new();
        let mut seen: std::collections::HashSet<(i32, i32)> = Default::default();

        let rows_iter: Box<dyn Iterator<Item = i32>> = if (win.r2 - win.r1) as usize > ws.sheet_data.len() {
            let mut keys: Vec<i32> = ws
                .sheet_data
                .keys()
                .copied()
                .filter(|r| *r >= win.r1 && *r <= win.r2)
                .collect();
            keys.sort_unstable();
            Box::new(keys.into_iter())
        } else {
            Box::new(win.r1..=win.r2)
        };

        for row in rows_iter {
            let Some(row_data) = ws.sheet_data.get(&row) else {
                continue;
            };
            for (&col, cell) in row_data.iter() {
                if col < win.c1 || col > win.c2 {
                    continue;
                }
                let k = cell_kind(cell);
                let in_cf = cf_rects.iter().any(|r| r.contains(row, col));
                let text = if k == kind::EMPTY {
                    String::new()
                } else if show_formulas && (k & kind::FORMULA) != 0 {
                    model
                        .get_localized_cell_content(sheet, row, col)
                        .unwrap_or_default()
                } else {
                    model
                        .get_formatted_cell_value(sheet, row, col)
                        .unwrap_or_default()
                };
                let (s, extra) = if in_cf {
                    let ext = model.get_extended_style_for_cell(sheet, row, col)?;
                    styles.push(self.style_dto(&ext.style));
                    (
                        (styles.len() - 1) as u32,
                        cf_extra(&ext.data_bar, &ext.icon, &ext.rating, theme),
                    )
                } else if k & 7 == kind::NUMBER && self.num_fmt_has_color(sheet, row, col) {
                    // Number formats like "#,##0;[Red]-#,##0" colour the text
                    let style = model.get_style_for_cell(sheet, row, col)?;
                    let mut dto = self.style_dto(&style);
                    if let Ok(CellValue::Number(n)) = model.get_cell_value_by_index(sheet, row, col) {
                        if let Some(color) = format_color(n, &style.num_fmt) {
                            dto.color = Some(color.to_string());
                        }
                    }
                    styles.push(dto);
                    ((styles.len() - 1) as u32, None)
                } else {
                    let xf = cell.get_style();
                    let idx = match style_index.get(&xf) {
                        Some(i) => *i,
                        None => {
                            let style = model.get_style_for_cell(sheet, row, col)?;
                            styles.push(self.style_dto(&style));
                            let i = (styles.len() - 1) as u32;
                            style_index.insert(xf, i);
                            i
                        }
                    };
                    (idx, None)
                };
                if k == kind::EMPTY && s == 0 && extra.is_none() {
                    continue;
                }
                seen.insert((row, col));
                cells.push((row, col, text, k, s, extra));
            }
        }
        // Empty cells that conditional formatting paints (e.g. "Blanks" rules).
        for rect in &cf_rects {
            let r = Rect::new(
                rect.r1.max(win.r1),
                rect.c1.max(win.c1),
                rect.r2.min(win.r2),
                rect.c2.min(win.c2),
            );
            if (r.width() as i64) * (r.height() as i64) > 20_000 {
                continue;
            }
            for row in r.r1..=r.r2 {
                for col in r.c1..=r.c2 {
                    if seen.contains(&(row, col)) {
                        continue;
                    }
                    let ext = model.get_extended_style_for_cell(sheet, row, col)?;
                    let base = model.get_style_for_cell(sheet, row, col)?;
                    let extra = cf_extra(&ext.data_bar, &ext.icon, &ext.rating, theme);
                    if ext.style != base || extra.is_some() {
                        styles.push(self.style_dto(&ext.style));
                        cells.push((row, col, String::new(), kind::EMPTY, (styles.len() - 1) as u32, extra));
                        seen.insert((row, col));
                    }
                }
            }
        }
        Ok(CellsChunk {
            sheet,
            r1: win.r1,
            c1: win.c1,
            r2: win.r2,
            c2: win.c2,
            cells,
            styles,
        })
    }

    fn num_fmt_has_color(&self, sheet: u32, row: i32, col: i32) -> bool {
        self.m()
            .get_style_for_cell(sheet, row, col)
            .map(|s| s.num_fmt.contains('['))
            .unwrap_or(false)
    }

    pub fn cell_info(&self, sheet: u32, row: i32, col: i32) -> AppResult<CellInfo> {
        let model = self.m();
        let sheet_id = self.sheet_id(sheet)?;
        let ws = model.workbook.worksheet(sheet)?;
        let cell = ws.cell(row, col);
        let k = cell.map(cell_kind).unwrap_or(kind::EMPTY);
        let style = self.model.get_cell_style(sheet, row, col)?;
        let array_anchor = match cell {
            Some(Cell::SpillCell { a, .. }) => Some([a.0, a.1]),
            Some(Cell::ArrayFormula { .. }) => Some([row, col]),
            _ => None,
        };
        // Spill children show the anchor formula (greyed out) in Excel.
        let content = match array_anchor {
            Some([ar, ac]) if ar != row || ac != col => {
                model.get_localized_cell_content(sheet, ar, ac).unwrap_or_default()
            }
            _ => model
                .get_localized_cell_content(sheet, row, col)
                .unwrap_or_default(),
        };
        Ok(CellInfo {
            row,
            col,
            content,
            formatted: model.get_formatted_cell_value(sheet, row, col).unwrap_or_default(),
            kind: k,
            style: self.style_dto(&style),
            merge: self.merges.find(sheet_id, row, col).map(|r| r.to_array()),
            array_anchor,
        })
    }

    pub fn selection_stats(&self, sheet: u32, rect: Rect) -> AppResult<SelectionStats> {
        let model = self.m();
        let ws = model.workbook.worksheet(sheet)?;
        let mut stats = SelectionStats::default();
        for (&row, row_data) in ws.sheet_data.iter() {
            if row < rect.r1 || row > rect.r2 {
                continue;
            }
            for (&col, cell) in row_data.iter() {
                if col < rect.c1 || col > rect.c2 {
                    continue;
                }
                if matches!(cell, Cell::EmptyCell { .. }) {
                    continue;
                }
                match model.get_cell_value_by_index(sheet, row, col)? {
                    CellValue::None => {}
                    CellValue::Number(n) => {
                        stats.count += 1;
                        stats.numeric_count += 1;
                        stats.sum += n;
                        stats.min = Some(stats.min.map_or(n, |m: f64| m.min(n)));
                        stats.max = Some(stats.max.map_or(n, |m: f64| m.max(n)));
                    }
                    CellValue::String(s) => {
                        if !s.is_empty() || cell.has_formula() {
                            stats.count += 1;
                        }
                    }
                    CellValue::Boolean(_) => stats.count += 1,
                }
            }
        }
        Ok(stats)
    }

    pub fn navigate_edge(&self, sheet: u32, row: i32, col: i32, dir: &str) -> AppResult<(i32, i32)> {
        let ws = self.m().workbook.worksheet(sheet)?;
        let direction = match dir {
            "up" => NavigationDirection::Up,
            "down" => NavigationDirection::Down,
            "left" => NavigationDirection::Left,
            _ => NavigationDirection::Right,
        };
        Ok(ws.navigate_to_edge_in_direction(row, col, direction)?)
    }

    pub fn cycle_reference(&self, text: &str, start: usize, end: usize) -> AppResult<(String, i32, i32)> {
        Ok(self.model.cycle_reference(text, start, end)?)
    }

    pub fn defined_names(&self) -> Vec<DefinedNameDto> {
        self.model
            .get_defined_name_list()
            .into_iter()
            .map(|(name, scope, formula)| DefinedNameDto { name, scope, formula })
            .collect()
    }

    pub fn conditional_formats(&self, sheet: u32) -> AppResult<serde_json::Value> {
        let list = self.model.get_conditional_formatting_list(sheet)?;
        let mut out = Vec::new();
        for cf in list {
            let dxf = self
                .model
                .get_dxf_for_conditional_formatting(sheet, cf.index as u32)
                .ok()
                .flatten();
            out.push(json!({ "index": cf.index, "range": cf.range, "rule": cf.cf_rule, "priority": cf.priority, "format": dxf }));
        }
        Ok(serde_json::Value::Array(out))
    }

    pub fn stats(&self) -> WorkbookStats {
        let model = self.m();
        let active = self.model.get_selected_sheet() as usize;
        let mut s = WorkbookStats {
            sheets: model.workbook.worksheets.len(),
            ..Default::default()
        };
        for (i, ws) in model.workbook.worksheets.iter().enumerate() {
            let mut cells = 0;
            let mut formulas = 0;
            for row in ws.sheet_data.values() {
                for cell in row.values() {
                    if !matches!(cell, Cell::EmptyCell { .. }) {
                        cells += 1;
                    }
                    if cell.has_formula() {
                        formulas += 1;
                    }
                }
            }
            s.cells_with_data += cells;
            s.formulas += formulas;
            s.merged_ranges += self.merges.get(ws.sheet_id).len();
            if i == active {
                s.active_sheet_cells = cells;
                s.active_sheet_formulas = formulas;
                if !ws.sheet_data.is_empty() {
                    let d = ws.dimension();
                    s.used_range = Rect::new(d.min_row, d.min_column, d.max_row, d.max_column).to_a1();
                }
            }
        }
        s
    }

    fn used_extent(&self, sheet: u32) -> (i32, i32) {
        match self.m().workbook.worksheet(sheet) {
            Ok(ws) if !ws.sheet_data.is_empty() => {
                let d = ws.dimension();
                (d.max_row, d.max_column)
            }
            _ => (1, 1),
        }
    }

    // ------------------------------------------------------------------
    // Selection helpers (IronCalc paste/style APIs act on the selected view)
    // ------------------------------------------------------------------

    fn select(&mut self, sheet: u32, rect: &Rect) -> AppResult<()> {
        self.model.set_selected_sheet(sheet)?;
        self.model.set_selected_cell(rect.r1, rect.c1)?;
        self.model
            .set_selected_range(rect.r1, rect.c1, rect.r2, rect.c2)?;
        Ok(())
    }

    pub fn set_active_sheet(&mut self, sheet: u32) -> AppResult<()> {
        self.check_sheet(sheet)?;
        self.model.set_selected_sheet(sheet)?;
        Ok(())
    }

    // ------------------------------------------------------------------
    // Cell input
    // ------------------------------------------------------------------

    pub fn set_input(&mut self, sheet: u32, row: i32, col: i32, input: &str, day_first: bool) -> AppResult<()> {
        self.check_sheet(sheet)?;
        let before = self.model.get_row_height(sheet, row)?;
        let parsed = super::input::interpret(input, day_first);
        self.tx(false, |s, tx| {
            match &parsed {
                Some(p) => {
                    let r = s.model.set_user_input(sheet, row, col, &p.value);
                    Self::step(tx, r)?;
                    let fmt = s.m().get_style_for_cell(sheet, row, col)?.num_fmt;
                    if fmt.eq_ignore_ascii_case("general") {
                        let r = s.model.update_range_style(&area(sheet, &Rect::cell(row, col)), "num_fmt", &p.format);
                        Self::step(tx, r)?;
                    }
                }
                None => {
                    let r = s.model.set_user_input(sheet, row, col, input);
                    Self::step(tx, r)?;
                }
            }
            if s.model.get_row_height(sheet, row)? != before {
                tx.layout = true;
            }
            Ok(())
        })
    }

    /// Ctrl+Enter: writes the same input into every cell of the range
    /// (formulas are shifted relative to the first cell like Excel does).
    pub fn set_range_input(&mut self, sheet: u32, rect: Rect, input: &str, day_first: bool) -> AppResult<()> {
        self.check_sheet(sheet)?;
        let parsed = super::input::interpret(input, day_first);
        let input = parsed.as_ref().map(|p| p.value.as_str()).unwrap_or(input);
        let (max_row, max_col) = (rect.r1 + 9_999, rect.c1 + 999);
        let rect = rect.clamp_to(max_row, max_col);
        self.batch(true, |s, tx| {
            let r = s.model.set_user_input(sheet, rect.r1, rect.c1, input);
            Self::step(tx, r)?;
            for row in rect.r1..=rect.r2 {
                for col in rect.c1..=rect.c2 {
                    if row == rect.r1 && col == rect.c1 {
                        continue;
                    }
                    let text = s.m().extend_to(sheet, rect.r1, rect.c1, row, col)?;
                    let r = s.model.set_user_input(sheet, row, col, &text);
                    Self::step(tx, r)?;
                }
            }
            if let Some(p) = &parsed {
                let fmt = s.m().get_style_for_cell(sheet, rect.r1, rect.c1)?.num_fmt;
                if fmt.eq_ignore_ascii_case("general") {
                    let r = s.model.update_range_style(&area(sheet, &rect), "num_fmt", &p.format);
                    Self::step(tx, r)?;
                }
            }
            Ok(())
        })
    }

    pub fn clear(&mut self, sheet: u32, rect: Rect, what: &str) -> AppResult<()> {
        self.check_sheet(sheet)?;
        let sheet_id = self.sheet_id(sheet)?;
        let (max_row, max_col) = self.used_extent(sheet);
        self.tx(what != "contents", |s, tx| {
            match what {
                "contents" => {
                    let r = s.model.range_clear_contents(&area(sheet, &rect.clamp_to(max_row, max_col)));
                    Self::step(tx, r)?;
                }
                "formats" => {
                    let r = s.model.range_clear_formatting(&area(sheet, &rect));
                    Self::step(tx, r)?;
                }
                _ => {
                    let clamped = rect.clamp_to(max_row, max_col);
                    let r = s.model.range_clear_all(&area(sheet, &clamped));
                    Self::step(tx, r)?;
                    if rect.is_full_columns() || rect.is_full_rows() {
                        let r = s.model.range_clear_formatting(&area(sheet, &rect));
                        Self::step(tx, r)?;
                    }
                    s.snapshot_merges(tx);
                    s.merges.remove_intersecting(sheet_id, &rect);
                }
            }
            Ok(())
        })
    }

    // ------------------------------------------------------------------
    // Styles
    // ------------------------------------------------------------------

    pub fn apply_style(&mut self, sheet: u32, rect: Rect, patch: &StylePatch) -> AppResult<()> {
        self.check_sheet(sheet)?;
        let layout = rect.is_full_columns() || rect.is_full_rows();
        if let Some((path, value)) = patch.as_single_path() {
            return self.tx(layout, |s, tx| {
                let r = s.model.update_range_style(&area(sheet, &rect), path, &value);
                Self::step(tx, r)
            });
        }
        // General path: compute every cell's new style and paste them at once.
        let (max_row, max_col) = self.used_extent(sheet);
        let target = if rect.is_full_columns() || rect.is_full_rows() {
            rect.clamp_to(max_row, max_col)
        } else {
            rect
        };
        if (target.width() as i64) * (target.height() as i64) > 2_000_000 {
            return Err(AppError::Invalid("The selection is too large for this operation.".into()));
        }
        let mut styles = Vec::with_capacity(target.height() as usize);
        for row in target.r1..=target.r2 {
            let mut line = Vec::with_capacity(target.width() as usize);
            for col in target.c1..=target.c2 {
                let mut style = self.m().get_style_for_cell(sheet, row, col)?;
                let edges = Edges {
                    top: row == rect.r1,
                    bottom: row == rect.r2.min(target.r2),
                    left: col == rect.c1,
                    right: col == rect.c2.min(target.c2),
                };
                apply_patch(&mut style, patch, edges)?;
                line.push(style);
            }
            styles.push(line);
        }
        self.paste_styles(sheet, target, styles, layout)
    }

    fn paste_styles(&mut self, sheet: u32, target: Rect, styles: Vec<Vec<Style>>, layout: bool) -> AppResult<()> {
        if styles.is_empty() || styles[0].is_empty() {
            return Ok(());
        }
        self.select(sheet, &target)?;
        self.tx(layout, |s, tx| {
            let r = s.model.on_paste_styles(&styles);
            Self::step(tx, r)
        })
    }

    /// Applies one style patch per cell position class (header / odd / even rows) — Format as Table.
    pub fn format_as_table(
        &mut self,
        sheet: u32,
        rect: Rect,
        header: &StylePatch,
        odd: &StylePatch,
        even: &StylePatch,
        has_header: bool,
    ) -> AppResult<()> {
        self.check_sheet(sheet)?;
        let (max_row, max_col) = self.used_extent(sheet);
        let target = if rect.is_full_columns() || rect.is_full_rows() {
            rect.clamp_to(max_row.max(rect.r1 + 1), max_col.max(rect.c1))
        } else {
            rect
        };
        let mut styles = Vec::new();
        for row in target.r1..=target.r2 {
            let mut line = Vec::new();
            for col in target.c1..=target.c2 {
                let mut style = self.m().get_style_for_cell(sheet, row, col)?;
                let edges = Edges {
                    top: row == target.r1,
                    bottom: row == target.r2,
                    left: col == target.c1,
                    right: col == target.c2,
                };
                let index = row - target.r1;
                let patch = if has_header && index == 0 {
                    header
                } else {
                    let data_index = if has_header { index - 1 } else { index };
                    if data_index % 2 == 0 {
                        odd
                    } else {
                        even
                    }
                };
                apply_patch(&mut style, patch, edges)?;
                line.push(style);
            }
            styles.push(line);
        }
        self.paste_styles(sheet, target, styles, false)
    }

    pub fn set_borders(&mut self, sheet: u32, rect: Rect, kind: &str, style: &str, color: &str) -> AppResult<()> {
        self.check_sheet(sheet)?;
        let make = |t: &str, s: &str| -> AppResult<BorderArea> {
            let value = json!({
                "item": { "style": s, "color": if color.is_empty() { "#000000" } else { color } },
                "type": t,
            });
            serde_json::from_value(value).map_err(|e| AppError::Invalid(e.to_string()))
        };
        let steps: Vec<(&str, String)> = match kind {
            "all" => vec![("All", style.to_string())],
            "outer" => vec![("Outer", style.to_string())],
            "inner" => vec![("Inner", style.to_string())],
            "top" => vec![("Top", style.to_string())],
            "bottom" => vec![("Bottom", style.to_string())],
            "left" => vec![("Left", style.to_string())],
            "right" => vec![("Right", style.to_string())],
            "none" => vec![("None", "thin".to_string())],
            "thickOuter" => vec![("Outer", "medium".to_string())],
            "bottomDouble" => vec![("Bottom", "double".to_string())],
            "thickBottom" => vec![("Bottom", "medium".to_string())],
            "topBottom" => vec![("Top", "thin".to_string()), ("Bottom", "thin".to_string())],
            "topThickBottom" => vec![("Top", "thin".to_string()), ("Bottom", "medium".to_string())],
            "topDoubleBottom" => vec![("Top", "thin".to_string()), ("Bottom", "double".to_string())],
            _ => return Err(AppError::Invalid(format!("Unknown border kind '{kind}'"))),
        };
        let areas = steps
            .iter()
            .map(|(t, s)| make(t, s))
            .collect::<AppResult<Vec<_>>>()?;
        self.tx(false, |s, tx| {
            for border in &areas {
                let r = s.model.set_area_with_border(&area(sheet, &rect), border);
                Self::step(tx, r)?;
            }
            Ok(())
        })
    }

    /// Increase / decrease decimal places based on the active cell's format.
    pub fn change_decimals(&mut self, sheet: u32, rect: Rect, active: (i32, i32), delta: i32) -> AppResult<()> {
        let style = self.m().get_style_for_cell(sheet, active.0, active.1)?;
        let shown = self.m().get_formatted_cell_value(sheet, active.0, active.1)?;
        let fmt = change_decimals(&style.num_fmt, &shown, delta);
        let patch = StylePatch {
            num_fmt: Some(fmt),
            ..Default::default()
        };
        self.apply_style(sheet, rect, &patch)
    }

    // ------------------------------------------------------------------
    // Merge cells
    // ------------------------------------------------------------------

    pub fn merge(&mut self, sheet: u32, rect: Rect, mode: &str) -> AppResult<()> {
        self.check_sheet(sheet)?;
        let sheet_id = self.sheet_id(sheet)?;
        if rect.is_full_columns() || rect.is_full_rows() {
            if mode != "unmerge" {
                return Err(AppError::Invalid("Cannot merge entire rows or columns.".into()));
            }
        }
        self.tx(true, |s, tx| {
            s.snapshot_merges(tx);
            match mode {
                "unmerge" => {
                    s.merges.remove_intersecting(sheet_id, &rect);
                }
                "across" => {
                    for row in rect.r1..=rect.r2 {
                        let line = Rect::new(row, rect.c1, row, rect.c2);
                        s.merge_block(sheet, sheet_id, line, tx)?;
                    }
                }
                _ => {
                    s.merge_block(sheet, sheet_id, rect, tx)?;
                    if mode == "center" {
                        let r = s
                            .model
                            .update_range_style(&area(sheet, &Rect::cell(rect.r1, rect.c1)), "alignment.horizontal", "center");
                        Self::step(tx, r)?;
                    }
                }
            }
            Ok(())
        })
    }

    fn merge_block(&mut self, sheet: u32, sheet_id: u32, rect: Rect, tx: &mut Tx) -> AppResult<()> {
        if rect.is_single() {
            return Ok(());
        }
        // Like Excel, only the upper-left value survives.
        let mut keep: Option<(i32, i32)> = None;
        {
            let ws = self.m().workbook.worksheet(sheet)?;
            'outer: for row in rect.r1..=rect.r2 {
                for col in rect.c1..=rect.c2 {
                    if let Some(cell) = ws.cell(row, col) {
                        if !matches!(cell, Cell::EmptyCell { .. }) {
                            keep = Some((row, col));
                            break 'outer;
                        }
                    }
                }
            }
        }
        if let Some((row, col)) = keep {
            if (row, col) != (rect.r1, rect.c1) {
                let content = self.m().extend_to(sheet, row, col, rect.r1, rect.c1)?;
                let r = self.model.set_user_input(sheet, rect.r1, rect.c1, &content);
                Self::step(tx, r)?;
            }
            let others: Vec<Rect> = {
                let mut v = Vec::new();
                if rect.width() > 1 {
                    v.push(Rect::new(rect.r1, rect.c1 + 1, rect.r1, rect.c2));
                }
                if rect.height() > 1 {
                    v.push(Rect::new(rect.r1 + 1, rect.c1, rect.r2, rect.c2));
                }
                v
            };
            for o in others {
                let r = self.model.range_clear_contents(&area(sheet, &o));
                Self::step(tx, r)?;
            }
        }
        self.merges.add(sheet_id, rect);
        Ok(())
    }

    // ------------------------------------------------------------------
    // Rows & columns
    // ------------------------------------------------------------------

    pub fn insert_rows(&mut self, sheet: u32, at: i32, count: i32) -> AppResult<()> {
        let sheet_id = self.sheet_id(sheet)?;
        self.tx(true, |s, tx| {
            let r = s.model.insert_rows(sheet, at, count);
            Self::step(tx, r)?;
            s.snapshot_merges(tx);
            s.merges.insert_rows(sheet_id, at, count);
            Ok(())
        })
    }

    pub fn delete_rows(&mut self, sheet: u32, at: i32, count: i32) -> AppResult<()> {
        let sheet_id = self.sheet_id(sheet)?;
        self.tx(true, |s, tx| {
            let r = s.model.delete_rows(sheet, at, count);
            Self::step(tx, r)?;
            s.snapshot_merges(tx);
            s.merges.delete_rows(sheet_id, at, count);
            Ok(())
        })
    }

    pub fn insert_columns(&mut self, sheet: u32, at: i32, count: i32) -> AppResult<()> {
        let sheet_id = self.sheet_id(sheet)?;
        self.tx(true, |s, tx| {
            let r = s.model.insert_columns(sheet, at, count);
            Self::step(tx, r)?;
            s.snapshot_merges(tx);
            s.merges.insert_columns(sheet_id, at, count);
            Ok(())
        })
    }

    pub fn delete_columns(&mut self, sheet: u32, at: i32, count: i32) -> AppResult<()> {
        let sheet_id = self.sheet_id(sheet)?;
        self.tx(true, |s, tx| {
            let r = s.model.delete_columns(sheet, at, count);
            Self::step(tx, r)?;
            s.snapshot_merges(tx);
            s.merges.delete_columns(sheet_id, at, count);
            Ok(())
        })
    }

    pub fn set_column_width(&mut self, sheet: u32, c1: i32, c2: i32, px: f64) -> AppResult<()> {
        self.check_sheet(sheet)?;
        self.tx(true, |s, tx| {
            if px <= 0.0 {
                let r = s.model.set_columns_hidden(sheet, c1, c2, true);
                return Self::step(tx, r);
            }
            // Unhide first if needed, then size.
            let hidden = (c1..=c2).any(|c| s.m().is_column_hidden(sheet, c).unwrap_or(false));
            if hidden {
                let r = s.model.set_columns_hidden(sheet, c1, c2, false);
                Self::step(tx, r)?;
            }
            let r = s.model.set_columns_width(sheet, c1, c2, px_to_engine_col(px));
            Self::step(tx, r)
        })
    }

    /// Sets several columns to individual widths in one undo step (AutoFit).
    pub fn set_column_widths(&mut self, sheet: u32, widths: &[(i32, f64)]) -> AppResult<()> {
        self.check_sheet(sheet)?;
        self.tx(true, |s, tx| {
            for (col, px) in widths {
                let r = s.model.set_columns_width(sheet, *col, *col, px_to_engine_col(*px));
                Self::step(tx, r)?;
            }
            Ok(())
        })
    }

    pub fn set_row_height(&mut self, sheet: u32, r1: i32, r2: i32, px: f64) -> AppResult<()> {
        self.check_sheet(sheet)?;
        self.tx(true, |s, tx| {
            if px <= 0.0 {
                let r = s.model.set_rows_hidden(sheet, r1, r2, true);
                return Self::step(tx, r);
            }
            let hidden = (r1..=r2.min(r1 + 5000)).any(|r| s.m().is_row_hidden(sheet, r).unwrap_or(false));
            if hidden {
                let r = s.model.set_rows_hidden(sheet, r1, r2, false);
                Self::step(tx, r)?;
            }
            let r = s.model.set_rows_height(sheet, r1, r2, px_to_engine_row(px));
            Self::step(tx, r)
        })
    }

    pub fn set_row_heights(&mut self, sheet: u32, heights: &[(i32, f64)]) -> AppResult<()> {
        self.check_sheet(sheet)?;
        self.tx(true, |s, tx| {
            for (row, px) in heights {
                let r = s.model.set_rows_height(sheet, *row, *row, px_to_engine_row(*px));
                Self::step(tx, r)?;
            }
            Ok(())
        })
    }

    pub fn set_hidden(&mut self, sheet: u32, axis: &str, a: i32, b: i32, hidden: bool) -> AppResult<()> {
        self.check_sheet(sheet)?;
        self.tx(true, |s, tx| {
            let r = if axis == "rows" {
                s.model.set_rows_hidden(sheet, a, b, hidden)
            } else {
                s.model.set_columns_hidden(sheet, a, b, hidden)
            };
            Self::step(tx, r)
        })
    }

    pub fn freeze(&mut self, sheet: u32, rows: i32, cols: i32) -> AppResult<()> {
        self.check_sheet(sheet)?;
        self.tx(true, |s, tx| {
            if s.model.get_frozen_rows_count(sheet)? != rows {
                let r = s.model.set_frozen_rows_count(sheet, rows);
                Self::step(tx, r)?;
            }
            if s.model.get_frozen_columns_count(sheet)? != cols {
                let r = s.model.set_frozen_columns_count(sheet, cols);
                Self::step(tx, r)?;
            }
            Ok(())
        })
    }

    pub fn set_grid_lines(&mut self, sheet: u32, show: bool) -> AppResult<()> {
        self.check_sheet(sheet)?;
        if self.model.get_show_grid_lines(sheet)? == show {
            return Ok(());
        }
        self.tx(true, |s, tx| {
            let r = s.model.set_show_grid_lines(sheet, show);
            Self::step(tx, r)
        })
    }

    // ------------------------------------------------------------------
    // Sheets
    // ------------------------------------------------------------------

    pub fn add_sheet(&mut self, after: Option<u32>) -> AppResult<u32> {
        self.tx(true, |s, tx| {
            let r = s.model.new_sheet();
            Self::step(tx, r)?;
            let count = s.m().workbook.worksheets.len() as u32;
            let mut index = count - 1;
            if let Some(after) = after {
                let target = (after + 1).min(count - 1);
                if target != index {
                    let r = s.model.move_sheet(index, target);
                    Self::step(tx, r)?;
                    index = target;
                }
            }
            s.model.set_selected_sheet(index)?;
            Ok(index)
        })
    }

    pub fn delete_sheet(&mut self, sheet: u32) -> AppResult<()> {
        let visible = self
            .m()
            .workbook
            .worksheets
            .iter()
            .filter(|w| w.state == SheetState::Visible)
            .count();
        if visible <= 1 {
            return Err(AppError::Invalid("A workbook must contain at least one visible worksheet.".into()));
        }
        let sheet_id = self.sheet_id(sheet)?;
        self.tx(true, |s, tx| {
            let r = s.model.delete_sheet(sheet);
            Self::step(tx, r)?;
            s.snapshot_merges(tx);
            s.merges.remove_sheet(sheet_id);
            Ok(())
        })
    }

    pub fn rename_sheet(&mut self, sheet: u32, name: &str) -> AppResult<()> {
        let name = name.trim();
        if name.is_empty() {
            return Err(AppError::Invalid("You typed an invalid name for a sheet.".into()));
        }
        if name.chars().count() > 31 || name.contains(['\\', '/', '?', '*', '[', ']', ':']) {
            return Err(AppError::Invalid(
                "Sheet names can't exceed 31 characters or contain \\ / ? * [ ] :".into(),
            ));
        }
        let current = self.m().workbook.worksheet(sheet)?.name.clone();
        if current == name {
            return Ok(());
        }
        self.tx(false, |s, tx| {
            let r = s.model.rename_sheet(sheet, name);
            Self::step(tx, r)
        })
    }

    pub fn move_sheet(&mut self, from: u32, to: u32) -> AppResult<()> {
        if from == to {
            return Ok(());
        }
        self.tx(true, |s, tx| {
            let r = s.model.move_sheet(from, to);
            Self::step(tx, r)
        })
    }

    pub fn duplicate_sheet(&mut self, sheet: u32) -> AppResult<u32> {
        let from_id = self.sheet_id(sheet)?;
        self.tx(true, |s, tx| {
            let r = s.model.duplicate_sheet(sheet);
            Self::step(tx, r)?;
            let index = s.model.get_selected_sheet();
            let new_id = s.sheet_id(index)?;
            s.snapshot_merges(tx);
            s.merges.copy_sheet(from_id, new_id);
            Ok(index)
        })
    }

    pub fn set_sheet_hidden(&mut self, sheet: u32, hidden: bool) -> AppResult<()> {
        if hidden {
            let visible = self
                .m()
                .workbook
                .worksheets
                .iter()
                .filter(|w| w.state == SheetState::Visible)
                .count();
            if visible <= 1 {
                return Err(AppError::Invalid("A workbook must contain at least one visible worksheet.".into()));
            }
        }
        self.tx(true, |s, tx| {
            let r = if hidden {
                s.model.hide_sheet(sheet)
            } else {
                s.model.unhide_sheet(sheet)
            };
            Self::step(tx, r)?;
            if !hidden {
                s.model.set_selected_sheet(sheet)?;
            }
            Ok(())
        })
    }

    pub fn set_sheet_color(&mut self, sheet: u32, color: &str) -> AppResult<()> {
        let color = super::styling::parse_color(color)?;
        self.tx(false, |s, tx| {
            let r = s.model.set_sheet_color(sheet, &color);
            Self::step(tx, r)
        })
    }

    // ------------------------------------------------------------------
    // Clipboard
    // ------------------------------------------------------------------

    pub fn copy(&mut self, sheet: u32, rect: Rect, is_cut: bool) -> AppResult<ClipboardPayload> {
        self.check_sheet(sheet)?;
        let (max_row, max_col) = self.used_extent(sheet);
        let rect = if rect.is_full_columns() || rect.is_full_rows() {
            rect.clamp_to(max_row, max_col)
        } else {
            rect
        };
        if (rect.width() as i64) * (rect.height() as i64) > 1_000_000 {
            return Err(AppError::Invalid("The copy area is too large.".into()));
        }
        self.select(sheet, &rect)?;
        let clipboard = self.model.copy_to_clipboard()?;
        let value = serde_json::to_value(&clipboard).map_err(|e| AppError::Engine(e.to_string()))?;
        let model = self.m();
        let mut values = Vec::new();
        let mut styles = Vec::new();
        for row in rect.r1..=rect.r2 {
            let mut vline = Vec::new();
            let mut sline = Vec::new();
            for col in rect.c1..=rect.c2 {
                let v = match model.get_cell_value_by_index(sheet, row, col)? {
                    CellValue::None => None,
                    CellValue::Number(n) => Some(format_number_input(n)),
                    CellValue::Boolean(b) => Some(if b { "TRUE".into() } else { "FALSE".into() }),
                    CellValue::String(s) => {
                        if s.is_empty() {
                            None
                        } else if looks_like_input(&s) {
                            Some(format!("'{s}"))
                        } else {
                            Some(s)
                        }
                    }
                };
                vline.push(v);
                sline.push(model.get_style_for_cell(sheet, row, col)?);
            }
            values.push(vline);
            styles.push(sline);
        }
        let text = value
            .get("csv")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        Ok(ClipboardPayload {
            book_id: self.id.clone(),
            sheet,
            rect,
            is_cut,
            data: value.get("data").cloned().unwrap_or(serde_json::Value::Null),
            values,
            styles,
            text,
        })
    }

    /// Pastes the internal clipboard. `mode`: all | values | formats | formulas.
    pub fn paste(&mut self, sheet: u32, target: Rect, clip: &ClipboardPayload, mode: &str) -> AppResult<Rect> {
        self.check_sheet(sheet)?;
        let h = clip.rect.height();
        let w = clip.rect.width();
        // Excel repeats the copied block when the target is an exact multiple.
        let (rep_r, rep_c) = if target.height() % h == 0 && target.width() % w == 0 && !target.is_single() {
            (target.height() / h, target.width() / w)
        } else {
            (1, 1)
        };
        let pasted = Rect::new(target.r1, target.c1, target.r1 + h * rep_r - 1, target.c1 + w * rep_c - 1);
        if pasted.r2 > LAST_ROW || pasted.c2 > LAST_COLUMN {
            return Err(AppError::Invalid("The paste area extends beyond the end of the sheet.".into()));
        }
        let same_book = clip.book_id == self.id;
        match mode {
            "formats" => {
                let mut styles = Vec::new();
                for rr in 0..h * rep_r {
                    let mut line = Vec::new();
                    for cc in 0..w * rep_c {
                        line.push(clip.styles[(rr % h) as usize][(cc % w) as usize].clone());
                    }
                    styles.push(line);
                }
                self.paste_styles(sheet, pasted, styles, false)?;
            }
            "values" => {
                let mut block = Vec::new();
                for rr in 0..h * rep_r {
                    for cc in 0..w * rep_c {
                        let row = pasted.r1 + rr;
                        let col = pasted.c1 + cc;
                        let style = self.m().get_style_for_cell(sheet, row, col)?;
                        block.push((row, col, clip.values[(rr % h) as usize][(cc % w) as usize].clone(), style));
                    }
                }
                self.write_block(sheet, pasted, block, true)?;
            }
            "formulas" => {
                // Formulas/values but keep target formatting
                let mut block = Vec::new();
                for rr in 0..h * rep_r {
                    for cc in 0..w * rep_c {
                        let row = pasted.r1 + rr;
                        let col = pasted.c1 + cc;
                        let src_row = clip.rect.r1 + rr % h;
                        let src_col = clip.rect.c1 + cc % w;
                        let text = clip
                            .data
                            .get(src_row.to_string())
                            .and_then(|r| r.get(src_col.to_string()))
                            .and_then(|c| c.get("text"))
                            .and_then(|t| t.as_str())
                            .unwrap_or_default()
                            .to_string();
                        let text = if text.starts_with('=') && same_book {
                            self.displace_formula(clip.sheet, &text, (src_row, src_col), (row, col))?
                        } else {
                            text
                        };
                        let style = self.m().get_style_for_cell(sheet, row, col)?;
                        block.push((row, col, if text.is_empty() { None } else { Some(text) }, style));
                    }
                }
                self.write_block(sheet, pasted, block, true)?;
            }
            _ => {
                let data: ironcalc_base::ClipboardData = serde_json::from_value(clip.data.clone())
                    .map_err(|e| AppError::Engine(e.to_string()))?;
                let source = (clip.rect.r1, clip.rect.c1, clip.rect.r2, clip.rect.c2);
                let cut_here = clip.is_cut && same_book;
                self.batch(true, |s, tx| {
                    for rr in 0..rep_r {
                        for cc in 0..rep_c {
                            let r1 = pasted.r1 + rr * h;
                            let c1 = pasted.c1 + cc * w;
                            s.select(sheet, &Rect::cell(r1, c1))?;
                            let r = s.model.paste_from_clipboard(clip.sheet, source, &data, cut_here);
                            Self::step(tx, r)?;
                        }
                    }
                    Ok(())
                })?;
            }
        }
        Ok(pasted)
    }

    fn displace_formula(&self, sheet: u32, text: &str, from: (i32, i32), to: (i32, i32)) -> AppResult<String> {
        // Use a scratch copy of the formula at its source position is not possible
        // without mutation, so rely on extend_to when the source still holds it.
        let current = self.m().get_localized_cell_content(sheet, from.0, from.1).unwrap_or_default();
        if current == text {
            Ok(self.m().extend_to(sheet, from.0, from.1, to.0, to.1)?)
        } else {
            Ok(text.to_string())
        }
    }

    /// Pastes plain text (from another application) as tab separated values.
    pub fn paste_text(&mut self, sheet: u32, target: Rect, text: &str) -> AppResult<Rect> {
        self.check_sheet(sheet)?;
        let text = text.replace("\r\n", "\n");
        let text = text.trim_end_matches('\n');
        if text.is_empty() {
            return Ok(Rect::cell(target.r1, target.c1));
        }
        let rows = text.split('\n').count() as i32;
        let cols = text.split('\n').map(|l| l.split('\t').count()).max().unwrap_or(1) as i32;
        self.select(sheet, &Rect::cell(target.r1, target.c1))?;
        self.tx(true, |s, tx| {
            let r = s.model.paste_csv_string(&area(sheet, &Rect::cell(target.r1, target.c1)), text);
            Self::step(tx, r)
        })?;
        Ok(Rect::new(target.r1, target.c1, target.r1 + rows - 1, target.c1 + cols - 1))
    }

    /// Writes a full rectangle of `(row, col, input or None, style)` in a single
    /// undo step. `None` leaves the cell empty but still applies its style.
    fn write_block(
        &mut self,
        sheet: u32,
        rect: Rect,
        cells: Vec<(i32, i32, Option<String>, Style)>,
        layout: bool,
    ) -> AppResult<()> {
        let mut data = serde_json::Map::new();
        for (row, col, text, style) in cells {
            let entry = data
                .entry(row.to_string())
                .or_insert_with(|| serde_json::Value::Object(Default::default()));
            let is_spill = text.is_none();
            entry.as_object_mut().unwrap().insert(
                col.to_string(),
                json!({ "text": text.unwrap_or_default(), "is_spill": is_spill, "style": style }),
            );
        }
        let data: ironcalc_base::ClipboardData = serde_json::from_value(serde_json::Value::Object(data))
            .map_err(|e| AppError::Engine(e.to_string()))?;
        self.select(sheet, &Rect::cell(rect.r1, rect.c1))?;
        let source = (rect.r1, rect.c1, rect.r2, rect.c2);
        self.tx(layout, |s, tx| {
            let r = s.model.paste_from_clipboard(sheet, source, &data, true);
            Self::step(tx, r)
        })
    }

    /// Excel's CurrentRegion: the block of non-empty cells around (row, col).
    pub fn current_region(&self, sheet: u32, row: i32, col: i32) -> AppResult<Rect> {
        let ws = self.m().workbook.worksheet(sheet)?;
        let filled = |r: i32, c: i32| -> bool {
            r >= 1
                && c >= 1
                && r <= LAST_ROW
                && c <= LAST_COLUMN
                && ws.cell(r, c).map(|x| !matches!(x, Cell::EmptyCell { .. })).unwrap_or(false)
        };
        let mut rect = Rect::cell(row, col);
        let mut guard = 0;
        loop {
            guard += 1;
            if guard > 2_000_000 {
                break;
            }
            let (c_lo, c_hi) = ((rect.c1 - 1).max(1), (rect.c2 + 1).min(LAST_COLUMN));
            let (r_lo, r_hi) = ((rect.r1 - 1).max(1), (rect.r2 + 1).min(LAST_ROW));
            let mut changed = false;
            if rect.r1 > 1 && (c_lo..=c_hi).any(|c| filled(rect.r1 - 1, c)) {
                rect.r1 -= 1;
                changed = true;
            }
            if rect.r2 < LAST_ROW && (c_lo..=c_hi).any(|c| filled(rect.r2 + 1, c)) {
                rect.r2 += 1;
                changed = true;
            }
            if rect.c1 > 1 && (r_lo..=r_hi).any(|r| filled(r, rect.c1 - 1)) {
                rect.c1 -= 1;
                changed = true;
            }
            if rect.c2 < LAST_COLUMN && (r_lo..=r_hi).any(|r| filled(r, rect.c2 + 1)) {
                rect.c2 += 1;
                changed = true;
            }
            if !changed {
                break;
            }
        }
        Ok(rect)
    }

    /// Moves a block of cells (values, formulas, formats) like cut & paste.
    fn move_block(&mut self, sheet: u32, block: Rect, to: (i32, i32), tx: &mut Tx) -> AppResult<()> {
        self.select(sheet, &block)?;
        let clipboard = self.model.copy_to_clipboard()?;
        let value = serde_json::to_value(&clipboard).map_err(|e| AppError::Engine(e.to_string()))?;
        let data: ironcalc_base::ClipboardData = serde_json::from_value(value.get("data").cloned().unwrap_or_default())
            .map_err(|e| AppError::Engine(e.to_string()))?;
        self.select(sheet, &Rect::cell(to.0, to.1))?;
        let r = self
            .model
            .paste_from_clipboard(sheet, (block.r1, block.c1, block.r2, block.c2), &data, true);
        Self::step(tx, r)
    }

    /// Insert Cells: shift the cells below ("down") or to the right ("right").
    pub fn insert_cells(&mut self, sheet: u32, rect: Rect, shift: &str) -> AppResult<()> {
        let (max_row, max_col) = self.used_extent(sheet);
        self.batch(true, |s, tx| {
            if shift == "right" {
                if max_col >= rect.c1 {
                    let block = Rect::new(rect.r1, rect.c1, rect.r2, max_col);
                    if block.c2 + rect.width() > LAST_COLUMN {
                        return Err(AppError::Invalid("Cannot shift cells off the sheet.".into()));
                    }
                    s.move_block(sheet, block, (rect.r1, rect.c1 + rect.width()), tx)?;
                }
            } else if max_row >= rect.r1 {
                let block = Rect::new(rect.r1, rect.c1, max_row, rect.c2);
                if block.r2 + rect.height() > LAST_ROW {
                    return Err(AppError::Invalid("Cannot shift cells off the sheet.".into()));
                }
                s.move_block(sheet, block, (rect.r1 + rect.height(), rect.c1), tx)?;
            }
            Ok(())
        })
    }

    /// Delete Cells: shift the cells below up ("up") or from the right left ("left").
    pub fn delete_cells(&mut self, sheet: u32, rect: Rect, shift: &str) -> AppResult<()> {
        let (max_row, max_col) = self.used_extent(sheet);
        self.batch(true, |s, tx| {
            let r = s.model.range_clear_all(&area(sheet, &rect));
            Self::step(tx, r)?;
            if shift == "left" {
                if max_col > rect.c2 {
                    let block = Rect::new(rect.r1, rect.c2 + 1, rect.r2, max_col);
                    s.move_block(sheet, block, (rect.r1, rect.c1), tx)?;
                }
            } else if max_row > rect.r2 {
                let block = Rect::new(rect.r2 + 1, rect.c1, max_row, rect.c2);
                s.move_block(sheet, block, (rect.r1, rect.c1), tx)?;
            }
            Ok(())
        })
    }

    // ------------------------------------------------------------------
    // Fill, sort, dedupe
    // ------------------------------------------------------------------

    /// Fill-handle drag / Ctrl+D / Ctrl+R. `target` includes the source.
    pub fn auto_fill(&mut self, sheet: u32, source: Rect, target: Rect) -> AppResult<()> {
        self.check_sheet(sheet)?;
        self.tx(true, |s, tx| {
            if target.r2 > source.r2 || target.r1 < source.r1 {
                let to_row = if target.r2 > source.r2 { target.r2 } else { target.r1 };
                let r = s.model.auto_fill_rows(&area(sheet, &source), to_row);
                Self::step(tx, r)?;
            } else if target.c2 > source.c2 || target.c1 < source.c1 {
                let to_col = if target.c2 > source.c2 { target.c2 } else { target.c1 };
                let r = s.model.auto_fill_columns(&area(sheet, &source), to_col);
                Self::step(tx, r)?;
            }
            Ok(())
        })
    }

    fn has_arrays(&self, sheet: u32, rect: &Rect) -> AppResult<bool> {
        let ws = self.m().workbook.worksheet(sheet)?;
        for (&row, data) in &ws.sheet_data {
            if row < rect.r1 || row > rect.r2 {
                continue;
            }
            for (&col, cell) in data {
                if col >= rect.c1
                    && col <= rect.c2
                    && matches!(cell, Cell::ArrayFormula { .. } | Cell::SpillCell { .. })
                {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }

    fn row_snapshot(&self, sheet: u32, row: i32, rect: &Rect) -> AppResult<Vec<(Option<String>, bool, Style)>> {
        let model = self.m();
        let ws = model.workbook.worksheet(sheet)?;
        let mut out = Vec::new();
        for col in rect.c1..=rect.c2 {
            let cell = ws.cell(row, col);
            let has_value = cell.map(|c| !matches!(c, Cell::EmptyCell { .. })).unwrap_or(false);
            let content = if has_value {
                Some(model.get_localized_cell_content(sheet, row, col)?)
            } else {
                None
            };
            let is_formula = cell.map(|c| c.has_formula()).unwrap_or(false);
            out.push((content, is_formula, model.get_style_for_cell(sheet, row, col)?));
        }
        Ok(out)
    }

    fn rewrite_rows(&mut self, sheet: u32, rect: Rect, order: &[Option<i32>]) -> AppResult<()> {
        // order[i] = source row for destination row rect.r1 + i (None = clear value)
        let mut block = Vec::new();
        for (i, src) in order.iter().enumerate() {
            let dst = rect.r1 + i as i32;
            match src {
                Some(src) => {
                    let snapshot = self.row_snapshot(sheet, *src, &rect)?;
                    for (j, (content, is_formula, style)) in snapshot.into_iter().enumerate() {
                        let col = rect.c1 + j as i32;
                        let text = match content {
                            Some(_) if is_formula && *src != dst => {
                                Some(self.m().extend_to(sheet, *src, col, dst, col)?)
                            }
                            other => other,
                        };
                        block.push((dst, col, text, style));
                    }
                }
                None => {
                    for col in rect.c1..=rect.c2 {
                        block.push((dst, col, None, self.m().get_style_for_cell(sheet, dst, col)?));
                    }
                }
            }
        }
        self.write_block(sheet, rect, block, false)
    }

    pub fn sort(&mut self, sheet: u32, rect: Rect, keys: &[SortKey], has_header: bool) -> AppResult<()> {
        self.check_sheet(sheet)?;
        let (max_row, max_col) = self.used_extent(sheet);
        let rect = rect.clamp_to(max_row, max_col);
        let data = Rect::new(if has_header { rect.r1 + 1 } else { rect.r1 }, rect.c1, rect.r2, rect.c2);
        if data.r1 > data.r2 {
            return Ok(());
        }
        if self.has_arrays(sheet, &data)? {
            return Err(AppError::Invalid("Cannot sort a range that contains array formulas.".into()));
        }
        let model = self.m();
        // Sort key per row
        #[derive(Clone)]
        enum K {
            Num(f64),
            Text(String),
            Bool(bool),
            Err,
            Blank,
        }
        fn rank(k: &K) -> u8 {
            match k {
                K::Num(_) => 0,
                K::Text(_) => 1,
                K::Bool(_) => 2,
                K::Err => 3,
                K::Blank => 4,
            }
        }
        let mut rows: Vec<(i32, Vec<K>)> = Vec::new();
        for row in data.r1..=data.r2 {
            let mut ks = Vec::new();
            for key in keys {
                let ws = model.workbook.worksheet(sheet)?;
                let is_err = ws
                    .cell(row, key.column)
                    .map(|c| c.get_type() == ironcalc_base::types::CellType::ErrorValue)
                    .unwrap_or(false);
                let k = if is_err {
                    K::Err
                } else {
                    match model.get_cell_value_by_index(sheet, row, key.column)? {
                        CellValue::None => K::Blank,
                        CellValue::Number(n) => K::Num(n),
                        CellValue::String(s) if s.is_empty() => K::Blank,
                        CellValue::String(s) => K::Text(s.to_lowercase()),
                        CellValue::Boolean(b) => K::Bool(b),
                    }
                };
                ks.push(k);
            }
            rows.push((row, ks));
        }
        rows.sort_by(|a, b| {
            for (i, key) in keys.iter().enumerate() {
                let (x, y) = (&a.1[i], &b.1[i]);
                // Blanks always sort last
                let ord = match (x, y) {
                    (K::Blank, K::Blank) => std::cmp::Ordering::Equal,
                    (K::Blank, _) => return std::cmp::Ordering::Greater,
                    (_, K::Blank) => return std::cmp::Ordering::Less,
                    (K::Num(p), K::Num(q)) => p.partial_cmp(q).unwrap_or(std::cmp::Ordering::Equal),
                    (K::Text(p), K::Text(q)) => p.cmp(q),
                    (K::Bool(p), K::Bool(q)) => p.cmp(q),
                    _ => rank(x).cmp(&rank(y)),
                };
                let ord = if key.ascending { ord } else { ord.reverse() };
                if ord != std::cmp::Ordering::Equal {
                    return ord;
                }
            }
            std::cmp::Ordering::Equal
        });
        let order: Vec<Option<i32>> = rows.iter().map(|(r, _)| Some(*r)).collect();
        if order.iter().enumerate().all(|(i, r)| *r == Some(data.r1 + i as i32)) {
            return Ok(());
        }
        self.rewrite_rows(sheet, data, &order)
    }

    /// Removes duplicate rows (by the given columns). Returns (removed, remaining).
    pub fn remove_duplicates(&mut self, sheet: u32, rect: Rect, columns: &[i32], has_header: bool) -> AppResult<(usize, usize)> {
        self.check_sheet(sheet)?;
        let (max_row, max_col) = self.used_extent(sheet);
        let rect = rect.clamp_to(max_row, max_col);
        let data = Rect::new(if has_header { rect.r1 + 1 } else { rect.r1 }, rect.c1, rect.r2, rect.c2);
        if data.r1 > data.r2 {
            return Ok((0, 0));
        }
        if self.has_arrays(sheet, &data)? {
            return Err(AppError::Invalid("Cannot change part of an array.".into()));
        }
        let cols: Vec<i32> = if columns.is_empty() {
            (data.c1..=data.c2).collect()
        } else {
            columns.to_vec()
        };
        let mut seen = std::collections::HashSet::new();
        let mut keep = Vec::new();
        for row in data.r1..=data.r2 {
            let key: Vec<String> = cols
                .iter()
                .map(|c| {
                    self.m()
                        .get_formatted_cell_value(sheet, row, *c)
                        .unwrap_or_default()
                        .to_lowercase()
                })
                .collect();
            if seen.insert(key) {
                keep.push(row);
            }
        }
        let total = data.height() as usize;
        let removed = total - keep.len();
        if removed == 0 {
            return Ok((0, total));
        }
        let mut order: Vec<Option<i32>> = keep.iter().map(|r| Some(*r)).collect();
        order.resize(total, None);
        self.rewrite_rows(sheet, data, &order)?;
        Ok((removed, keep.len()))
    }

    // ------------------------------------------------------------------
    // Find & replace
    // ------------------------------------------------------------------

    pub fn find(&self, sheet: u32, query: &str, opts: &FindOptions) -> AppResult<Vec<FoundCell>> {
        if query.is_empty() {
            return Ok(vec![]);
        }
        let model = self.m();
        let needle = if opts.match_case { query.to_string() } else { query.to_lowercase() };
        let sheets: Vec<u32> = if opts.all_sheets {
            (0..model.workbook.worksheets.len() as u32).collect()
        } else {
            vec![sheet]
        };
        let mut found = Vec::new();
        for sh in sheets {
            let ws = model.workbook.worksheet(sh)?;
            if ws.state != SheetState::Visible {
                continue;
            }
            let mut rows: Vec<i32> = ws.sheet_data.keys().copied().collect();
            rows.sort_unstable();
            for row in rows {
                let data = &ws.sheet_data[&row];
                let mut cols: Vec<i32> = data.keys().copied().collect();
                cols.sort_unstable();
                for col in cols {
                    if matches!(data[&col], Cell::EmptyCell { .. }) {
                        continue;
                    }
                    let text = if opts.in_formulas {
                        model.get_localized_cell_content(sh, row, col)?
                    } else {
                        model.get_formatted_cell_value(sh, row, col)?
                    };
                    let hay = if opts.match_case { text.clone() } else { text.to_lowercase() };
                    let hit = if opts.whole_cell { hay == needle } else { hay.contains(&needle) };
                    if hit {
                        found.push(FoundCell { sheet: sh, row, col, text });
                    }
                }
            }
        }
        Ok(found)
    }

    fn replace_text(text: &str, query: &str, replacement: &str, opts: &FindOptions) -> Option<String> {
        if opts.whole_cell {
            let equal = if opts.match_case {
                text == query
            } else {
                text.to_lowercase() == query.to_lowercase()
            };
            return if equal { Some(replacement.to_string()) } else { None };
        }
        if opts.match_case {
            if text.contains(query) {
                return Some(text.replace(query, replacement));
            }
            return None;
        }
        let lower = text.to_lowercase();
        let q = query.to_lowercase();
        if !lower.contains(&q) || lower.len() != text.len() {
            if lower.contains(&q) {
                // Fallback for case mappings that change byte length
                return Some(lower.replace(&q, replacement));
            }
            return None;
        }
        let mut out = String::new();
        let mut i = 0;
        while let Some(pos) = lower[i..].find(&q) {
            out.push_str(&text[i..i + pos]);
            out.push_str(replacement);
            i += pos + q.len();
        }
        out.push_str(&text[i..]);
        Some(out)
    }

    /// Replaces in the given cells (or all matches when `cells` is None). Returns count.
    pub fn replace(
        &mut self,
        sheet: u32,
        query: &str,
        replacement: &str,
        opts: &FindOptions,
        only: Option<(u32, i32, i32)>,
    ) -> AppResult<usize> {
        let formula_opts = FindOptions { in_formulas: true, ..opts.clone() };
        let targets: Vec<(u32, i32, i32, String)> = match only {
            Some((sh, r, c)) => {
                let content = self.m().get_localized_cell_content(sh, r, c)?;
                vec![(sh, r, c, content)]
            }
            None => self
                .find(sheet, query, &formula_opts)?
                .into_iter()
                .map(|f| (f.sheet, f.row, f.col, f.text))
                .collect(),
        };
        let mut edits = Vec::new();
        for (sh, r, c, content) in targets {
            if let Some(new_text) = Self::replace_text(&content, query, replacement, opts) {
                if new_text != content {
                    edits.push((sh, r, c, new_text));
                }
            }
        }
        let count = edits.len();
        if count == 0 {
            return Ok(0);
        }
        self.batch(false, |s, tx| {
            for (sh, r, c, text) in &edits {
                let res = s.model.set_user_input(*sh, *r, *c, text);
                Self::step(tx, res)?;
            }
            Ok(())
        })?;
        Ok(count)
    }

    // ------------------------------------------------------------------
    // Names & conditional formatting
    // ------------------------------------------------------------------

    pub fn add_name(&mut self, name: &str, scope: Option<u32>, formula: &str) -> AppResult<()> {
        let formula = formula.trim_start_matches('=');
        self.tx(false, |s, tx| {
            let r = s.model.new_defined_name(name, scope, formula);
            Self::step(tx, r)
        })
    }

    pub fn update_name(&mut self, name: &str, scope: Option<u32>, new_name: &str, new_scope: Option<u32>, formula: &str) -> AppResult<()> {
        let formula = formula.trim_start_matches('=');
        self.tx(false, |s, tx| {
            let r = s.model.update_defined_name(name, scope, new_name, new_scope, formula);
            Self::step(tx, r)
        })
    }

    pub fn delete_name(&mut self, name: &str, scope: Option<u32>) -> AppResult<()> {
        self.tx(false, |s, tx| {
            let r = s.model.delete_defined_name(name, scope);
            Self::step(tx, r)
        })
    }

    pub fn add_conditional_format(&mut self, sheet: u32, range: &str, rule: serde_json::Value) -> AppResult<()> {
        let rule: CfRuleInput = serde_json::from_value(rule).map_err(|e| AppError::Invalid(format!("Invalid rule: {e}")))?;
        self.tx(false, |s, tx| {
            let r = s.model.add_conditional_formatting(sheet, range, rule);
            Self::step(tx, r)
        })
    }

    pub fn delete_conditional_format(&mut self, sheet: u32, index: u32) -> AppResult<()> {
        self.tx(false, |s, tx| {
            let r = s.model.delete_conditional_formatting(sheet, index);
            Self::step(tx, r)
        })
    }

    /// Removes rules intersecting `rect` (or every rule of the sheet when None).
    pub fn clear_conditional_formats(&mut self, sheet: u32, rect: Option<Rect>) -> AppResult<()> {
        let list = self.model.get_conditional_formatting_list(sheet)?;
        let mut indices: Vec<u32> = list
            .iter()
            .filter(|cf| match rect {
                None => true,
                Some(r) => cf.range.split_whitespace().filter_map(parse_range).any(|x| x.intersects(&r)),
            })
            .map(|cf| cf.index as u32)
            .collect();
        indices.sort_unstable_by(|a, b| b.cmp(a));
        if indices.is_empty() {
            return Ok(());
        }
        self.tx(false, |s, tx| {
            for index in &indices {
                let r = s.model.delete_conditional_formatting(sheet, *index);
                Self::step(tx, r)?;
            }
            Ok(())
        })
    }

    pub fn recalculate(&mut self) {
        self.model.evaluate();
    }

    // ------------------------------------------------------------------
    // Export
    // ------------------------------------------------------------------

    /// Builds a standalone model for saving: merges written back, engine default
    /// fonts normalized to the workbook font.
    pub fn export_model(&self) -> AppResult<Model<'static>> {
        let bytes = self.model.to_bytes();
        let mut model = Model::from_bytes(&bytes, "en")?;
        self.merges.write_into(&mut model.workbook);
        let default = self.default_font.clone();
        for font in model.workbook.styles.fonts.iter_mut() {
            if super::dto::is_engine_default_font(&font.name, font.sz) {
                font.name = default.name.clone();
                font.sz = default.size;
            }
        }
        model.workbook.name = self.title.clone();
        Ok(model)
    }

    /// Displayed values of a sheet (for CSV export).
    pub fn sheet_values(&self, sheet: u32) -> AppResult<Vec<Vec<String>>> {
        let model = self.m();
        let ws = model.workbook.worksheet(sheet)?;
        if ws.sheet_data.is_empty() {
            return Ok(vec![]);
        }
        let dim = ws.dimension();
        let mut out = Vec::new();
        for row in 1..=dim.max_row {
            let mut line = Vec::new();
            for col in 1..=dim.max_column {
                line.push(model.get_formatted_cell_value(sheet, row, col).unwrap_or_default());
            }
            out.push(line);
        }
        Ok(out)
    }
}

/// Text colour selected by a number format section such as `[Red]`.
fn format_color(value: f64, fmt: &str) -> Option<&'static str> {
    let locale = ironcalc_base::locale::get_locale("en").ok()?;
    let formatted = ironcalc_base::formatter::format::format_number(value, fmt, locale);
    match formatted.color? {
        0 => Some("#000000"),
        1 => Some("#FFFFFF"),
        2 => Some("#FF0000"),
        3 => Some("#00FF00"),
        4 => Some("#0000FF"),
        5 => Some("#FFFF00"),
        6 => Some("#FF00FF"),
        _ => None,
    }
}

/// Formats a sample value with a number format (Format Cells preview).
pub fn format_preview(value: f64, fmt: &str) -> String {
    match ironcalc_base::locale::get_locale("en") {
        Ok(locale) => ironcalc_base::formatter::format::format_number(value, fmt, locale).text,
        Err(_) => value.to_string(),
    }
}

fn format_number_input(n: f64) -> String {
    if n.fract() == 0.0 && n.abs() < 1e15 {
        format!("{}", n as i64)
    } else {
        format!("{n}")
    }
}

/// Strings that `set_user_input` would otherwise turn into numbers/formulas/booleans.
fn looks_like_input(s: &str) -> bool {
    let t = s.trim();
    t.starts_with('=')
        || t.parse::<f64>().is_ok()
        || t.eq_ignore_ascii_case("true")
        || t.eq_ignore_ascii_case("false")
        || t.ends_with('%') && t[..t.len() - 1].trim().parse::<f64>().is_ok()
}
