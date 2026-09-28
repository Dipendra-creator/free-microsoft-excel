//! Paste Special (Ctrl+Alt+V): paste only formulas, values or formats,
//! combine with the target (Add / Subtract / Multiply / Divide), skip blanks,
//! transpose, paste links and column widths.

use serde::Deserialize;

use super::{format_number_input, ClipboardPayload, Session};
use crate::{
    engine::a1::{column_name, Rect, LAST_COLUMN, LAST_ROW},
    error::{AppError, AppResult},
};

#[derive(Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PasteSpecial {
    /// all | formulas | values | formats | allExceptBorders | columnWidths |
    /// formulasAndNumberFormats | valuesAndNumberFormats | valuesAndSourceFormatting | link
    pub what: String,
    /// none | add | subtract | multiply | divide
    pub operation: String,
    pub skip_blanks: bool,
    pub transpose: bool,
}

impl Session {
    /// Pastes the internal clipboard at the top-left cell of `target`.
    pub fn paste_special(&mut self, sheet: u32, target: Rect, clip: &ClipboardPayload, o: &PasteSpecial) -> AppResult<Rect> {
        self.check_sheet(sheet)?;
        let (h, w) = (clip.rect.height(), clip.rect.width());
        let (out_h, out_w) = if o.transpose { (w, h) } else { (h, w) };
        let out = Rect::new(target.r1, target.c1, target.r1 + out_h - 1, target.c1 + out_w - 1);
        if out.r2 > LAST_ROW || out.c2 > LAST_COLUMN {
            return Err(AppError::Invalid("The paste area extends beyond the end of the sheet.".into()));
        }
        let same_book = clip.book_id == self.id;
        if o.what == "columnWidths" {
            if !same_book {
                return Err(AppError::Invalid("Column widths can only be pasted within the same workbook.".into()));
            }
            let widths = (0..w)
                .map(|j| self.model.get_column_width(clip.sheet, clip.rect.c1 + j).map_err(AppError::from))
                .collect::<AppResult<Vec<f64>>>()?;
            return self.tx(true, |s, tx| {
                for (j, width) in widths.into_iter().enumerate() {
                    let col = target.c1 + j as i32;
                    let r = s.model.set_columns_width(sheet, col, col, width);
                    Self::step(tx, r)?;
                }
                Ok(Rect::new(target.r1, target.c1, target.r1, target.c1 + w - 1))
            });
        }
        if o.what == "link" && !same_book {
            return Err(AppError::Invalid("Links can only be pasted within the same workbook.".into()));
        }
        let source_sheet_name = self.m().workbook.worksheet(clip.sheet)?.get_name();
        let mut cells = Vec::with_capacity((h * w) as usize);
        for i in 0..h {
            for j in 0..w {
                let (src_row, src_col) = (clip.rect.r1 + i, clip.rect.c1 + j);
                let (row, col) = if o.transpose { (target.r1 + j, target.c1 + i) } else { (target.r1 + i, target.c1 + j) };
                let formula = clip
                    .data
                    .get(src_row.to_string())
                    .and_then(|r| r.get(src_col.to_string()))
                    .and_then(|c| c.get("text"))
                    .and_then(|t| t.as_str())
                    .filter(|t| t.starts_with('='))
                    .map(str::to_string);
                let value = clip.values[i as usize][j as usize].clone();
                let src_style = clip.styles[i as usize][j as usize].clone();
                let old_style = self.m().get_style_for_cell(sheet, row, col)?;
                let old = self.cell_input(sheet, row, col)?;
                let blank = formula.is_none() && value.is_none();
                if o.skip_blanks && blank {
                    cells.push((row, col, old, old_style));
                    continue;
                }
                let displaced = |s: &Session, text: &str| -> AppResult<String> {
                    if same_book {
                        s.displace_formula(clip.sheet, text, (src_row, src_col), (row, col))
                    } else {
                        Ok(text.to_string())
                    }
                };
                let mut content = match o.what.as_str() {
                    "formats" => old.clone(),
                    "values" | "valuesAndNumberFormats" | "valuesAndSourceFormatting" => value.clone(),
                    "link" => {
                        let prefix = if clip.sheet == sheet { String::new() } else { format!("{}!", quote_sheet(&source_sheet_name)) };
                        Some(format!("={prefix}{}{}", column_name(src_col), src_row))
                    }
                    _ => match &formula {
                        Some(f) if o.transpose => {
                            Some(transpose_formula(f, (src_row, src_col), (row, col), &clip.rect, (target.r1, target.c1)))
                        }
                        Some(f) => Some(displaced(self, f)?),
                        None => value.clone(),
                    },
                };
                // Add / Subtract / Multiply / Divide numbers into the target
                if !matches!(o.operation.as_str(), "" | "none") && o.what != "formats" && o.what != "link" {
                    content = combine(&o.operation, old.as_deref(), value.as_deref(), content);
                }
                let style = match o.what.as_str() {
                    "all" | "formats" | "link" | "valuesAndSourceFormatting" | "" => src_style,
                    "allExceptBorders" => {
                        let mut st = src_style;
                        st.border = old_style.border.clone();
                        st
                    }
                    "formulasAndNumberFormats" | "valuesAndNumberFormats" => {
                        let mut st = old_style;
                        st.num_fmt = src_style.num_fmt;
                        st
                    }
                    _ => old_style,
                };
                cells.push((row, col, content, style));
            }
        }
        self.write_block(sheet, out, cells, true)?;
        Ok(out)
    }
}

