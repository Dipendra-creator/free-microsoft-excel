//! Notes, charts, AutoFilter, Text to Columns, PivotTable summaries and the
//! workbook health check.

use std::collections::{HashMap, HashSet};

use ironcalc_base::{
    cell::CellValue,
    types::{Cell, CellType, SheetState},
};
use serde::{Deserialize, Serialize};

use super::{area, HistoryEntry, Session, Tx};
use crate::{
    engine::{
        a1::{column_name, parse_range, Rect, LAST_ROW},
        extras::{AutoFilter, ChartSpec, Note},
    },
    error::{AppError, AppResult},
};

/// `[number or null, displayed text]` per cell, row-major.
pub type RangeValues = Vec<Vec<(Option<f64>, String)>>;

const CHART_KINDS: [&str; 7] = ["column", "bar", "line", "area", "pie", "doughnut", "scatter"];

/// One distinct value of a filter column.
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FilterValue {
    pub text: String,
    pub count: usize,
    pub checked: bool,
}

#[derive(Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SplitOptions {
    /// Delimiter characters (e.g. ",\t;").
    pub delimiters: String,
    /// Treat consecutive delimiters as one.
    pub consecutive: bool,
    /// Text qualifier ("\"", "'" or "").
    pub qualifier: String,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PivotSpec {
    /// Source data including the header row.
    pub source: Rect,
    pub rows_col: i32,
    pub cols_col: Option<i32>,
    pub value_col: Option<i32>,
    /// sum | count | average | min | max
    pub func: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub sheet: u32,
    pub row: i32,
    pub col: i32,
    /// error | warning | info
    pub severity: &'static str,
    pub kind: &'static str,
    pub message: String,
}

#[derive(Serialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub issues: Vec<Issue>,
    pub cells: usize,
    pub formulas: usize,
    /// True when the list was cut short.
    pub truncated: bool,
}

const MAX_ISSUES: usize = 2000;

/// Splits one line like Excel's Text to Columns (delimited).
pub fn split_line(text: &str, opts: &SplitOptions) -> Vec<String> {
    let delims: Vec<char> = opts.delimiters.chars().collect();
    let qualifier = opts.qualifier.chars().next();
    let mut out = Vec::new();
    let mut field = String::new();
    let mut chars = text.chars().peekable();
    let mut at_start = true;
    let mut last_was_delim = false;
    while let Some(ch) = chars.next() {
        if at_start && Some(ch) == qualifier {
            // Quoted field: read until the closing qualifier ("" = literal quote)
            while let Some(q) = chars.next() {
                if Some(q) == qualifier {
                    if chars.peek().copied() == qualifier {
                        field.push(q);
                        chars.next();
                    } else {
                        break;
                    }
                } else {
                    field.push(q);
                }
            }
            at_start = false;
            last_was_delim = false;
            continue;
        }
        if delims.contains(&ch) {
            if opts.consecutive && last_was_delim {
                continue;
            }
            out.push(std::mem::take(&mut field));
            at_start = true;
            last_was_delim = true;
            continue;
        }
        field.push(ch);
        at_start = false;
        last_was_delim = false;
    }
    out.push(field);
    out
}

/// Input that stores `text` as text: plain words are written as-is, anything
/// the engine might read as a number, date, boolean or formula gets a quote.
fn text_input(text: &str) -> String {
    let t = text.trim();
    let risky = t.starts_with(['=', '+', '-', '@', '\''])
        || t.chars().any(|c| c.is_ascii_digit())
        || t.eq_ignore_ascii_case("true")
        || t.eq_ignore_ascii_case("false");
    if risky {
        format!("'{text}")
    } else {
        text.to_string()
    }
}

fn quote_sheet(name: &str) -> String {
    if name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') && !name.is_empty() && !name.chars().next().unwrap().is_ascii_digit() {
        name.to_string()
    } else {
        format!("'{}'", name.replace('\'', "''"))
    }
}

fn abs_col_range(sheet: &str, col: i32, r1: i32, r2: i32) -> String {
    let c = column_name(col);
    format!("{}!${c}${r1}:${c}${r2}", quote_sheet(sheet))
}

impl Session {
    /// Merges the undo entries pushed since `len` into one user-visible step.
    pub(crate) fn group_history(&mut self, len: usize) {
        if self.undo_stack.len() <= len + 1 {
            return;
        }
        let entries: Vec<HistoryEntry> = self.undo_stack.drain(len..).collect();
        let mut merged = HistoryEntry::default();
        for e in entries {
            merged.engine_steps += e.engine_steps;
            if merged.extras_before.is_none() {
                merged.extras_before = e.extras_before;
            }
            if e.extras_after.is_some() {
                merged.extras_after = e.extras_after;
            }
        }
        self.undo_stack.push(merged);
    }

