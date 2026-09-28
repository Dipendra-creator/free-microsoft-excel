//! AutoFill: the fill handle, Ctrl+D / Ctrl+R, the AutoFill Options menu
//! (Copy Cells, Fill Series, Fill Formatting Only, Fill Without Formatting,
//! Fill Days / Weekdays / Months / Years) and Home → Fill → Series.
//!
//! Excel's rules, per column (or row) of the source:
//! * one number is copied, and Ctrl+drag (or "Fill Series") counts 1, 2, 3…;
//! * two or more numbers continue their best-fit straight line;
//! * dates, `Item 1`, `1st`, `Q1`, month and day names always continue;
//! * formulas are copied with their relative references adjusted;
//! * anything else is copied, and formats follow the source pattern.

use ironcalc_base::{
    cell::CellValue,
    types::{Cell, CellType, Style},
};
use serde::{Deserialize, Serialize};

use super::{area, format_number_input, is_date_format, Session};
use crate::{
    engine::a1::{Rect, LAST_COLUMN, LAST_ROW},
    error::{AppError, AppResult},
};

/// How a fill writes the new cells.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum FillMode {
    /// Excel's default for a drag.
    #[default]
    Auto,
    /// Ctrl+drag: series for a single number, copy otherwise.
    Toggle,
    Copy,
    Series,
    /// Fill Formatting Only.
    Formats,
    /// Fill Without Formatting.
    Values,
    Days,
    Weekdays,
    Months,
    Years,
}

/// What a fill did, for the AutoFill Options button.
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FillReport {
    /// The option the result corresponds to (checked in the menu).
    pub mode: FillMode,
    /// The source holds dates: offer Fill Days / Weekdays / Months / Years.
    pub has_dates: bool,
    /// Copy Cells and Fill Series give different results.
    pub can_series: bool,
}

/// Home → Fill → Series.
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SeriesSpec {
    /// Series in rows (true) or in columns (false).
    pub in_rows: bool,
    /// linear | growth | date | autofill
    pub kind: String,
    /// day | weekday | month | year (date series)
    #[serde(default)]
    pub unit: String,
    pub step: f64,
    #[serde(default)]
    pub stop: Option<f64>,
    /// Continue the best-fit line (linear) or curve (growth) of the values
    /// already in the selection instead of using `step`.
    #[serde(default)]
    pub trend: bool,
}

