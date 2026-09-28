//! Workbook features IronCalc does not model itself: merged cells, cell notes,
//! charts and AutoFilters.
//!
//! They live next to the engine model, are keyed by the stable `sheet_id`,
//! shift with row/column insertions and deletions like Excel, and take part in
//! the session's undo history as one snapshot per user action.

use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};

use super::{
    a1::Rect,
    merges::{delete_span, insert_span, MergeStore},
};

/// A note (legacy Excel comment) attached to a cell.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub row: i32,
    pub col: i32,
    pub author: String,
    pub text: String,
}

/// An embedded chart drawn from a range of the same sheet.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChartSpec {
    pub id: String,
    /// column | bar | line | area | pie | doughnut | scatter
    pub kind: String,
    /// Source data including the header row / label column.
    pub range: Rect,
    pub title: String,
    /// Series are rows instead of columns.
    pub series_in_rows: bool,
    pub legend: bool,
    /// Top-left anchor cell and offset inside it (unzoomed px).
    pub row: i32,
    pub col: i32,
    pub dx: f64,
    pub dy: f64,
    pub width: f64,
    pub height: f64,
}

impl Default for ChartSpec {
    fn default() -> Self {
        ChartSpec {
            id: String::new(),
            kind: "column".into(),
            range: Rect::cell(1, 1),
            title: String::new(),
            series_in_rows: false,
            legend: true,
            row: 1,
            col: 1,
            dx: 0.0,
            dy: 0.0,
            width: 480.0,
            height: 288.0,
        }
    }
}

/// AutoFilter on a range whose first row holds the headers.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoFilter {
    pub range: Rect,
    /// column -> displayed values that stay visible ("" = blanks).
    pub columns: BTreeMap<i32, Vec<String>>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Extras {
    pub merges: MergeStore,
    pub notes: HashMap<u32, Vec<Note>>,
    pub charts: HashMap<u32, Vec<ChartSpec>>,
    pub filters: HashMap<u32, AutoFilter>,
}

fn shift_point_insert(v: i32, at: i32, count: i32) -> i32 {
    if v >= at {
        v + count
    } else {
        v
    }
}

/// None when the point itself was deleted.
fn shift_point_delete(v: i32, at: i32, count: i32) -> Option<i32> {
    if v < at {
        Some(v)
    } else if v >= at + count {
        Some(v - count)
    } else {
        None
    }
}

impl Extras {
    // ------------------------------------------------------------------
    // Notes
    // ------------------------------------------------------------------

    pub fn notes(&self, sheet_id: u32) -> &[Note] {
        self.notes.get(&sheet_id).map(|v| v.as_slice()).unwrap_or(&[])
    }

    pub fn note(&self, sheet_id: u32, row: i32, col: i32) -> Option<&Note> {
        self.notes(sheet_id).iter().find(|n| n.row == row && n.col == col)
    }

    pub fn set_note(&mut self, sheet_id: u32, note: Note) {
        let list = self.notes.entry(sheet_id).or_default();
        list.retain(|n| !(n.row == note.row && n.col == note.col));
        if !note.text.trim().is_empty() {
            list.push(note);
            list.sort_by_key(|n| (n.row, n.col));
        }
    }

    pub fn remove_notes_in(&mut self, sheet_id: u32, rect: &Rect) -> bool {
        if let Some(list) = self.notes.get_mut(&sheet_id) {
            let before = list.len();
            list.retain(|n| !rect.contains(n.row, n.col));
            return before != list.len();
        }
        false
    }

    // ------------------------------------------------------------------
    // Charts
    // ------------------------------------------------------------------

    pub fn charts(&self, sheet_id: u32) -> &[ChartSpec] {
        self.charts.get(&sheet_id).map(|v| v.as_slice()).unwrap_or(&[])
    }

    pub fn upsert_chart(&mut self, sheet_id: u32, chart: ChartSpec) {
        let list = self.charts.entry(sheet_id).or_default();
        match list.iter_mut().find(|c| c.id == chart.id) {
            Some(existing) => *existing = chart,
            None => list.push(chart),
        }
    }

    pub fn remove_chart(&mut self, sheet_id: u32, id: &str) -> bool {
        if let Some(list) = self.charts.get_mut(&sheet_id) {
            let before = list.len();
            list.retain(|c| c.id != id);
            return before != list.len();
        }
        false
    }

    // ------------------------------------------------------------------
    // Structure changes
    // ------------------------------------------------------------------

    pub fn remove_sheet(&mut self, sheet_id: u32) {
        self.merges.remove_sheet(sheet_id);
        self.notes.remove(&sheet_id);
        self.charts.remove(&sheet_id);
        self.filters.remove(&sheet_id);
    }

    /// Duplicate Sheet copies merges, notes and charts (not the filter state).
    pub fn copy_sheet(&mut self, from: u32, to: u32) {
        self.merges.copy_sheet(from, to);
        if let Some(n) = self.notes.get(&from).cloned() {
            self.notes.insert(to, n);
        }
        if let Some(list) = self.charts.get(&from).cloned() {
            let copies = list
                .into_iter()
                .map(|mut c| {
                    c.id = format!("{}-{}", c.id, to);
                    c
                })
                .collect();
            self.charts.insert(to, copies);
        }
    }

    pub fn insert_rows(&mut self, sheet_id: u32, at: i32, count: i32) {
        self.merges.insert_rows(sheet_id, at, count);
        for n in self.notes.entry(sheet_id).or_default() {
            n.row = shift_point_insert(n.row, at, count);
        }
        for c in self.charts.entry(sheet_id).or_default() {
            let (a, b) = insert_span(c.range.r1, c.range.r2, at, count);
            c.range.r1 = a;
            c.range.r2 = b;
            c.row = shift_point_insert(c.row, at, count);
        }
        if let Some(f) = self.filters.get_mut(&sheet_id) {
            let (a, b) = insert_span(f.range.r1, f.range.r2, at, count);
            f.range.r1 = a;
            f.range.r2 = b;
        }
    }