    // ------------------------------------------------------------------
    // Notes
    // ------------------------------------------------------------------

    pub fn set_note(&mut self, sheet: u32, row: i32, col: i32, text: &str, author: &str) -> AppResult<()> {
        let sheet_id = self.sheet_id(sheet)?;
        let note = Note {
            row,
            col,
            author: author.to_string(),
            text: text.to_string(),
        };
        self.tx(true, |s, tx| {
            s.snapshot(tx);
            s.x.set_note(sheet_id, note);
            Ok(())
        })
    }

    pub fn delete_notes(&mut self, sheet: u32, rect: Rect) -> AppResult<()> {
        let sheet_id = self.sheet_id(sheet)?;
        self.tx(true, |s, tx| {
            s.snapshot(tx);
            s.x.remove_notes_in(sheet_id, &rect);
            Ok(())
        })
    }

    pub fn notes(&self, sheet: u32) -> AppResult<Vec<Note>> {
        let sheet_id = self.sheet_id(sheet)?;
        Ok(self.x.notes(sheet_id).to_vec())
    }

    #[cfg(test)]
    pub fn note_at(&self, sheet: u32, row: i32, col: i32) -> Option<Note> {
        let sheet_id = self.sheet_id(sheet).ok()?;
        self.x.note(sheet_id, row, col).cloned()
    }

    // ------------------------------------------------------------------
    // Charts
    // ------------------------------------------------------------------

    /// Adds or replaces a chart. Returns its id.
    pub fn save_chart(&mut self, sheet: u32, mut chart: ChartSpec) -> AppResult<String> {
        let sheet_id = self.sheet_id(sheet)?;
        if !CHART_KINDS.contains(&chart.kind.as_str()) {
            return Err(AppError::Invalid(format!("Unknown chart type '{}'", chart.kind)));
        }
        if chart.id.is_empty() {
            chart.id = uuid::Uuid::new_v4().simple().to_string()[..12].to_string();
        }
        chart.width = chart.width.clamp(80.0, 4000.0);
        chart.height = chart.height.clamp(60.0, 4000.0);
        chart.row = chart.row.clamp(1, LAST_ROW);
        chart.col = chart.col.max(1);
        let id = chart.id.clone();
        if self.x.charts(sheet_id).iter().any(|c| c == &chart) {
            return Ok(id);
        }
        self.tx(true, |s, tx| {
            s.snapshot(tx);
            s.x.upsert_chart(sheet_id, chart);
            Ok(())
        })?;
        Ok(id)
    }

    pub fn delete_chart(&mut self, sheet: u32, id: &str) -> AppResult<()> {
        let sheet_id = self.sheet_id(sheet)?;
        self.tx(true, |s, tx| {
            s.snapshot(tx);
            s.x.remove_chart(sheet_id, id);
            Ok(())
        })
    }

    #[cfg(test)]
    pub fn charts(&self, sheet: u32) -> Vec<ChartSpec> {
        self.sheet_id(sheet)
            .map(|id| self.x.charts(id).to_vec())
            .unwrap_or_default()
    }

    /// `[number or null, displayed text]` for every cell of a range (charts).
    pub fn range_values(&self, sheet: u32, rect: Rect) -> AppResult<RangeValues> {
        let (max_row, max_col) = self.used_extent(sheet);
        let rect = rect.clamp_to(max_row, max_col);
        if (rect.width() as i64) * (rect.height() as i64) > 200_000 {
            return Err(AppError::Invalid("The chart data range is too large.".into()));
        }
        let model = self.m();
        let mut out = Vec::with_capacity(rect.height() as usize);
        for row in rect.r1..=rect.r2 {
            let mut line = Vec::with_capacity(rect.width() as usize);
            for col in rect.c1..=rect.c2 {
                let number = match model.get_cell_value_by_index(sheet, row, col)? {
                    CellValue::Number(n) => Some(n),
                    _ => None,
                };
                let text = model.get_formatted_cell_value(sheet, row, col).unwrap_or_default();
                line.push((number, text));
            }
            out.push(line);
        }
        Ok(out)
    }

    // ------------------------------------------------------------------
    // AutoFilter
    // ------------------------------------------------------------------

    pub fn filter(&self, sheet: u32) -> Option<AutoFilter> {
        let sheet_id = self.sheet_id(sheet).ok()?;
        self.x.filters.get(&sheet_id).cloned()
    }