/// What Flash Fill wrote.
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FlashFillResult {
    /// Rows written in the target column (examples in between are kept).
    pub rect: Rect,
    pub count: usize,
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Dir {
    Down,
    Up,
    Right,
    Left,
}

#[derive(Clone, Debug, PartialEq)]
enum Value {
    Empty,
    Number(f64),
    Text(String),
    Bool(bool),
    Error(String),
}

#[derive(Clone, Debug)]
struct Seed {
    row: i32,
    col: i32,
    value: Value,
    formula: bool,
    style: Style,
    /// A number shown as a date (or date and time).
    date: bool,
    /// A number shown as a time of day only.
    time: bool,
}

#[derive(Clone, Debug, PartialEq)]
struct TextNum {
    prefix: String,
    n: u64,
    /// Zero-padded width ("007" → 3), 0 when not padded.
    width: usize,
    /// Text after the number (without the ordinal suffix).
    suffix: String,
    /// The number starts the text ("1st place") rather than ending it ("Item 1").
    lead: bool,
    /// `Some(uppercase)` for ordinals: 1st, 2nd, 3RD…
    ordinal: Option<bool>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Case {
    Title,
    Upper,
    Lower,
}

#[derive(Clone, Debug, PartialEq)]
enum Kind {
    /// Copied (formulas adjusted): text, booleans, errors, blanks, formulas.
    Copy,
    Number,
    Date { time: bool },
    TextNum { prefix: String, suffix: String, lead: bool, ordinal: bool },
    /// 0 = January…, 1 = Jan…, 2 = Monday…, 3 = Mon…
    Name { list: usize },
}

/// The seeds of one column (or row) and the cells they fill, in fill order.
type Line = (Vec<Seed>, Vec<(i32, i32)>);

#[derive(Clone, Debug)]
struct Run {
    start: usize,
    len: usize,
    kind: Kind,
}

const MONTHS: [&str; 12] = [
    "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November",
    "December",
];
const MONTHS_SHORT: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS: [&str; 7] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAYS_SHORT: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

fn name_list(list: usize) -> &'static [&'static str] {
    match list {
        0 => &MONTHS,
        1 => &MONTHS_SHORT,
        2 => &DAYS,
        _ => &DAYS_SHORT,
    }
}

impl Session {
    /// Fills from `source` to `target` (which includes the source), like
    /// dragging the fill handle. Dragging back inside the source clears the
    /// cells left out, as in Excel.
    pub fn fill(&mut self, sheet: u32, source: Rect, target: Rect, mode: FillMode) -> AppResult<FillReport> {
        self.check_sheet(sheet)?;
        let Some((dir, region)) = fill_region(&source, &target) else {
            self.fill_shrink(sheet, source, target)?;
            return Ok(FillReport { mode, has_dates: false, can_series: false });
        };
        if region.r2 > LAST_ROW || region.c2 > LAST_COLUMN || region.r1 < 1 || region.c1 < 1 {
            return Err(AppError::Invalid("The fill area extends beyond the end of the sheet.".into()));
        }
        let lines = self.fill_lines(sheet, &source, &region, dir)?;
        // Filling up or left counts down from a single value
        let backwards = matches!(dir, Dir::Up | Dir::Left);
        let mut report = FillReport { mode, has_dates: false, can_series: false };
        let mut used_series = false;
        let mut cells = Vec::with_capacity((region.width() * region.height()) as usize);
        for (seeds, targets) in &lines {
            let runs = runs(seeds);
            report.has_dates |= seeds.iter().any(|s| s.date && !s.time);
            report.can_series |= runs.iter().any(|r| r.kind != Kind::Copy);
            let n = seeds.len();
            let mut run_of = vec![0usize; n];
            for (k, run) in runs.iter().enumerate() {
                for slot in run_of.iter_mut().skip(run.start).take(run.len) {
                    *slot = k;
                }
            }
            for (t, &(row, col)) in targets.iter().enumerate() {
                let p = n + t;
                let (cycle, j) = (p / n, p % n);
                let seed = &seeds[j];
                let run = &runs[run_of[j]];
                let index = cycle * run.len + (j - run.start);
                let style = match mode {
                    FillMode::Values => {
                        let mut st = self.m().get_style_for_cell(sheet, row, col)?;
                        if seed.date || seed.time {
                            st.num_fmt = seed.style.num_fmt.clone();
                        }
                        st
                    }
                    _ => seed.style.clone(),
                };
                if mode == FillMode::Formats {
                    cells.push((row, col, None, style));
                    continue;
                }
                let series = run.kind != Kind::Copy && behaves_as_series(&run.kind, mode, n);
                let text = if series {
                    used_series = true;
                    series_value(&run.kind, &seeds[run.start..run.start + run.len], index, mode, backwards)
                } else if seed.formula {
                    Some(self.m().extend_to(sheet, seed.row, seed.col, row, col)?)
                } else {
                    copy_input(&seed.value)
                };
                cells.push((row, col, text, style));
            }
        }
        if matches!(mode, FillMode::Auto | FillMode::Toggle) {
            report.mode = if used_series { FillMode::Series } else { FillMode::Copy };
        }
        if mode == FillMode::Formats {
            let mut grid: Vec<Vec<Option<Style>>> = vec![vec![None; region.width() as usize]; region.height() as usize];
            for (row, col, _, style) in cells {
                grid[(row - region.r1) as usize][(col - region.c1) as usize] = Some(style);
            }
            let grid: Option<Vec<Vec<Style>>> = grid.into_iter().map(|line| line.into_iter().collect()).collect();
            if let Some(grid) = grid {
                self.paste_styles(sheet, region, grid, true)?;
            }
        } else {
            self.write_block(sheet, region, cells, true)?;
        }
        Ok(report)
    }

    /// Clears what a fill handle dragged back inside the selection left out.
    fn fill_shrink(&mut self, sheet: u32, source: Rect, target: Rect) -> AppResult<()> {
        let cleared = if target.r1 == source.r1 && target.r2 < source.r2 {
            Rect::new(target.r2 + 1, source.c1, source.r2, source.c2)
        } else if target.c1 == source.c1 && target.c2 < source.c2 {
            Rect::new(source.r1, target.c2 + 1, source.r2, source.c2)
        } else {
            return Ok(());
        };
        self.tx(false, |s, tx| {
            let r = s.model.range_clear_contents(&area(sheet, &cleared));
            Self::step(tx, r)
        })
    }

    /// Seeds (in fill order) and target cells (in fill order) for each column
    /// of a vertical fill, or each row of a horizontal one.
    fn fill_lines(
        &self,
        sheet: u32,
        source: &Rect,
        region: &Rect,
        dir: Dir,
    ) -> AppResult<Vec<Line>> {
        let mut lines = Vec::new();
        match dir {
            Dir::Down | Dir::Up => {
                for col in source.c1..=source.c2 {
                    let mut rows: Vec<i32> = (source.r1..=source.r2).collect();
                    let mut targets: Vec<i32> = (region.r1..=region.r2).collect();
                    if dir == Dir::Up {
                        rows.reverse();
                        targets.reverse();
                    }
                    let seeds = rows.iter().map(|&r| self.read_seed(sheet, r, col)).collect::<AppResult<Vec<_>>>()?;
                    lines.push((seeds, targets.into_iter().map(|r| (r, col)).collect()));
                }
            }
            Dir::Right | Dir::Left => {
                for row in source.r1..=source.r2 {
                    let mut cols: Vec<i32> = (source.c1..=source.c2).collect();
                    let mut targets: Vec<i32> = (region.c1..=region.c2).collect();
                    if dir == Dir::Left {
                        cols.reverse();
                        targets.reverse();
                    }
                    let seeds = cols.iter().map(|&c| self.read_seed(sheet, row, c)).collect::<AppResult<Vec<_>>>()?;
                    lines.push((seeds, targets.into_iter().map(|c| (row, c)).collect()));
                }
            }
        }
        Ok(lines)
    }

    fn read_seed(&self, sheet: u32, row: i32, col: i32) -> AppResult<Seed> {
        let model = self.m();
        let style = model.get_style_for_cell(sheet, row, col)?;
        let cell = model.workbook.worksheet(sheet)?.cell(row, col);
        let mut seed = Seed { row, col, value: Value::Empty, formula: false, style, date: false, time: false };
        let Some(cell) = cell else {
            return Ok(seed);
        };
        if matches!(cell, Cell::EmptyCell { .. } | Cell::SpillCell { .. }) {
            return Ok(seed);
        }
        if cell.has_formula() {
            seed.formula = true;
            return Ok(seed);
        }
        let is_error = cell.get_type() == CellType::ErrorValue;
        seed.value = match model.get_cell_value_by_index(sheet, row, col)? {
            CellValue::None => Value::Empty,
            CellValue::String(s) if is_error => Value::Error(s),
            CellValue::String(s) => Value::Text(s),
            CellValue::Number(n) => Value::Number(n),
            CellValue::Boolean(b) => Value::Bool(b),
        };
        if matches!(seed.value, Value::Number(_)) && is_date_format(&seed.style.num_fmt) {
            if is_time_only(&seed.style.num_fmt) {
                seed.time = true;
            } else {
                seed.date = true;
            }
        }
        Ok(seed)
    }

    /// Double-clicking the fill handle: the last row to fill down to, from the
    /// data in the column next to the selection (left first, then right).
    pub fn fill_extent(&self, sheet: u32, source: Rect) -> AppResult<Option<i32>> {
        let ws = self.m().workbook.worksheet(sheet)?;
        let filled = |r: i32, c: i32| -> bool {
            (1..=LAST_ROW).contains(&r)
                && (1..=LAST_COLUMN).contains(&c)
                && ws.cell(r, c).map(|x| !matches!(x, Cell::EmptyCell { .. })).unwrap_or(false)
        };
        let start = source.r2 + 1;
        if start > LAST_ROW {
            return Ok(None);
        }
        let Some(guide) = [source.c1 - 1, source.c2 + 1].into_iter().find(|&c| filled(start, c)) else {
            return Ok(None);
        };
        let mut end = start;
        while end < LAST_ROW && filled(end + 1, guide) {
            end += 1;
        }
        // Stop above data already in the columns being filled
        for r in start..=end {
            if (source.c1..=source.c2).any(|c| filled(r, c)) {
                end = r - 1;
                break;
            }
        }
        Ok((end >= start).then_some(end))
    }

    /// Home → Fill → Series. Returns the range that was filled.
    pub fn fill_series(&mut self, sheet: u32, rect: Rect, spec: &SeriesSpec) -> AppResult<Rect> {
        self.check_sheet(sheet)?;
        if spec.kind == "autofill" {
            return self.series_autofill(sheet, rect, spec.in_rows);
        }
        if !spec.step.is_finite() || spec.stop.is_some_and(|s| !s.is_finite()) {
            return Err(AppError::Invalid("Enter a valid step value.".into()));
        }
        // Lines and how far they may run
        let single = if spec.in_rows { rect.c1 == rect.c2 } else { rect.r1 == rect.r2 };
        let limit = if spec.in_rows { LAST_COLUMN } else { LAST_ROW };
        let (first, last) = if spec.in_rows { (rect.c1, rect.c2) } else { (rect.r1, rect.r2) };
        let last = if single && spec.stop.is_some() { limit } else { last };
        let lines: Vec<i32> = if spec.in_rows { (rect.r1..=rect.r2).collect() } else { (rect.c1..=rect.c2).collect() };
        let cell_at = |line: i32, pos: i32| if spec.in_rows { (line, pos) } else { (pos, line) };

        let mut cells = Vec::new();
        let mut filled = Rect::cell(rect.r1, rect.c1);
        let mut any = false;
        for &line in &lines {
            let (r0, c0) = cell_at(line, first);
            let start = self.read_seed(sheet, r0, c0)?;
            let Value::Number(v0) = start.value else {
                continue;
            };
            if start.formula {
                continue;
            }
            // Leading numbers of the line (used by Trend)
            let mut ys = vec![v0];
            if spec.trend && !single {
                let mut pos = first + 1;
                while pos <= last {
                    let (r, c) = cell_at(line, pos);
                    match self.read_seed(sheet, r, c)?.value {
                        Value::Number(y) => ys.push(y),
                        _ => break,
                    }
                    pos += 1;
                }
            }
            let fitted = match spec.kind.as_str() {
                "growth" if spec.trend && ys.len() >= 2 && ys.iter().all(|&y| y > 0.0) => {
                    let logs: Vec<f64> = ys.iter().map(|y| y.ln()).collect();
                    Some(fit(&logs))
                }
                "linear" if spec.trend && ys.len() >= 2 => Some(fit(&ys)),
                _ => None,
            };
            let from = if fitted.is_some() { ys.len() } else { 1 };
            let mut end = first;
            let mut i = from;
            loop {
                let pos = first + i as i32;
                if pos > last {
                    break;
                }
                let value = match (spec.kind.as_str(), fitted) {
                    ("linear", Some((a, b))) => a + b * i as f64,
                    ("growth", Some((a, b))) => (a + b * i as f64).exp(),
                    ("growth", None) => v0 * spec.step.powi(i as i32),
                    ("date", _) => {
                        let steps = spec.step.round() as i64 * i as i64;
                        match spec.unit.as_str() {
                            "weekday" => add_weekdays(v0, steps),
                            "month" => add_months(v0, steps, false),
                            "year" => add_months(v0, steps * 12, false),
                            _ => v0 + steps as f64,
                        }
                    }
                    _ => v0 + spec.step * i as f64,
                };
                let value = tidy(value);
                if let Some(stop) = spec.stop {
                    let rising = match fitted {
                        Some((_, b)) => b >= 0.0,
                        None if spec.kind == "growth" => (v0 >= 0.0) == (spec.step >= 1.0),
                        None => spec.step >= 0.0,
                    };
                    if (rising && value > stop) || (!rising && value < stop) {
                        break;
                    }
                }
                if !value.is_finite() {
                    break;
                }
                let (r, c) = cell_at(line, pos);
                cells.push((r, c, Some(format_number_input(value)), start.style.clone()));
                end = pos;
                i += 1;
            }
            let (r, c) = cell_at(line, end.max(first));
            let line_rect = Rect::new(r0.min(r), c0.min(c), r0.max(r), c0.max(c));
            filled = if any { union(&filled, &line_rect) } else { line_rect };
            any = true;
        }
        if cells.is_empty() {
            return Ok(if any { filled } else { rect });
        }
        // Cells of the covered block that the series did not reach keep their contents
        let block = union(&filled, &Rect::new(rect.r1, rect.c1, rect.r1, rect.c1));
        let mut all = Vec::new();
        let written: std::collections::HashSet<(i32, i32)> = cells.iter().map(|c| (c.0, c.1)).collect();
        for r in block.r1..=block.r2 {
            for c in block.c1..=block.c2 {
                if !written.contains(&(r, c)) {
                    let seed = self.read_seed(sheet, r, c)?;
                    let text = if seed.formula {
                        Some(self.m().get_localized_cell_content(sheet, r, c)?)
                    } else {
                        copy_input(&seed.value)
                    };
                    all.push((r, c, text, seed.style));
                }
            }
        }
        all.extend(cells);
        self.write_block(sheet, block, all, true)?;
        Ok(if single { filled } else { rect })
    }

    /// Flash Fill (Ctrl+E): learns from the values typed in column `col` next
    /// to the data around (row, col) and fills the column's empty cells.
    pub fn flash_fill(&mut self, sheet: u32, row: i32, col: i32) -> AppResult<FlashFillResult> {
        self.check_sheet(sheet)?;
        let region = self.current_region(sheet, row, col)?;
        let input_cols: Vec<i32> = (region.c1..=region.c2).filter(|&c| c != col).collect();
        let no_pattern = || {
            AppError::Invalid(
                "Flash Fill couldn't find a pattern. Type the result you want for one or two rows next to your \
                 data, select a cell in that column and press Ctrl+E."
                    .into(),
            )
        };
        if input_cols.is_empty() {
            return Err(no_pattern());
        }
        let model = self.m();
        let shown = |r: i32, c: i32| model.get_formatted_cell_value(sheet, r, c).unwrap_or_default();
        let mut examples = Vec::new();
        let mut todo = Vec::new();
        for r in region.r1..=region.r2 {
            let inputs: Vec<String> = input_cols.iter().map(|&c| shown(r, c)).collect();
            let target = shown(r, col);
            if !target.is_empty() {
                examples.push((r, inputs, target));
            } else if inputs.iter().any(|t| !t.trim().is_empty()) {
                todo.push((r, inputs));
            }
        }
        if todo.is_empty() || examples.is_empty() {
            return Err(no_pattern());
        }
        let learn = |from: usize| {
            let set: Vec<(Vec<String>, String)> =
                examples.iter().skip(from).take(20).map(|(_, i, o)| (i.clone(), o.clone())).collect();
            crate::engine::flashfill::learn(&set)
        };
        // A header row above the data is not an example
        let program = learn(0)
            .or_else(|| (examples.len() >= 2 && examples[0].0 == region.r1).then(|| learn(1)).flatten())
            .ok_or_else(no_pattern)?;
        let outputs: std::collections::HashMap<i32, String> =
            todo.iter().filter_map(|(r, inputs)| program.run(inputs).map(|o| (*r, o))).collect();
        let (Some(&r1), Some(&r2)) = (outputs.keys().min(), outputs.keys().max()) else {
            return Err(no_pattern());
        };
        let mut cells = Vec::new();
        for r in r1..=r2 {
            let style = model.get_style_for_cell(sheet, r, col)?;
            let text = match outputs.get(&r) {
                Some(o) => Some(format!("'{o}")),
                None => {
                    let content = model.get_localized_cell_content(sheet, r, col)?;
                    (!content.is_empty()).then_some(content)
                }
            };
            cells.push((r, col, text, style));
        }
        let rect = Rect::new(r1, col, r2, col);
        self.write_block(sheet, rect, cells, true)?;
        Ok(FlashFillResult { rect, count: outputs.len() })
    }

    /// Series with type AutoFill: extend the leading cells over the selection.
    fn series_autofill(&mut self, sheet: u32, rect: Rect, in_rows: bool) -> AppResult<Rect> {
        let ws = self.m().workbook.worksheet(sheet)?;
        let filled = |r: i32, c: i32| ws.cell(r, c).map(|x| !matches!(x, Cell::EmptyCell { .. })).unwrap_or(false);
        let source = if in_rows {
            let mut c = rect.c1;
            while c < rect.c2 && (rect.r1..=rect.r2).any(|r| filled(r, c + 1)) {
                c += 1;
            }
            Rect::new(rect.r1, rect.c1, rect.r2, c)
        } else {
            let mut r = rect.r1;
            while r < rect.r2 && (rect.c1..=rect.c2).any(|c| filled(r + 1, c)) {
                r += 1;
            }
            Rect::new(rect.r1, rect.c1, r, rect.c2)
        };
        if source != rect {
            self.fill(sheet, source, rect, FillMode::Auto)?;
        }
        Ok(rect)
    }
}

fn union(a: &Rect, b: &Rect) -> Rect {
    Rect::new(a.r1.min(b.r1), a.c1.min(b.c1), a.r2.max(b.r2), a.c2.max(b.c2))
}

/// Direction and new cells of a fill, or None when the target does not grow.
fn fill_region(source: &Rect, target: &Rect) -> Option<(Dir, Rect)> {
    if target.r2 > source.r2 {
        Some((Dir::Down, Rect::new(source.r2 + 1, source.c1, target.r2, source.c2)))
    } else if target.r1 < source.r1 {
        Some((Dir::Up, Rect::new(target.r1, source.c1, source.r1 - 1, source.c2)))
    } else if target.c2 > source.c2 {
        Some((Dir::Right, Rect::new(source.r1, source.c2 + 1, source.r2, target.c2)))
    } else if target.c1 < source.c1 {
        Some((Dir::Left, Rect::new(source.r1, target.c1, source.r2, source.c1 - 1)))
    } else {
        None
    }
}

/// The input that recreates a constant exactly (text is quoted so that
/// "007" or "TRUE" stay text).
fn copy_input(value: &Value) -> Option<String> {
    match value {
        Value::Empty => None,
        Value::Number(n) => Some(format_number_input(*n)),
        Value::Text(t) => Some(format!("'{t}")),
        Value::Bool(b) => Some(if *b { "TRUE" } else { "FALSE" }.to_string()),
        Value::Error(e) => Some(e.clone()),
    }
}

fn behaves_as_series(kind: &Kind, mode: FillMode, seeds_in_line: usize) -> bool {
    match mode {
        FillMode::Copy | FillMode::Formats => false,
        FillMode::Toggle => seeds_in_line == 1 && *kind == Kind::Number,
        FillMode::Auto | FillMode::Values => !(seeds_in_line == 1 && *kind == Kind::Number),
        FillMode::Series | FillMode::Days | FillMode::Weekdays | FillMode::Months | FillMode::Years => true,
    }
}

fn classify(seed: &Seed) -> Kind {
    if seed.formula {
        return Kind::Copy;
    }
    match &seed.value {
        Value::Number(_) if seed.date || seed.time => Kind::Date { time: seed.time },
        Value::Number(_) => Kind::Number,
        Value::Text(t) => {
            if let Some((list, _, _)) = parse_name(t) {
                Kind::Name { list }
            } else if let Some(tn) = parse_text_num(t) {
                Kind::TextNum { prefix: tn.prefix, suffix: tn.suffix, lead: tn.lead, ordinal: tn.ordinal.is_some() }
            } else {
                Kind::Copy
            }
        }
        _ => Kind::Copy,
    }
}

/// Groups consecutive seeds that continue together ("Item 1, Item 2" or 1, 3, 5).
fn runs(seeds: &[Seed]) -> Vec<Run> {
    let mut kinds: Vec<Kind> = seeds.iter().map(classify).collect();
    // "May" is both a full and a short month name: follow its neighbours
    for i in 0..kinds.len() {
        let is_may = matches!(&seeds[i].value, Value::Text(t) if t.trim().eq_ignore_ascii_case("may"));
        if is_may {
            let near = kinds[..i].iter().rev().chain(kinds[i + 1..].iter()).find_map(|k| match k {
                Kind::Name { list } if *list <= 1 => Some(*list),
                _ => None,
            });
            if let Some(list) = near {
                kinds[i] = Kind::Name { list };
            }
        }
    }
    let mut out: Vec<Run> = Vec::new();
    for (i, kind) in kinds.into_iter().enumerate() {
        match out.last_mut() {
            Some(last) if kind != Kind::Copy && last.kind == kind => last.len += 1,
            _ => out.push(Run { start: i, len: 1, kind }),
        }
    }
    out
}

/// The `index`-th value of a run (the seeds are indexes 0..len).
fn series_value(kind: &Kind, seeds: &[Seed], index: usize, mode: FillMode, backwards: bool) -> Option<String> {
    let x = index as f64;
    // Step for a single seed
    let unit: i64 = if backwards { -1 } else { 1 };
    let ux = unit as f64 * x;
    match kind {
        Kind::Copy => None,
        Kind::Number => {
            let ys: Vec<f64> = seeds.iter().filter_map(|s| num(&s.value)).collect();
            let v = if ys.len() == 1 { ys[0] + ux } else { at(fit(&ys), x) };
            Some(format_number_input(tidy(v)))
        }
        Kind::Date { time } => {
            let ys: Vec<f64> = seeds.iter().filter_map(|s| num(&s.value)).collect();
            let v0 = ys[0];
            let unit_step = |measure: fn(f64, f64) -> i64| -> i64 {
                match ys.get(1) {
                    Some(&y1) if measure(ys[0], y1) != 0 => measure(ys[0], y1),
                    _ => unit,
                }
            };
            let v = match mode {
                FillMode::Days if ys.len() == 1 => v0 + ux,
                FillMode::Weekdays => add_weekdays(v0, unit_step(weekday_diff) * index as i64),
                FillMode::Months => add_months(v0, unit_step(month_diff) * index as i64, false),
                FillMode::Years => add_months(v0, unit_step(|a, b| month_diff(a, b) / 12) * 12 * index as i64, false),
                FillMode::Days => at(fit(&ys), x),
                _ if ys.len() == 1 => v0 + if *time { ux / 24.0 } else { ux },
                _ => match month_pattern(&ys) {
                    Some((step, end_of_month)) => add_months(v0, step * index as i64, end_of_month),
                    None => at(fit(&ys), x),
                },
            };
            Some(format_number_input(tidy(v)))
        }
        Kind::TextNum { .. } => {
            let parsed: Vec<TextNum> =
                seeds.iter().filter_map(|s| if let Value::Text(t) = &s.value { parse_text_num(t) } else { None }).collect();
            let first = parsed.first()?;
            let ys: Vec<f64> = parsed.iter().map(|t| t.n as f64).collect();
            let v = if ys.len() == 1 { ys[0] + ux } else { at(fit(&ys), x) };
            let mut n = v.round().abs() as u64;
            let quarter = !first.lead
                && first.suffix.is_empty()
                && matches!(first.prefix.trim().to_ascii_lowercase().as_str(), "q" | "qtr" | "qtr." | "quarter")
                && parsed.iter().all(|t| (1..=4).contains(&t.n));
            if quarter {
                n = (v.round() as i64 - 1).rem_euclid(4) as u64 + 1;
            }
            Some(format!("'{}", first.render(n)))
        }
        Kind::Name { list } => {
            let names = name_list(*list);
            let size = names.len() as i64;
            let parsed: Vec<(usize, Case)> = seeds
                .iter()
                .filter_map(|s| match &s.value {
                    Value::Text(t) => parse_name(t).map(|(_, i, c)| (i, c)).or_else(|| {
                        // "May" in a short-month run
                        names.iter().position(|n| n.eq_ignore_ascii_case(t.trim())).map(|i| (i, case_of(t)))
                    }),
                    _ => None,
                })
                .collect();
            let &(i0, case) = parsed.first()?;
            let step = if parsed.len() >= 2 { (parsed[1].0 as i64 - i0 as i64).rem_euclid(size) } else { unit };
            let idx = (i0 as i64 + step * index as i64).rem_euclid(size) as usize;
            Some(format!("'{}", apply_case(names[idx], case)))
        }
    }
}

fn num(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => Some(*n),
        _ => None,
    }
}