/// Target `op` source for numbers. A formula in the target becomes
/// `=(formula)+n`; text in either cell is left as Excel does.
fn combine(op: &str, target: Option<&str>, source: Option<&str>, pasted: Option<String>) -> Option<String> {
    let symbol = match op {
        "add" => '+',
        "subtract" => '-',
        "multiply" => '*',
        "divide" => '/',
        _ => return pasted,
    };
    let Some(n) = source.and_then(|s| s.trim().parse::<f64>().ok()) else {
        // Text (or nothing) in the source: pasted as is, blanks count as 0
        return match source {
            None => target.map(str::to_string),
            Some(_) => pasted,
        };
    };
    match target {
        None => apply(0.0, n, symbol).map(format_number_input).or_else(|| Some("#DIV/0!".into())),
        Some(t) if t.starts_with('=') => Some(format!("=({}){symbol}{}", &t[1..], format_number_input(n))),
        Some(t) => match t.trim().parse::<f64>() {
            Ok(v) => Some(apply(v, n, symbol).map(format_number_input).unwrap_or_else(|| "#DIV/0!".into())),
            Err(_) => Some(t.to_string()),
        },
    }
}

fn apply(a: f64, b: f64, symbol: char) -> Option<f64> {
    match symbol {
        '+' => Some(a + b),
        '-' => Some(a - b),
        '*' => Some(a * b),
        _ if b == 0.0 => None,
        _ => Some(a / b),
    }
}

fn quote_sheet(name: &str) -> String {
    if name.chars().all(|c| c.is_alphanumeric() || c == '_') && !name.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        name.to_string()
    } else {
        format!("'{}'", name.replace('\'', "''"))
    }
}