    /// Turns the filter on (for `rect`, or the data region around it) or off.
    /// Returns whether a filter is now active.
    pub fn toggle_filter(&mut self, sheet: u32, rect: Rect) -> AppResult<bool> {
        let sheet_id = self.sheet_id(sheet)?;
        if let Some(f) = self.x.filters.get(&sheet_id).cloned() {
            let bottom = self.filter_bottom(sheet, &f)?;
            self.tx(true, |s, tx| {
                s.snapshot(tx);
                s.x.filters.remove(&sheet_id);
                if !f.columns.is_empty() && bottom > f.range.r1 {
                    let r = s.model.set_rows_hidden(sheet, f.range.r1 + 1, bottom, false);
                    Self::step(tx, r)?;
                }
                Ok(())
            })?;
            return Ok(false);
        }
        let (max_row, max_col) = self.used_extent(sheet);
        let range = if rect.is_single() {
            self.current_region(sheet, rect.r1, rect.c1)?
        } else {
            rect.clamp_to(max_row, max_col)
        };
        let empty = {
            let ws = self.m().workbook.worksheet(sheet)?;
            !(range.r1..=range.r2).any(|r| {
                (range.c1..=range.c2).any(|c| ws.cell(r, c).map(|x| !matches!(x, Cell::EmptyCell { .. })).unwrap_or(false))
            })
        };
        if empty {
            return Err(AppError::Invalid(
                "This can't be applied to the selected range. Select a single cell in a range and try again.".into(),
            ));
        }
        self.tx(true, |s, tx| {
            s.snapshot(tx);
            s.x.filters.insert(
                sheet_id,
                AutoFilter {
                    range,
                    columns: Default::default(),
                },
            );
            Ok(())
        })?;
        Ok(true)
    }

    /// Last data row of a filter: its range grows with data appended below.
    fn filter_bottom(&self, sheet: u32, f: &AutoFilter) -> AppResult<i32> {
        let ws = self.m().workbook.worksheet(sheet)?;
        let has_data = |r: i32| {
            ws.sheet_data
                .get(&r)
                .map(|row| {
                    row.iter()
                        .any(|(c, cell)| *c >= f.range.c1 && *c <= f.range.c2 && !matches!(cell, Cell::EmptyCell { .. }))
                })
                .unwrap_or(false)
        };
        let mut bottom = f.range.r2.max(f.range.r1);
        while bottom < LAST_ROW && has_data(bottom + 1) {
            bottom += 1;
        }
        Ok(bottom)
    }

    pub fn filter_values(&self, sheet: u32, col: i32) -> AppResult<Vec<FilterValue>> {
        let f = self
            .filter(sheet)
            .ok_or_else(|| AppError::Invalid("There is no filter on this sheet.".into()))?;
        let bottom = self.filter_bottom(sheet, &f)?;
        let allowed: Option<HashSet<&String>> = f.columns.get(&col).map(|v| v.iter().collect());
        let model = self.m();
        let mut counts: HashMap<String, (usize, Option<f64>)> = HashMap::new();
        for row in f.range.r1 + 1..=bottom {
            let text = model.get_formatted_cell_value(sheet, row, col).unwrap_or_default();
            let number = match model.get_cell_value_by_index(sheet, row, col)? {
                CellValue::Number(n) => Some(n),
                _ => None,
            };
            let e = counts.entry(text).or_insert((0, number));
            e.0 += 1;
        }
        let mut list: Vec<(String, usize, Option<f64>)> = counts.into_iter().map(|(t, (n, v))| (t, n, v)).collect();
        list.sort_by(|a, b| {
            let blank = (a.0.is_empty()).cmp(&b.0.is_empty());
            blank
                .then_with(|| match (a.2, b.2) {
                    (Some(x), Some(y)) => x.partial_cmp(&y).unwrap_or(std::cmp::Ordering::Equal),
                    (Some(_), None) => std::cmp::Ordering::Less,
                    (None, Some(_)) => std::cmp::Ordering::Greater,
                    (None, None) => a.0.to_lowercase().cmp(&b.0.to_lowercase()),
                })
        });
        Ok(list
            .into_iter()
            .take(10_000)
            .map(|(text, count, _)| FilterValue {
                checked: allowed.as_ref().map(|a| a.contains(&text)).unwrap_or(true),
                text,
                count,
            })
            .collect())
    }

    /// Sets the visible values of one column (None = show all) and re-filters.
    pub fn set_filter(&mut self, sheet: u32, col: i32, values: Option<Vec<String>>) -> AppResult<()> {
        let sheet_id = self.sheet_id(sheet)?;
        let mut f = self
            .filter(sheet)
            .ok_or_else(|| AppError::Invalid("There is no filter on this sheet.".into()))?;
        match values {
            None => {
                f.columns.remove(&col);
            }
            Some(v) => {
                f.columns.insert(col, v);
            }
        }
        self.tx(true, |s, tx| {
            s.snapshot(tx);
            s.x.filters.insert(sheet_id, f);
            s.apply_filter(sheet, sheet_id, tx)
        })
    }