/// Least-squares line through (0, y0), (1, y1)… as (intercept, slope).
fn fit(ys: &[f64]) -> (f64, f64) {
    if ys.len() < 2 {
        return (ys.first().copied().unwrap_or(0.0), 1.0);
    }
    let n = ys.len() as f64;
    let mx = (n - 1.0) / 2.0;
    let my = ys.iter().sum::<f64>() / n;
    let (mut sxy, mut sxx) = (0.0, 0.0);
    for (i, y) in ys.iter().enumerate() {
        let dx = i as f64 - mx;
        sxy += dx * (y - my);
        sxx += dx * dx;
    }
    let b = sxy / sxx;
    (my - b * mx, b)
}

fn at((a, b): (f64, f64), x: f64) -> f64 {
    a + b * x
}

/// Rounds away binary noise (0.30000000000000004 → 0.3): 15 significant digits.
fn tidy(v: f64) -> f64 {
    if !v.is_finite() || v == 0.0 {
        return v;
    }
    format!("{v:.14e}").parse().unwrap_or(v)
}

fn is_time_only(fmt: &str) -> bool {
    let mut in_quote = false;
    let (mut time, mut date) = (false, false);
    for ch in fmt.chars() {
        match ch {
            '"' => in_quote = !in_quote,
            _ if in_quote => {}
            'h' | 'H' | 's' | 'S' => time = true,
            'd' | 'D' | 'y' | 'Y' => date = true,
            _ => {}
        }
    }
    time && !date
}