    pub fn delete_rows(&mut self, sheet_id: u32, at: i32, count: i32) {
        self.merges.delete_rows(sheet_id, at, count);
        if let Some(list) = self.notes.get_mut(&sheet_id) {
            list.retain_mut(|n| match shift_point_delete(n.row, at, count) {
                Some(r) => {
                    n.row = r;
                    true
                }
                None => false,
            });
        }
        if let Some(list) = self.charts.get_mut(&sheet_id) {
            list.retain_mut(|c| {
                let Some((a, b)) = delete_span(c.range.r1, c.range.r2, at, count) else {
                    return false;
                };
                c.range.r1 = a;
                c.range.r2 = b;
                c.row = shift_point_delete(c.row, at, count).unwrap_or(at).max(1);
                true
            });
        }
        let header_deleted = self
            .filters
            .get(&sheet_id)
            .map(|f| f.range.r1 >= at && f.range.r1 < at + count)
            .unwrap_or(false);
        if header_deleted {
            self.filters.remove(&sheet_id);
        } else if let Some(f) = self.filters.get_mut(&sheet_id) {
            if let Some((a, b)) = delete_span(f.range.r1, f.range.r2, at, count) {
                f.range.r1 = a;
                f.range.r2 = b;
            }
        }
    }

    pub fn insert_columns(&mut self, sheet_id: u32, at: i32, count: i32) {
        self.merges.insert_columns(sheet_id, at, count);
        for n in self.notes.entry(sheet_id).or_default() {
            n.col = shift_point_insert(n.col, at, count);
        }
        for c in self.charts.entry(sheet_id).or_default() {
            let (a, b) = insert_span(c.range.c1, c.range.c2, at, count);
            c.range.c1 = a;
            c.range.c2 = b;
            c.col = shift_point_insert(c.col, at, count);
        }
        if let Some(f) = self.filters.get_mut(&sheet_id) {
            let (a, b) = insert_span(f.range.c1, f.range.c2, at, count);
            f.range.c1 = a;
            f.range.c2 = b;
            f.columns = std::mem::take(&mut f.columns)
                .into_iter()
                .map(|(col, v)| (shift_point_insert(col, at, count), v))
                .collect();
        }
    }

    pub fn delete_columns(&mut self, sheet_id: u32, at: i32, count: i32) {
        self.merges.delete_columns(sheet_id, at, count);
        if let Some(list) = self.notes.get_mut(&sheet_id) {
            list.retain_mut(|n| match shift_point_delete(n.col, at, count) {
                Some(c) => {
                    n.col = c;
                    true
                }
                None => false,
            });
        }
        if let Some(list) = self.charts.get_mut(&sheet_id) {
            list.retain_mut(|c| {
                let Some((a, b)) = delete_span(c.range.c1, c.range.c2, at, count) else {
                    return false;
                };
                c.range.c1 = a;
                c.range.c2 = b;
                c.col = shift_point_delete(c.col, at, count).unwrap_or(at).max(1);
                true
            });
        }
        let mut remove = false;
        if let Some(f) = self.filters.get_mut(&sheet_id) {
            match delete_span(f.range.c1, f.range.c2, at, count) {
                Some((a, b)) => {
                    f.range.c1 = a;
                    f.range.c2 = b;
                    f.columns = std::mem::take(&mut f.columns)
                        .into_iter()
                        .filter_map(|(col, v)| shift_point_delete(col, at, count).map(|c| (c, v)))
                        .collect();
                }
                None => remove = true,
            }
        }
        if remove {
            self.filters.remove(&sheet_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(row: i32, col: i32) -> Note {
        Note { row, col, author: "me".into(), text: "hi".into() }
    }

    #[test]
    fn notes_shift_and_delete() {
        let mut x = Extras::default();
        x.set_note(1, note(3, 2));
        x.insert_rows(1, 1, 2);
        assert_eq!(x.notes(1)[0].row, 5);
        x.delete_columns(1, 2, 1);
        assert!(x.notes(1).is_empty());
    }

    #[test]
    fn charts_follow_their_data() {
        let mut x = Extras::default();
        x.upsert_chart(
            7,
            ChartSpec { id: "c1".into(), range: Rect::new(2, 2, 10, 4), row: 12, col: 2, ..Default::default() },
        );
        x.insert_columns(7, 1, 1);
        assert_eq!(x.charts(7)[0].range, Rect::new(2, 3, 10, 5));
        x.delete_rows(7, 5, 2);
        assert_eq!(x.charts(7)[0].range, Rect::new(2, 3, 8, 5));
        assert_eq!(x.charts(7)[0].row, 10);
        x.delete_columns(7, 3, 3);
        assert!(x.charts(7).is_empty());
    }

    #[test]
    fn filter_columns_shift() {
        let mut x = Extras::default();
        let mut columns = BTreeMap::new();
        columns.insert(3, vec!["a".to_string()]);
        x.filters.insert(1, AutoFilter { range: Rect::new(1, 1, 20, 4), columns });
        x.insert_columns(1, 2, 1);
        assert!(x.filters[&1].columns.contains_key(&4));
        assert_eq!(x.filters[&1].range, Rect::new(1, 1, 20, 5));
        x.delete_rows(1, 1, 1);
        assert!(x.filters.is_empty());
    }
}