    /// Clear (all criteria) keeps the filter buttons; Reapply re-evaluates.
    pub fn clear_filter(&mut self, sheet: u32) -> AppResult<()> {
        let sheet_id = self.sheet_id(sheet)?;
        self.tx(true, |s, tx| {
            s.snapshot(tx);
            if let Some(f) = s.x.filters.get_mut(&sheet_id) {
                f.columns.clear();
            }
            s.apply_filter(sheet, sheet_id, tx)
        })
    }

    pub fn reapply_filter(&mut self, sheet: u32) -> AppResult<()> {
        let sheet_id = self.sheet_id(sheet)?;
        self.tx(true, |s, tx| {
            s.snapshot(tx);
            s.apply_filter(sheet, sheet_id, tx)
        })
    }

    /// Sorts the filtered data by one column and re-applies the filter (one undo step).
    pub fn sort_filter(&mut self, sheet: u32, col: i32, ascending: bool) -> AppResult<()> {
        let f = self
            .filter(sheet)
            .ok_or_else(|| AppError::Invalid("There is no filter on this sheet.".into()))?;
        let bottom = self.filter_bottom(sheet, &f)?;
        let len = self.undo_stack.len();
        let rect = Rect::new(f.range.r1, f.range.c1, bottom, f.range.c2);
        self.sort(sheet, rect, &[super::SortKey { column: col, ascending }], true)?;
        self.reapply_filter(sheet)?;
        self.group_history(len);
        Ok(())
    }

    fn apply_filter(&mut self, sheet: u32, sheet_id: u32, tx: &mut Tx) -> AppResult<()> {
        let Some(f) = self.x.filters.get(&sheet_id).cloned() else {
            return Ok(());
        };
        let bottom = self.filter_bottom(sheet, &f)?;
        if let Some(live) = self.x.filters.get_mut(&sheet_id) {
            live.range.r2 = bottom;
        }
        let sets: Vec<(i32, HashSet<String>)> = f
            .columns
            .iter()
            .map(|(c, v)| (*c, v.iter().cloned().collect()))
            .collect();
        let mut changes: Vec<(i32, bool)> = Vec::new();
        {
            let model = self.m();
            for row in f.range.r1 + 1..=bottom {
                let visible = sets.iter().all(|(c, set)| {
                    set.contains(&model.get_formatted_cell_value(sheet, row, *c).unwrap_or_default())
                });
                let hidden = model.is_row_hidden(sheet, row)?;
                if hidden == visible {
                    changes.push((row, !visible));
                }
            }
        }
        // Contiguous runs with the same target state
        let mut i = 0;
        while i < changes.len() {
            let (start, hide) = changes[i];
            let mut end = start;
            while i + 1 < changes.len() && changes[i + 1].0 == end + 1 && changes[i + 1].1 == hide {
                i += 1;
                end += 1;
            }
            let r = self.model.set_rows_hidden(sheet, start, end, hide);
            Self::step(tx, r)?;
            i += 1;
        }
        tx.layout = true;
        Ok(())
    }

    // ------------------------------------------------------------------
    // Text to Columns
    // ------------------------------------------------------------------

    /// Splits the first column of `rect` into adjacent columns. Returns the
    /// area written.
    pub fn text_to_columns(&mut self, sheet: u32, rect: Rect, opts: &SplitOptions, day_first: bool) -> AppResult<Rect> {
        if rect.width() > 1 {
            return Err(AppError::Invalid("Text to Columns can convert only one column at a time.".into()));
        }
        if opts.delimiters.is_empty() {
            return Err(AppError::Invalid("Choose at least one delimiter.".into()));
        }
        let (max_row, _) = self.used_extent(sheet);
        let rect = rect.clamp_to(max_row, rect.c2);
        let col = rect.c1;
        let mut rows: Vec<(i32, Vec<String>)> = Vec::new();
        {
            let model = self.m();
            let ws = model.workbook.worksheet(sheet)?;
            for row in rect.r1..=rect.r2 {
                let Some(cell) = ws.cell(row, col) else { continue };
                if matches!(cell, Cell::EmptyCell { .. }) || cell.has_formula() {
                    continue;
                }
                let text = model.get_formatted_cell_value(sheet, row, col).unwrap_or_default();
                rows.push((row, split_line(&text, opts)));
            }
        }
        let width = rows.iter().map(|(_, p)| p.len()).max().unwrap_or(1) as i32;
        if col + width - 1 > crate::engine::a1::LAST_COLUMN {
            return Err(AppError::Invalid("The data would extend beyond the last column.".into()));
        }
        self.batch(true, |s, tx| {
            for (row, parts) in &rows {
                for (j, part) in parts.iter().enumerate() {
                    let c = col + j as i32;
                    if part.is_empty() {
                        let occupied = s
                            .m()
                            .workbook
                            .worksheet(sheet)?
                            .cell(*row, c)
                            .map(|x| !matches!(x, Cell::EmptyCell { .. }))
                            .unwrap_or(false);
                        if occupied {
                            let r = s.model.range_clear_contents(&area(sheet, &Rect::cell(*row, c)));
                            Self::step(tx, r)?;
                        }
                        continue;
                    }
                    let input = s.engine_input(part).into_owned();
                    match super::super::input::interpret(&input, day_first) {
                        Some(p) => {
                            let r = s.model.set_user_input(sheet, *row, c, &p.value);
                            Self::step(tx, r)?;
                            let fmt = s.m().get_style_for_cell(sheet, *row, c)?.num_fmt;
                            if fmt.eq_ignore_ascii_case("general") {
                                let r = s.model.update_range_style(&area(sheet, &Rect::cell(*row, c)), "num_fmt", &p.format);
                                Self::step(tx, r)?;
                            }
                        }
                        None => {
                            let r = s.model.set_user_input(sheet, *row, c, &input);
                            Self::step(tx, r)?;
                        }
                    }
                }
            }
            Ok(())
        })?;
        Ok(Rect::new(rect.r1, col, rect.r2, col + width - 1))
    }