fn parse_name(text: &str) -> Option<(usize, usize, Case)> {
    let t = text.trim();
    if t.len() < 3 {
        return None;
    }
    for list in 0..4 {
        if let Some(i) = name_list(list).iter().position(|n| n.eq_ignore_ascii_case(t)) {
            return Some((list, i, case_of(t)));
        }
    }
    None
}

fn case_of(t: &str) -> Case {
    let letters = || t.chars().filter(|c| c.is_alphabetic());
    if letters().all(|c| c.is_uppercase()) {
        Case::Upper
    } else if letters().all(|c| c.is_lowercase()) {
        Case::Lower
    } else {
        Case::Title
    }
}

fn apply_case(name: &str, case: Case) -> String {
    match case {
        Case::Title => name.to_string(),
        Case::Upper => name.to_uppercase(),
        Case::Lower => name.to_lowercase(),
    }
}

/// "Item 7" → ("Item ", 7), "007" → (7, width 3), "1st place" → leading ordinal.
fn parse_text_num(text: &str) -> Option<TextNum> {
    let bytes = text.as_bytes();
    let trailing = bytes.iter().rev().take_while(|b| b.is_ascii_digit()).count();
    let (prefix, digits, rest, lead) = if trailing > 0 {
        let split = text.len() - trailing;
        (&text[..split], &text[split..], "", false)
    } else {
        let leading = bytes.iter().take_while(|b| b.is_ascii_digit()).count();
        if leading == 0 {
            return None;
        }
        ("", &text[..leading], &text[leading..], true)
    };
    if digits.len() > 15 {
        return None;
    }
    let n: u64 = digits.parse().ok()?;
    let width = if digits.len() > 1 && digits.starts_with('0') { digits.len() } else { 0 };
    let mut suffix = rest.to_string();
    let mut ordinal = None;
    if let (true, Some(two), Some(after)) = (lead, rest.get(..2), rest.get(2..)) {
        if ["st", "nd", "rd", "th"].contains(&two.to_ascii_lowercase().as_str())
            && after.chars().next().map(|c| !c.is_alphanumeric()).unwrap_or(true)
        {
            ordinal = Some(two.chars().all(|c| c.is_uppercase()));
            suffix = after.to_string();
        }
    }
    Some(TextNum { prefix: prefix.to_string(), n, width, suffix, lead, ordinal })
}

