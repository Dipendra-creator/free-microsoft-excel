//! A1-reference helpers (column letters, cell and range parsing).

use serde::{Deserialize, Serialize};

pub const LAST_ROW: i32 = 1_048_576;
pub const LAST_COLUMN: i32 = 16_384;

/// Inclusive rectangle of cells, 1-based.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Rect {
    pub r1: i32,
    pub c1: i32,
    pub r2: i32,
    pub c2: i32,
}

impl Rect {
    pub fn new(r1: i32, c1: i32, r2: i32, c2: i32) -> Rect {
        Rect {
            r1: r1.min(r2),
            c1: c1.min(c2),
            r2: r1.max(r2),
            c2: c1.max(c2),
        }
    }

    pub fn cell(r: i32, c: i32) -> Rect {
        Rect::new(r, c, r, c)
    }

    pub fn width(&self) -> i32 {
        self.c2 - self.c1 + 1
    }

    pub fn height(&self) -> i32 {
        self.r2 - self.r1 + 1
    }

    pub fn is_single(&self) -> bool {
        self.r1 == self.r2 && self.c1 == self.c2
    }

    pub fn contains(&self, r: i32, c: i32) -> bool {
        r >= self.r1 && r <= self.r2 && c >= self.c1 && c <= self.c2
    }

    pub fn intersects(&self, o: &Rect) -> bool {
        self.r1 <= o.r2 && o.r1 <= self.r2 && self.c1 <= o.c2 && o.c1 <= self.c2
    }

    pub fn is_full_columns(&self) -> bool {
        self.r1 == 1 && self.r2 == LAST_ROW
    }

    pub fn is_full_rows(&self) -> bool {
        self.c1 == 1 && self.c2 == LAST_COLUMN
    }

    /// Clamps rows/columns to the given used extent (keeps at least one cell).
    pub fn clamp_to(&self, max_row: i32, max_col: i32) -> Rect {
        Rect {
            r1: self.r1,
            c1: self.c1,
            r2: self.r2.min(max_row.max(self.r1)),
            c2: self.c2.min(max_col.max(self.c1)),
        }
    }

    pub fn to_a1(&self) -> String {
        if self.is_single() {
            format!("{}{}", column_name(self.c1), self.r1)
        } else {
            format!(
                "{}{}:{}{}",
                column_name(self.c1),
                self.r1,
                column_name(self.c2),
                self.r2
            )
        }
    }

    pub fn to_array(&self) -> [i32; 4] {
        [self.r1, self.c1, self.r2, self.c2]
    }
}

/// 1 -> "A", 27 -> "AA"
pub fn column_name(mut column: i32) -> String {
    let mut name = Vec::new();
    while column > 0 {
        let rem = ((column - 1) % 26) as u8;
        name.push(b'A' + rem);
        column = (column - 1) / 26;
    }
    name.reverse();
    String::from_utf8(name).unwrap_or_default()
}

/// "AA" -> 27
pub fn column_number(name: &str) -> Option<i32> {
    if name.is_empty() || name.len() > 3 {
        return None;
    }
    let mut n: i32 = 0;
    for ch in name.chars() {
        if !ch.is_ascii_alphabetic() {
            return None;
        }
        n = n * 26 + (ch.to_ascii_uppercase() as i32 - 'A' as i32 + 1);
    }
    if n >= 1 && n <= LAST_COLUMN {
        Some(n)
    } else {
        None
    }
}

/// Parses "B12" or "$B$12" into (row, column).
pub fn parse_cell(text: &str) -> Option<(i32, i32)> {
    let text = text.replace('$', "");
    let split = text.find(|c: char| c.is_ascii_digit())?;
    let (letters, digits) = text.split_at(split);
    let column = column_number(letters)?;
    let row: i32 = digits.parse().ok()?;
    if row < 1 || row > LAST_ROW {
        return None;
    }
    Some((row, column))
}

/// Parses "A1:B2" or "A1" into a rectangle.
pub fn parse_range(text: &str) -> Option<Rect> {
    let text = text.trim();
    match text.split_once(':') {
        Some((a, b)) => {
            let (r1, c1) = parse_cell(a)?;
            let (r2, c2) = parse_cell(b)?;
            Some(Rect::new(r1, c1, r2, c2))
        }
        None => {
            let (r, c) = parse_cell(text)?;
            Some(Rect::cell(r, c))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn columns_roundtrip() {
        for (n, s) in [(1, "A"), (26, "Z"), (27, "AA"), (52, "AZ"), (703, "AAA"), (16384, "XFD")] {
            assert_eq!(column_name(n), s);
            assert_eq!(column_number(s), Some(n));
        }
    }

    #[test]
    fn ranges() {
        assert_eq!(parse_range("B2:A1"), Some(Rect::new(1, 1, 2, 2)));
        assert_eq!(parse_range("$C$3"), Some(Rect::cell(3, 3)));
        assert_eq!(parse_range("nope"), None);
    }
}