    // ------------------------------------------------------------------
    // PivotTable (formula based summary)
    // ------------------------------------------------------------------

    /// Creates a summary sheet with SUMIFS/COUNTIFS/... formulas: values stay
    /// live when the source data changes. Returns the new sheet index.
    pub fn create_pivot(&mut self, sheet: u32, spec: &PivotSpec) -> AppResult<u32> {
        let (max_row, max_col) = self.used_extent(sheet);
        let src = spec.source.clamp_to(max_row, max_col);
        if src.height() < 2 {
            return Err(AppError::Invalid("The source range needs a header row and at least one row of data.".into()));
        }
        let func = spec.func.to_lowercase();
        let (agg, ifs) = match func.as_str() {
            "sum" => ("SUM", "SUMIFS"),
            "count" => ("COUNTA", "COUNTIFS"),
            "average" => ("AVERAGE", "AVERAGEIFS"),
            "min" => ("MIN", "MINIFS"),
            "max" => ("MAX", "MAXIFS"),
            _ => return Err(AppError::Invalid(format!("Unknown summary function '{}'", spec.func))),
        };
        let value_col = if func == "count" {
            spec.value_col.unwrap_or(spec.rows_col)
        } else {
            spec.value_col
                .ok_or_else(|| AppError::Invalid("Choose a value field to summarize.".into()))?
        };
        for c in [Some(spec.rows_col), spec.cols_col, Some(value_col)].into_iter().flatten() {
            if c < src.c1 || c > src.c2 {
                return Err(AppError::Invalid("The selected fields must be inside the source range.".into()));
            }
        }
        let model = self.m();
        let src_name = model.workbook.worksheet(sheet)?.name.clone();
        let header = |c: i32| model.get_formatted_cell_value(sheet, src.r1, c).unwrap_or_default();
        let distinct = |c: i32| -> AppResult<Vec<(String, Option<f64>)>> {
            let mut seen = HashSet::new();
            let mut out = Vec::new();
            for r in src.r1 + 1..=src.r2 {
                let text = model.get_formatted_cell_value(sheet, r, c).unwrap_or_default();
                if seen.insert(text.clone()) {
                    let n = match model.get_cell_value_by_index(sheet, r, c)? {
                        CellValue::Number(n) => Some(n),
                        _ => None,
                    };
                    out.push((text, n));
                }
            }
            out.sort_by(|a, b| {
                (a.0.is_empty()).cmp(&b.0.is_empty()).then_with(|| match (a.1, b.1) {
                    (Some(x), Some(y)) => x.partial_cmp(&y).unwrap_or(std::cmp::Ordering::Equal),
                    (Some(_), None) => std::cmp::Ordering::Less,
                    (None, Some(_)) => std::cmp::Ordering::Greater,
                    (None, None) => a.0.to_lowercase().cmp(&b.0.to_lowercase()),
                })
            });
            Ok(out)
        };
        let row_items = distinct(spec.rows_col)?;
        let col_items = match spec.cols_col {
            Some(c) => distinct(c)?,
            None => vec![],
        };
        if row_items.len() > 5000 || col_items.len() > 500 {
            return Err(AppError::Invalid("Too many distinct values to summarize.".into()));
        }
        let (d1, d2) = (src.r1 + 1, src.r2);
        let rows_rng = abs_col_range(&src_name, spec.rows_col, d1, d2);
        let val_rng = abs_col_range(&src_name, value_col, d1, d2);
        let cols_rng = spec.cols_col.map(|c| abs_col_range(&src_name, c, d1, d2));
        let title = format!(
            "{} of {}",
            match func.as_str() {
                "sum" => "Sum",
                "count" => "Count",
                "average" => "Average",
                "min" => "Min",
                _ => "Max",
            },
            header(value_col)
        );
        let rows_header = header(spec.rows_col);
        let cols_header = spec.cols_col.map(header);
        // The label cell is the criterion; "=" matches blank cells.
        let crit = |label_ref: &str, blank: bool| {
            if blank {
                "\"=\"".to_string()
            } else {
                format!("\"=\"&{label_ref}")
            }
        };
        let label = |text: &str| if text.is_empty() { "(blank)".to_string() } else { text.to_string() };
        // Cells to write: (row, col, input)
        let mut cells: Vec<(i32, i32, String)> = Vec::new();
        let top = 3;
        cells.push((1, 1, title.clone()));
        cells.push((top, 1, text_input(&label(&rows_header))));
        let first_data_row = top + 1;
        let last_col = 2 + col_items.len() as i32;
        if let Some(h) = &cols_header {
            cells.push((top - 1, 2, text_input(h)));
        }
        // Numeric labels (numbers, dates) are written as numbers so that the
        // "="&label criteria compare values, and keep the source format.
        let mut formats: Vec<(i32, i32, String)> = Vec::new();
        let label_input = |text: &str, number: Option<f64>| match number {
            Some(n) if !text.is_empty() => super::format_number_input(n),
            _ => text_input(&label(text)),
        };
        let fmt_of = |c: i32| {
            model
                .get_style_for_cell(sheet, src.r1 + 1, c)
                .map(|st| st.num_fmt)
                .unwrap_or_else(|_| "general".into())
        };
        for (j, (text, number)) in col_items.iter().enumerate() {
            cells.push((top, 2 + j as i32, label_input(text, *number)));
            if number.is_some() {
                formats.push((top, 2 + j as i32, fmt_of(spec.cols_col.unwrap_or(1))));
            }
        }
        cells.push((top, last_col, "Grand Total".into()));
        for (i, (text, _)) in row_items.iter().enumerate() {
            let r = first_data_row + i as i32;
            cells.push((r, 1, label_input(text, row_items[i].1)));
            if row_items[i].1.is_some() && !text.is_empty() {
                formats.push((r, 1, fmt_of(spec.rows_col)));
            }
            let row_crit = crit(&format!("$A{r}"), text.is_empty());
            for (j, (ctext, _)) in col_items.iter().enumerate() {
                let c = 2 + j as i32;
                let col_letter = column_name(c);
                let col_crit = crit(&format!("{col_letter}${top}"), ctext.is_empty());
                let formula = if func == "count" {
                    format!("={ifs}({rows_rng},{row_crit},{},{col_crit})", cols_rng.as_ref().unwrap())
                } else {
                    format!("={ifs}({val_rng},{rows_rng},{row_crit},{},{col_crit})", cols_rng.as_ref().unwrap())
                };
                cells.push((r, c, formula));
            }
            let total = if func == "count" {
                format!("={ifs}({rows_rng},{row_crit})")
            } else {
                format!("={ifs}({val_rng},{rows_rng},{row_crit})")
            };
            cells.push((r, last_col, total));
        }
        let total_row = first_data_row + row_items.len() as i32;
        cells.push((total_row, 1, "Grand Total".into()));
        for (j, (ctext, _)) in col_items.iter().enumerate() {
            let c = 2 + j as i32;
            let col_letter = column_name(c);
            let col_crit = crit(&format!("{col_letter}${top}"), ctext.is_empty());
            let formula = if func == "count" {
                format!("={ifs}({},{col_crit})", cols_rng.as_ref().unwrap())
            } else {
                format!("={ifs}({val_rng},{},{col_crit})", cols_rng.as_ref().unwrap())
            };
            cells.push((total_row, c, formula));
        }
        cells.push((total_row, last_col, format!("={agg}({val_rng})")));

        let len = self.undo_stack.len();
        let index = self.add_sheet(Some(sheet))?;
        let result = self.batch(true, |s, tx| {
            for (r, c, input) in &cells {
                let res = s.model.set_user_input(index, *r, *c, input);
                Self::step(tx, res)?;
            }
            for (r, c, fmt) in &formats {
                if !fmt.eq_ignore_ascii_case("general") {
                    let res = s.model.update_range_style(&area(index, &Rect::cell(*r, *c)), "num_fmt", fmt);
                    Self::step(tx, res)?;
                }
            }
            let bold = |r1: i32, c1: i32, r2: i32, c2: i32| area(index, &Rect::new(r1, c1, r2, c2));
            let r = s.model.update_range_style(&bold(1, 1, 1, 1), "font.b", "true");
            Self::step(tx, r)?;
            let r = s.model.update_range_style(&bold(top, 1, top, last_col), "font.b", "true");
            Self::step(tx, r)?;
            let r = s.model.update_range_style(&bold(top, 1, top, last_col), "fill.fg_color", "#DDEBF7");
            Self::step(tx, r)?;
            let r = s.model.update_range_style(&bold(total_row, 1, total_row, last_col), "font.b", "true");
            Self::step(tx, r)?;
            let r = s.model.set_columns_width(index, 1, 1, crate::engine::dto::px_to_engine_col(160.0));
            Self::step(tx, r)?;
            let r = s.model.set_columns_width(index, 2, last_col, crate::engine::dto::px_to_engine_col(96.0));
            Self::step(tx, r)?;
            Ok(())
        });
        self.group_history(len);
        result?;
        Ok(index)
    }