impl TextNum {
    fn render(&self, n: u64) -> String {
        let digits = format!("{n:0width$}", width = self.width);
        let ordinal = match self.ordinal {
            Some(upper) => {
                let s = match (n % 100, n % 10) {
                    (11..=13, _) => "th",
                    (_, 1) => "st",
                    (_, 2) => "nd",
                    (_, 3) => "rd",
                    _ => "th",
                };
                if upper {
                    s.to_uppercase()
                } else {
                    s.to_string()
                }
            }
            None => String::new(),
        };
        format!("{}{digits}{ordinal}{}", self.prefix, self.suffix)
    }
}

// ----------------------------------------------------------------------
// Excel date serials (1 = 1900-01-01, with Excel's fictional 1900-02-29)
// ----------------------------------------------------------------------

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    // Howard Hinnant's civil_from_days, days since 1970-01-01
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn ymd(serial: f64) -> (i64, i64, i64) {
    let s = serial.floor() as i64;
    // Serials before the fictional 29 Feb 1900 are one day behind the calendar
    let s = if s < 60 { s + 1 } else { s };
    civil_from_days(s - 25569)
}

fn serial_of(y: i64, m: i64, d: i64) -> f64 {
    let s = days_from_civil(y, m, d) + 25569;
    (if s < 61 { s - 1 } else { s }) as f64
}

