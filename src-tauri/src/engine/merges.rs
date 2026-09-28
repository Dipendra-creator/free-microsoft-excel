//! Merged-cell bookkeeping.
//!
//! IronCalc keeps `merge_cells` on each worksheet for xlsx round-tripping but
//! exposes no editing API for them, so the session owns the authoritative list
//! (keyed by the stable `sheet_id`) and writes it back into the workbook when
//! saving. Row/column insertions and deletions shift merges like Excel does.

use std::collections::HashMap;

use ironcalc_base::types::Workbook;

use super::a1::{parse_range, Rect};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct MergeStore {
    by_sheet: HashMap<u32, Vec<Rect>>,
}

impl MergeStore {
    pub fn from_workbook(workbook: &Workbook) -> MergeStore {
        let mut by_sheet = HashMap::new();
        for ws in &workbook.worksheets {
            let rects: Vec<Rect> = ws
                .merge_cells
                .iter()
                .filter_map(|s| parse_range(s))
                .filter(|r| !r.is_single())
                .collect();
            if !rects.is_empty() {
                by_sheet.insert(ws.sheet_id, rects);
            }
        }
        MergeStore { by_sheet }
    }

    /// Writes the merges back into the workbook (used right before export).
    pub fn write_into(&self, workbook: &mut Workbook) {
        for ws in workbook.worksheets.iter_mut() {
            ws.merge_cells = self
                .get(ws.sheet_id)
                .iter()
                .map(|r| r.to_a1())
                .collect();
        }
    }

    pub fn get(&self, sheet_id: u32) -> &[Rect] {
        self.by_sheet
            .get(&sheet_id)
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }

    pub fn find(&self, sheet_id: u32, row: i32, column: i32) -> Option<Rect> {
        self.get(sheet_id)
            .iter()
            .find(|r| r.contains(row, column))
            .copied()
    }

    pub fn add(&mut self, sheet_id: u32, rect: Rect) {
        if rect.is_single() {
            return;
        }
        let list = self.by_sheet.entry(sheet_id).or_default();
        list.retain(|r| !r.intersects(&rect));
        list.push(rect);
    }

    /// Removes every merge intersecting `rect`. Returns true if anything changed.
    pub fn remove_intersecting(&mut self, sheet_id: u32, rect: &Rect) -> bool {
        if let Some(list) = self.by_sheet.get_mut(&sheet_id) {
            let before = list.len();
            list.retain(|r| !r.intersects(rect));
            return list.len() != before;
        }
        false
    }

    pub fn remove_sheet(&mut self, sheet_id: u32) {
        self.by_sheet.remove(&sheet_id);
    }

    pub fn copy_sheet(&mut self, from: u32, to: u32) {
        if let Some(list) = self.by_sheet.get(&from).cloned() {
            self.by_sheet.insert(to, list);
        }
    }

    pub fn insert_rows(&mut self, sheet_id: u32, at: i32, count: i32) {
        self.shift(sheet_id, |r| {
            let (a, b) = insert_span(r.r1, r.r2, at, count);
            Some(Rect { r1: a, r2: b, ..r })
        });
    }

    pub fn delete_rows(&mut self, sheet_id: u32, at: i32, count: i32) {
        self.shift(sheet_id, |r| {
            let (a, b) = delete_span(r.r1, r.r2, at, count)?;
            Some(Rect { r1: a, r2: b, ..r })
        });
    }

    pub fn insert_columns(&mut self, sheet_id: u32, at: i32, count: i32) {
        self.shift(sheet_id, |r| {
            let (a, b) = insert_span(r.c1, r.c2, at, count);
            Some(Rect { c1: a, c2: b, ..r })
        });
    }

    pub fn delete_columns(&mut self, sheet_id: u32, at: i32, count: i32) {
        self.shift(sheet_id, |r| {
            let (a, b) = delete_span(r.c1, r.c2, at, count)?;
            Some(Rect { c1: a, c2: b, ..r })
        });
    }

    fn shift(&mut self, sheet_id: u32, f: impl Fn(Rect) -> Option<Rect>) {
        if let Some(list) = self.by_sheet.get_mut(&sheet_id) {
            *list = list
                .iter()
                .filter_map(|r| f(*r))
                .filter(|r| !r.is_single())
                .collect();
        }
    }
}

pub(crate) fn insert_span(start: i32, end: i32, at: i32, count: i32) -> (i32, i32) {
    if start >= at {
        (start + count, end + count)
    } else if end >= at {
        (start, end + count)
    } else {
        (start, end)
    }
}

pub(crate) fn delete_span(start: i32, end: i32, at: i32, count: i32) -> Option<(i32, i32)> {
    let del_end = at + count - 1;
    if end < at {
        return Some((start, end));
    }
    if start > del_end {
        return Some((start - count, end - count));
    }
    // Overlap
    let overlap = end.min(del_end) - start.max(at) + 1;
    let remaining = (end - start + 1) - overlap;
    if remaining <= 0 {
        return None;
    }
    let new_start = start.min(at);
    Some((new_start, new_start + remaining - 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shifting() {
        let mut m = MergeStore::default();
        m.add(1, Rect::new(2, 1, 3, 2));
        m.insert_rows(1, 1, 2);
        assert_eq!(m.get(1), &[Rect::new(4, 1, 5, 2)]);
        m.insert_rows(1, 5, 1);
        assert_eq!(m.get(1), &[Rect::new(4, 1, 6, 2)]);
        m.delete_rows(1, 5, 1);
        assert_eq!(m.get(1), &[Rect::new(4, 1, 5, 2)]);
        m.delete_columns(1, 2, 1);
        // A single column two-row merge remains a merge
        assert_eq!(m.get(1), &[Rect::new(4, 1, 5, 1)]);
        m.delete_rows(1, 4, 1);
        // Collapsed to one cell: removed
        assert!(m.get(1).is_empty());
    }
}