    // ------------------------------------------------------------------
    // Health check
    // ------------------------------------------------------------------

    /// Scans every sheet for the mistakes behind famous spreadsheet failures:
    /// error values, formulas that break a column's pattern, totals that skip
    /// adjacent numbers, numbers stored as text, hidden data, volatile formulas.
    pub fn health_check(&self) -> AppResult<HealthReport> {
        let model = self.m();
        let mut report = HealthReport::default();
        let push = |report: &mut HealthReport, issue: Issue| {
            if report.issues.len() < MAX_ISSUES {
                report.issues.push(issue);
            } else {
                report.truncated = true;
            }
        };
        for (index, ws) in model.workbook.worksheets.iter().enumerate() {
            let sheet = index as u32;
            if ws.state != SheetState::Visible {
                push(
                    &mut report,
                    Issue {
                        sheet,
                        row: 0,
                        col: 0,
                        severity: "info",
                        kind: "hiddenSheet",
                        message: format!("Sheet '{}' is hidden and may contain data used in calculations.", ws.name),
                    },
                );
            }
            let hidden_rows = ws.rows.iter().filter(|r| r.hidden).count();
            let hidden_cols: i32 = ws.cols.iter().filter(|c| c.hidden).map(|c| c.max - c.min + 1).sum();
            if hidden_rows > 0 || hidden_cols > 0 {
                push(
                    &mut report,
                    Issue {
                        sheet,
                        row: 0,
                        col: 0,
                        severity: "info",
                        kind: "hiddenCells",
                        message: format!("'{}' has {hidden_rows} hidden row(s) and {hidden_cols} hidden column(s).", ws.name),
                    },
                );
            }
            let mut rows: Vec<i32> = ws.sheet_data.keys().copied().collect();
            rows.sort_unstable();
            let mut formula_checks = 0usize;
            for row in rows {
                let data = &ws.sheet_data[&row];
                let mut cols: Vec<i32> = data.keys().copied().collect();
                cols.sort_unstable();
                for col in cols {
                    let cell = &data[&col];
                    if matches!(cell, Cell::EmptyCell { .. }) {
                        continue;
                    }
                    report.cells += 1;
                    let is_formula = cell.has_formula();
                    if is_formula {
                        report.formulas += 1;
                    }
                    let ty = cell.get_type();
                    if ty == CellType::ErrorValue {
                        let shown = model.get_formatted_cell_value(sheet, row, col).unwrap_or_default();
                        push(
                            &mut report,
                            Issue {
                                sheet,
                                row,
                                col,
                                severity: "error",
                                kind: "error",
                                message: if is_formula {
                                    format!("Formula returns {shown}.")
                                } else {
                                    format!("Cell contains the error value {shown}.")
                                },
                            },
                        );
                        continue;
                    }
                    if !is_formula && ty == CellType::Text {
                        if let Ok(CellValue::String(s)) = model.get_cell_value_by_index(sheet, row, col) {
                            let t = s.trim();
                            let quoted = model.get_style_for_cell(sheet, row, col).map(|st| st.quote_prefix).unwrap_or(false);
                            if !quoted && !t.is_empty() && t.replace(',', "").parse::<f64>().is_ok() {
                                push(
                                    &mut report,
                                    Issue {
                                        sheet,
                                        row,
                                        col,
                                        severity: "warning",
                                        kind: "numberAsText",
                                        message: format!("The number '{t}' is stored as text: SUM and other functions ignore it."),
                                    },
                                );
                            }
                        }
                        continue;
                    }
                    if !is_formula {
                        continue;
                    }
                    let content = model.get_localized_cell_content(sheet, row, col).unwrap_or_default();
                    let upper = content.to_uppercase();
                    for f in ["NOW(", "TODAY(", "RAND(", "RANDBETWEEN(", "OFFSET(", "INDIRECT("] {
                        if upper.contains(f) {
                            push(
                                &mut report,
                                Issue {
                                    sheet,
                                    row,
                                    col,
                                    severity: "info",
                                    kind: "volatile",
                                    message: format!("{} is volatile: the result changes on every recalculation.", &f[..f.len() - 1]),
                                },
                            );
                            break;
                        }
                    }
                    if let Some(msg) = omitted_neighbours(self, sheet, row, col, &content) {
                        push(&mut report, Issue { sheet, row, col, severity: "warning", kind: "omitsAdjacent", message: msg });
                    }
                    formula_checks += 1;
                    if formula_checks <= 50_000 {
                        if let Some(msg) = self.inconsistent_formula(sheet, row, col, &content) {
                            push(&mut report, Issue { sheet, row, col, severity: "warning", kind: "inconsistent", message: msg });
                        }
                    }
                }
            }
        }
        Ok(report)
    }