fn days_in_month(y: i64, m: i64) -> i64 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        _ => 28,
    }
}

/// Adds months keeping the day (clamped to the month's length), or the last
/// day of the month for end-of-month series. The time of day is kept.
fn add_months(serial: f64, months: i64, end_of_month: bool) -> f64 {
    let (y, m, d) = ymd(serial);
    let total = y * 12 + (m - 1) + months;
    let (ny, nm) = (total.div_euclid(12), total.rem_euclid(12) + 1);
    let dim = days_in_month(ny, nm);
    let nd = if end_of_month { dim } else { d.min(dim) };
    serial_of(ny, nm, nd) + serial.fract()
}

/// 0 = Monday … 6 = Sunday.
fn weekday(serial: f64) -> i64 {
    let s = serial.floor() as i64;
    let s = if s < 60 { s + 1 } else { s };
    (s - 25569 + 3).rem_euclid(7)
}

fn add_weekdays(serial: f64, count: i64) -> f64 {
    let mut s = serial;
    let step = if count >= 0 { 1.0 } else { -1.0 };
    let mut left = count.abs();
    // Whole weeks first
    s += (left / 5) as f64 * 7.0 * step;
    left %= 5;
    while left > 0 {
        s += step;
        if weekday(s) < 5 {
            left -= 1;
        }
    }
    while weekday(s) >= 5 {
        s += step;
    }
    s
}