/// Rewrites the A1 references of a formula moved from `from` to `to` by a
/// transposed paste: references to cells inside the copied `area` follow
/// their cell to its transposed position, other relative references shift
/// with the formula, absolute parts stay.
fn transpose_formula(formula: &str, from: (i32, i32), to: (i32, i32), area: &Rect, origin: (i32, i32)) -> String {
    let chars: Vec<char> = formula.chars().collect();
    let mut out = String::with_capacity(formula.len() + 8);
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        if ch == '"' {
            // String literal ("" escapes a quote)
            out.push(ch);
            i += 1;
            while i < chars.len() {
                out.push(chars[i]);
                if chars[i] == '"' {
                    if chars.get(i + 1) == Some(&'"') {
                        out.push('"');
                        i += 2;
                        continue;
                    }
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }
        let boundary = i == 0 || !(chars[i - 1].is_alphanumeric() || matches!(chars[i - 1], '_' | '.' | '$'));
        if boundary {
            if let Some((end, r)) = parse_ref(&chars, i) {
                let qualified = i > 0 && chars[i - 1] == '!';
                out.push_str(&move_ref(r, qualified, from, to, area, origin));
                i = end;
                continue;
            }
        }
        out.push(ch);
        i += 1;
    }
    out
}

#[derive(Clone, Copy)]
struct Ref {
    col: i32,
    row: i32,
    abs_col: bool,
    abs_row: bool,
}

/// `$A$1`-style reference starting at `i`: (end index, reference).
fn parse_ref(chars: &[char], mut i: usize) -> Option<(usize, Ref)> {
    let abs_col = chars.get(i) == Some(&'$');
    if abs_col {
        i += 1;
    }
    let start = i;
    let mut col = 0i32;
    while i < chars.len() && chars[i].is_ascii_alphabetic() && i - start < 3 {
        col = col * 26 + (chars[i].to_ascii_uppercase() as i32 - 'A' as i32 + 1);
        i += 1;
    }
    if i == start || chars.get(i).is_some_and(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    let abs_row = chars.get(i) == Some(&'$');
    if abs_row {
        i += 1;
    }
    let digits = i;
    let mut row = 0i64;
    while i < chars.len() && chars[i].is_ascii_digit() && i - digits < 8 {
        row = row * 10 + (chars[i] as i64 - '0' as i64);
        i += 1;
    }
    if i == digits || chars.get(i).is_some_and(|c| c.is_alphanumeric() || matches!(c, '(' | '_' | '.')) {
        return None;
    }
    if col > LAST_COLUMN || row < 1 || row > LAST_ROW as i64 {
        return None;
    }
    Some((i, Ref { col, row: row as i32, abs_col, abs_row }))
}

fn move_ref(r: Ref, qualified: bool, from: (i32, i32), to: (i32, i32), area: &Rect, origin: (i32, i32)) -> String {
    let inside = !qualified && !r.abs_col && !r.abs_row && area.contains(r.row, r.col);
    let (row, col) = if inside {
        (origin.0 + (r.col - area.c1), origin.1 + (r.row - area.r1))
    } else {
        (
            if r.abs_row { r.row } else { r.row + to.0 - from.0 },
            if r.abs_col { r.col } else { r.col + to.1 - from.1 },
        )
    };
    if !(1..=LAST_ROW).contains(&row) || !(1..=LAST_COLUMN).contains(&col) {
        return "#REF!".into();
    }
    format!(
        "{}{}{}{}",
        if r.abs_col { "$" } else { "" },
        column_name(col),
        if r.abs_row { "$" } else { "" },
        row
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transposed_references() {
        let area = Rect::new(1, 1, 2, 2);
        // A2 = A1*10 pasted transposed at A5: A2 lands in B5, A1 in A5
        assert_eq!(transpose_formula("=A1*10", (2, 1), (5, 2), &area, (5, 1)), "=A5*10");
        // Outside the area: shifts like a normal paste; absolute stays
        assert_eq!(transpose_formula("=SUM(C1:C3)+$D$1", (2, 1), (5, 2), &area, (5, 1)), "=SUM(D4:D6)+$D$1");
        // Functions, strings and sheet names are not references
        assert_eq!(transpose_formula("=LOG10(A1)&\"A1\"", (2, 1), (5, 2), &area, (5, 1)), "=LOG10(A5)&\"A1\"");
        assert_eq!(transpose_formula("=Sheet2!A1", (2, 1), (5, 2), &area, (5, 1)), "=Sheet2!B4");
        assert_eq!(transpose_formula("=A1", (2, 1), (1, 1), &Rect::new(5, 5, 5, 5), (1, 1)), "=#REF!");
    }
}