    /// Excel's "inconsistent formula" rule: both neighbours (above/below or
    /// left/right) follow one pattern and this cell does not.
    fn inconsistent_formula(&self, sheet: u32, row: i32, col: i32, content: &str) -> Option<String> {
        let model = self.m();
        let ws = model.workbook.worksheet(sheet).ok()?;
        let is_formula = |r: i32, c: i32| r >= 1 && c >= 1 && ws.cell(r, c).map(|x| x.has_formula()).unwrap_or(false);
        let pairs = [((row - 1, col), (row + 1, col), "column"), ((row, col - 1), (row, col + 1), "row")];
        for ((ar, ac), (br, bc), axis) in pairs {
            if !is_formula(ar, ac) || !is_formula(br, bc) {
                continue;
            }
            let from_a = model.extend_to(sheet, ar, ac, row, col).ok()?;
            let from_b = model.extend_to(sheet, br, bc, row, col).ok()?;
            if from_a == from_b && from_a != content {
                return Some(format!(
                    "This formula differs from the others in its {axis}: expected {from_a}"
                ));
            }
        }
        None
    }
}

/// "=SUM(B2:B10)" in B13 with numbers in B11:B12 (or B1) — the range stops
/// short of adjacent numbers (the Reinhart–Rogoff error).
fn omitted_neighbours(s: &Session, sheet: u32, row: i32, col: i32, content: &str) -> Option<String> {
    let body = content.strip_prefix('=')?.trim();
    let open = body.find('(')?;
    let name = body[..open].trim().to_uppercase();
    if !["SUM", "AVERAGE", "COUNT", "MIN", "MAX", "PRODUCT"].contains(&name.as_str()) {
        return None;
    }
    let inner = body[open + 1..].strip_suffix(')')?;
    if inner.contains(['(', ',', '!']) {
        return None;
    }
    let range = parse_range(inner)?;
    let model = s.m();
    let is_number = |r: i32, c: i32| {
        r >= 1 && c >= 1 && matches!(model.get_cell_value_by_index(sheet, r, c), Ok(CellValue::Number(_)))
            && !model
                .workbook
                .worksheet(sheet)
                .ok()
                .and_then(|w| w.cell(r, c))
                .map(|x| x.has_formula())
                .unwrap_or(false)
    };
    if range.c1 == col && range.c2 == col && range.r2 < row {
        let gap: Vec<i32> = (range.r2 + 1..row).filter(|r| is_number(*r, col)).collect();
        if !gap.is_empty() {
            return Some(format!(
                "{name}({inner}) leaves out the numbers in {} between the range and this cell.",
                Rect::new(gap[0], col, *gap.last().unwrap(), col).to_a1()
            ));
        }
        if range.r1 > 1 && is_number(range.r1 - 1, col) {
            return Some(format!(
                "{name}({inner}) leaves out the number directly above the range ({}).",
                Rect::cell(range.r1 - 1, col).to_a1()
            ));
        }
    }
    if range.r1 == row && range.r2 == row && range.c2 < col {
        let gap: Vec<i32> = (range.c2 + 1..col).filter(|c| is_number(row, *c)).collect();
        if !gap.is_empty() {
            return Some(format!(
                "{name}({inner}) leaves out the numbers in {} between the range and this cell.",
                Rect::new(row, gap[0], row, *gap.last().unwrap()).to_a1()
            ));
        }
        if range.c1 > 1 && is_number(row, range.c1 - 1) {
            return Some(format!(
                "{name}({inner}) leaves out the number directly left of the range ({}).",
                Rect::cell(row, range.c1 - 1).to_a1()
            ));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(d: &str) -> SplitOptions {
        SplitOptions { delimiters: d.into(), consecutive: false, qualifier: "\"".into() }
    }

    #[test]
    fn split_lines() {
        assert_eq!(split_line("a,b,,c", &opts(",")), vec!["a", "b", "", "c"]);
        assert_eq!(split_line("\"x, y\",z", &opts(",")), vec!["x, y", "z"]);
        assert_eq!(split_line("\"say \"\"hi\"\"\",1", &opts(",")), vec!["say \"hi\"", "1"]);
        let mut o = opts(" ");
        o.consecutive = true;
        assert_eq!(split_line("John   Smith", &o), vec!["John", "Smith"]);
        assert_eq!(split_line("a;b\tc", &opts(";\t")), vec!["a", "b", "c"]);
    }
}