fn weekday_diff(a: f64, b: f64) -> i64 {
    let (lo, hi, sign) = if b >= a { (a, b, 1) } else { (b, a, -1) };
    let mut s = lo.floor();
    let mut n = 0;
    while s < hi.floor() {
        s += 1.0;
        if weekday(s) < 5 {
            n += 1;
        }
    }
    sign * n
}

fn month_diff(a: f64, b: f64) -> i64 {
    let (ya, ma, _) = ymd(a);
    let (yb, mb, _) = ymd(b);
    (yb * 12 + mb) - (ya * 12 + ma)
}

/// Dates on the same day of the month (or all month ends) a constant number
/// of months apart: (step in months, end of month).
fn month_pattern(ys: &[f64]) -> Option<(i64, bool)> {
    let dates: Vec<(i64, i64, i64)> = ys.iter().map(|&v| ymd(v)).collect();
    let end_of_month = dates.iter().all(|&(y, m, d)| d == days_in_month(y, m)) && dates.iter().any(|&(_, _, d)| d < 31);
    let same_day = dates.iter().all(|&(_, _, d)| d == dates[0].2);
    if !same_day && !end_of_month {
        return None;
    }
    let step = month_diff(ys[0], ys[1]);
    if step == 0 || ys.windows(2).any(|w| month_diff(w[0], w[1]) != step) {
        return None;
    }
    Some((step, end_of_month && !same_day))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serials_round_trip() {
        assert_eq!(serial_of(2026, 9, 28), 46293.0);
        assert_eq!(ymd(46293.0), (2026, 9, 28));
        assert_eq!(ymd(1.0), (1900, 1, 1));
        assert_eq!(ymd(61.0), (1900, 3, 1));
        // 28 Sep 2026 is a Monday
        assert_eq!(weekday(46293.0), 0);
        assert_eq!(add_months(serial_of(2026, 1, 31), 1, false), serial_of(2026, 2, 28));
        assert_eq!(add_months(serial_of(2026, 1, 31), 2, false), serial_of(2026, 3, 31));
        // Friday + 1 weekday = Monday
        assert_eq!(add_weekdays(serial_of(2026, 10, 2), 1), serial_of(2026, 10, 5));
        assert_eq!(add_weekdays(serial_of(2026, 10, 2), 6), serial_of(2026, 10, 12));
    }

    #[test]
    fn text_numbers() {
        let t = parse_text_num("Item 007").unwrap();
        assert_eq!(t.render(8), "Item 008");
        let t = parse_text_num("1st place").unwrap();
        assert_eq!(t.render(2), "2nd place");
        assert_eq!(t.render(11), "11th place");
        assert_eq!(t.render(23), "23rd place");
        assert!(parse_text_num("Total").is_none());
        assert_eq!(parse_name("FEB"), Some((1, 1, Case::Upper)));
        assert_eq!(parse_name("sunday"), Some((2, 6, Case::Lower)));
    }

    #[test]
    fn fitting() {
        assert_eq!(tidy(at(fit(&[0.1, 0.2]), 2.0)), 0.3);
        // Excel continues 1, 2, 4 with its best-fit line: 5.333…, 6.833…
        assert!((at(fit(&[1.0, 2.0, 4.0]), 3.0) - 16.0 / 3.0).abs() < 1e-12);
        assert_eq!(tidy(at(fit(&[1.0, 2.0, 4.0]), 4.0)), 6.83333333333333);
    }
}
