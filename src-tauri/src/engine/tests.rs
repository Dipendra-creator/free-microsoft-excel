use super::{a1::Rect, dto::StylePatch, test_config, FindOptions, Session, SortKey};

fn session() -> Session {
    let model = test_config().new_model("Book1").unwrap();
    Session::new("t".into(), "Book1".into(), model, None)
}

fn text(s: &Session, row: i32, col: i32) -> String {
    s.cell_info(0, row, col).unwrap().formatted
}

#[test]
fn input_undo_redo() {
    let mut s = session();
    s.set_input(0, 1, 1, "2", true).unwrap();
    s.set_input(0, 2, 1, "=A1*21", true).unwrap();
    assert_eq!(text(&s, 2, 1), "42");
    s.undo().unwrap();
    assert_eq!(text(&s, 2, 1), "");
    s.redo().unwrap();
    assert_eq!(text(&s, 2, 1), "42");
    assert!(s.dirty);
}

#[test]
fn default_font_and_layout() {
    let s = session();
    let info = s.info();
    assert_eq!(info.default_font, "Aptos Narrow");
    assert_eq!(info.default_font_size, 11.0);
    let layout = s.layout(0).unwrap();
    assert_eq!(layout.default_col_px, 64.0);
    assert!(layout.rows.is_empty());
    assert!(layout.cols.is_empty());
}

#[test]
fn column_width_roundtrip() {
    let mut s = session();
    s.set_column_width(0, 2, 3, 120.0).unwrap();
    s.set_row_height(0, 5, 5, 40.0).unwrap();
    let layout = s.layout(0).unwrap();
    assert!(layout.cols.iter().any(|c| c.0 <= 2 && c.1 >= 2 && (c.2 - 120.0).abs() <= 1.0), "{:?}", layout.cols);
    assert!(layout.rows.iter().any(|r| r.0 == 5 && (r.1 - 40.0).abs() <= 1.0), "{:?}", layout.rows);
    s.undo().unwrap();
    let layout = s.layout(0).unwrap();
    assert!(layout.rows.is_empty(), "{:?}", layout.rows);
}

#[test]
fn style_single_and_multi() {
    let mut s = session();
    s.set_input(0, 1, 1, "x", true).unwrap();
    let rect = Rect::new(1, 1, 2, 2);
    s.apply_style(0, rect, &StylePatch { bold: Some(true), ..Default::default() }).unwrap();
    assert!(s.cell_info(0, 2, 2).unwrap().style.bold);
    let patch = StylePatch {
        font_name: Some("Consolas".into()),
        fill: Some("#FFFF00".into()),
        ..Default::default()
    };
    s.apply_style(0, rect, &patch).unwrap();
    let st = s.cell_info(0, 1, 1).unwrap().style;
    assert_eq!(st.font.as_deref(), Some("Consolas"));
    assert_eq!(st.fill.as_deref(), Some("#FFFF00"));
    assert!(st.bold);
    // one undo reverts the whole multi-attribute patch
    s.undo().unwrap();
    let st = s.cell_info(0, 1, 1).unwrap().style;
    assert_eq!(st.font, None);
    assert!(st.bold);
}

#[test]
fn full_column_style() {
    let mut s = session();
    s.apply_style(0, Rect::new(1, 3, super::a1::LAST_ROW, 3), &StylePatch { fill: Some("#FF0000".into()), ..Default::default() }).unwrap();
    let layout = s.layout(0).unwrap();
    assert_eq!(layout.col_styles.len(), 1);
    assert_eq!(s.cell_info(0, 500, 3).unwrap().style.fill.as_deref(), Some("#FF0000"));
}

#[test]
fn merges_and_undo() {
    let mut s = session();
    s.set_input(0, 1, 2, "keep", true).unwrap();
    s.set_input(0, 2, 2, "drop", true).unwrap();
    s.merge(0, Rect::new(1, 1, 2, 3), "center").unwrap();
    assert_eq!(s.layout(0).unwrap().merges, vec![[1, 1, 2, 3]]);
    assert_eq!(text(&s, 1, 1), "keep");
    assert_eq!(text(&s, 2, 2), "");
    s.insert_rows(0, 1, 1).unwrap();
    assert_eq!(s.layout(0).unwrap().merges, vec![[2, 1, 3, 3]]);
    s.undo().unwrap();
    assert_eq!(s.layout(0).unwrap().merges, vec![[1, 1, 2, 3]]);
    s.undo().unwrap();
    assert!(s.layout(0).unwrap().merges.is_empty());
    assert_eq!(text(&s, 2, 2), "drop");
    assert_eq!(text(&s, 1, 1), "");
}

#[test]
fn copy_paste_all_and_values() {
    let mut s = session();
    s.set_input(0, 1, 1, "5", true).unwrap();
    s.set_input(0, 1, 2, "=A1*2", true).unwrap();
    let clip = s.copy(0, Rect::new(1, 1, 1, 2), false).unwrap();
    assert_eq!(clip.text, "5\t10");
    s.paste(0, Rect::cell(3, 1), &clip, "all").unwrap();
    s.set_input(0, 3, 1, "7", true).unwrap();
    assert_eq!(text(&s, 3, 2), "14");
    s.paste(0, Rect::cell(5, 1), &clip, "values").unwrap();
    assert_eq!(s.cell_info(0, 5, 2).unwrap().content, "10");
    // Paste repeats to fill a larger multiple selection
    s.paste(0, Rect::new(7, 1, 8, 2), &clip, "all").unwrap();
    assert_eq!(text(&s, 8, 2), "10");
}

#[test]
fn paste_external_text() {
    let mut s = session();
    let r = s.paste_text(0, Rect::cell(2, 2), "a\tb\r\n1\t2\r\n").unwrap();
    assert_eq!(r, Rect::new(2, 2, 3, 3));
    assert_eq!(text(&s, 3, 3), "2");
}

#[test]
fn sort_rows() {
    let mut s = session();
    let data = [("Name", "Score"), ("b", "2"), ("a", "3"), ("c", "1")];
    for (i, (n, v)) in data.iter().enumerate() {
        s.set_input(0, i as i32 + 1, 1, n, true).unwrap();
        s.set_input(0, i as i32 + 1, 2, v, true).unwrap();
        s.set_input(0, i as i32 + 1, 3, &format!("=B{}*10", i + 1), true).unwrap();
    }
    s.sort(0, Rect::new(1, 1, 4, 3), &[SortKey { column: 2, ascending: true }], true).unwrap();
    assert_eq!(text(&s, 1, 1), "Name");
    assert_eq!(text(&s, 2, 1), "c");
    assert_eq!(text(&s, 4, 1), "a");
    // formulas follow their row
    assert_eq!(text(&s, 2, 3), "10");
    assert_eq!(s.cell_info(0, 2, 3).unwrap().content, "=B2*10");
    s.undo().unwrap();
    assert_eq!(text(&s, 2, 1), "b");
}

#[test]
fn remove_duplicates() {
    let mut s = session();
    for (i, v) in ["x", "y", "x", "z", "y"].iter().enumerate() {
        s.set_input(0, i as i32 + 1, 1, v, true).unwrap();
    }
    let (removed, remaining) = s.remove_duplicates(0, Rect::new(1, 1, 5, 1), &[], false).unwrap();
    assert_eq!((removed, remaining), (2, 3));
    assert_eq!(text(&s, 3, 1), "z");
    assert_eq!(text(&s, 4, 1), "");
}

#[test]
fn find_and_replace() {
    let mut s = session();
    s.set_input(0, 1, 1, "Hello World", true).unwrap();
    s.set_input(0, 2, 1, "hello again", true).unwrap();
    let found = s.find(0, "hello", &FindOptions::default()).unwrap();
    assert_eq!(found.len(), 2);
    let n = s.replace(0, "hello", "Bye", &FindOptions::default(), None).unwrap();
    assert_eq!(n, 2);
    assert_eq!(text(&s, 1, 1), "Bye World");
    assert_eq!(text(&s, 2, 1), "Bye again");
    s.undo().unwrap();
    assert_eq!(text(&s, 1, 1), "Hello World");
    assert_eq!(text(&s, 2, 1), "hello again");
}

#[test]
fn borders_and_decimals() {
    let mut s = session();
    s.set_input(0, 1, 1, "3.14159", true).unwrap();
    s.set_borders(0, Rect::new(1, 1, 2, 2), "topBottom", "thin", "#000000").unwrap();
    let st = s.cell_info(0, 1, 1).unwrap().style;
    assert!(st.border_top.is_some());
    s.undo().unwrap();
    assert!(s.cell_info(0, 1, 1).unwrap().style.border_top.is_none());
    s.change_decimals(0, Rect::cell(1, 1), (1, 1), -1).unwrap();
    assert_eq!(text(&s, 1, 1), "3.1416");
}

#[test]
fn conditional_format_and_cells() {
    let mut s = session();
    s.set_input(0, 1, 1, "5", true).unwrap();
    s.set_input(0, 2, 1, "50", true).unwrap();
    s.add_conditional_format(
        0,
        "A1:A2",
        serde_json::json!({"type":"CellIs","operator":"GreaterThan","formula":"10","formula2":null,
            "format":{"fill":{"color":"#FFC7CE"}},"stop_if_true":false}),
    )
    .unwrap();
    let chunk = s.cells(0, Rect::new(1, 1, 10, 5), false).unwrap();
    let a2 = chunk.cells.iter().find(|c| c.0 == 2 && c.1 == 1).unwrap();
    assert_eq!(chunk.styles[a2.4 as usize].fill.as_deref(), Some("#FFC7CE"));
    let a1 = chunk.cells.iter().find(|c| c.0 == 1 && c.1 == 1).unwrap();
    assert_eq!(chunk.styles[a1.4 as usize].fill, None);
}

#[test]
fn sheets() {
    let mut s = session();
    let idx = s.add_sheet(Some(0)).unwrap();
    assert_eq!(idx, 1);
    s.rename_sheet(1, "Data").unwrap();
    assert!(s.rename_sheet(1, "bad/name").is_err());
    s.set_input(1, 1, 1, "7", true).unwrap();
    s.set_input(0, 1, 1, "=Data!A1*2", true).unwrap();
    assert_eq!(text(&s, 1, 1), "14");
    s.duplicate_sheet(1).unwrap();
    assert_eq!(s.info().sheets.len(), 3);
    s.delete_sheet(2).unwrap();
    assert!(s.delete_sheet(0).is_ok());
    assert!(s.delete_sheet(0).is_err());
}

#[test]
fn xlsx_roundtrip() {
    use crate::storage::{FileStore, Location, WorkbookStore};
    let mut s = session();
    s.set_input(0, 1, 1, "Hello", true).unwrap();
    s.set_input(0, 2, 1, "=LEN(A1)", true).unwrap();
    s.merge(0, Rect::new(3, 1, 3, 3), "merge").unwrap();
    s.set_column_width(0, 1, 1, 150.0).unwrap();
    let dir = std::env::temp_dir().join(format!("sheets-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("roundtrip.xlsx");
    let loc = Location::from_path(&path).unwrap();
    FileStore.save(&s, &loc).unwrap();
    // Overwrite works (atomic replace)
    FileStore.save(&s, &loc).unwrap();
    let model = FileStore.load(&loc, &test_config()).unwrap();
    let s2 = Session::new("u".into(), "rt".into(), model, Some(loc));
    assert_eq!(text(&s2, 2, 1), "5");
    assert_eq!(s2.layout(0).unwrap().merges, vec![[3, 1, 3, 3]]);
    let w = s2.layout(0).unwrap().cols;
    assert!(w.iter().any(|c| c.0 == 1 && (c.2 - 150.0).abs() <= 1.0), "{w:?}");
    assert_eq!(s2.info().default_font, "Aptos Narrow");
    let csv = dir.join("out.csv");
    FileStore.save(&s2, &Location::from_path(&csv).unwrap()).unwrap();
    let content = std::fs::read_to_string(&csv).unwrap();
    assert!(content.starts_with("Hello"), "{content}");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn stats_and_edges() {
    let mut s = session();
    for r in 1..=5 {
        s.set_input(0, r, 1, &r.to_string(), true).unwrap();
    }
    s.set_input(0, 6, 1, "text", true).unwrap();
    let st = s.selection_stats(0, Rect::new(1, 1, 10, 1)).unwrap();
    assert_eq!(st.count, 6);
    assert_eq!(st.numeric_count, 5);
    assert_eq!(st.sum, 15.0);
    assert_eq!(s.navigate_edge(0, 1, 1, "down").unwrap(), (6, 1));
}

#[test]
fn autofill_series() {
    let mut s = session();
    s.set_input(0, 1, 1, "1", true).unwrap();
    s.set_input(0, 2, 1, "2", true).unwrap();
    s.auto_fill(0, Rect::new(1, 1, 2, 1), Rect::new(1, 1, 5, 1)).unwrap();
    assert_eq!(text(&s, 5, 1), "5");
    s.set_input(0, 1, 2, "Mon", true).unwrap();
    s.set_input(0, 2, 2, "Tue", true).unwrap();
    s.auto_fill(0, Rect::new(1, 2, 2, 2), Rect::new(1, 2, 3, 2)).unwrap();
    assert_eq!(text(&s, 3, 2), "Wed");
}

#[test]
fn table_style_and_range_input() {
    let mut s = session();
    let header = StylePatch { bold: Some(true), fill: Some("#4472C4".into()), ..Default::default() };
    let odd = StylePatch { fill: Some("#D9E1F2".into()), ..Default::default() };
    let even = StylePatch { fill: Some("".into()), ..Default::default() };
    s.format_as_table(0, Rect::new(1, 1, 4, 2), &header, &odd, &even, true).unwrap();
    assert!(s.cell_info(0, 1, 1).unwrap().style.bold);
    assert_eq!(s.cell_info(0, 2, 2).unwrap().style.fill.as_deref(), Some("#D9E1F2"));
    assert_eq!(s.cell_info(0, 3, 2).unwrap().style.fill, None);
    s.set_range_input(0, Rect::new(1, 4, 3, 4), "=ROW()", true).unwrap();
    assert_eq!(text(&s, 3, 4), "3");
}

#[test]
fn typed_dates_and_currency() {
    let mut s = session();
    s.set_input(0, 1, 1, "28-09-2026", true).unwrap();
    assert_eq!(text(&s, 1, 1), "28-09-2026");
    assert_eq!(s.cell_info(0, 1, 1).unwrap().kind & 7, super::dto::kind::NUMBER);
    s.set_input(0, 2, 1, "=A1+1", true).unwrap();
    assert_eq!(text(&s, 2, 1), "29-09-2026");
    s.set_input(0, 3, 1, "₹1,200", true).unwrap();
    assert_eq!(text(&s, 3, 1), "₹1,200");
    s.undo().unwrap();
    assert_eq!(text(&s, 3, 1), "");
}

#[test]
fn region_and_shift_cells() {
    let mut s = session();
    for r in 2..=4 {
        for c in 2..=3 {
            s.set_input(0, r, c, &format!("{}", r * 10 + c), true).unwrap();
        }
    }
    s.set_input(0, 5, 4, "=B4", true).unwrap();
    assert_eq!(s.current_region(0, 3, 3).unwrap(), Rect::new(2, 2, 5, 4));
    s.insert_cells(0, Rect::new(2, 2, 2, 3), "down").unwrap();
    assert_eq!(text(&s, 2, 2), "");
    assert_eq!(text(&s, 3, 2), "22");
    assert_eq!(text(&s, 5, 2), "42");
    // Reference follows the moved cell
    assert_eq!(s.cell_info(0, 5, 4).unwrap().content, "=B5");
    s.undo().unwrap();
    assert_eq!(text(&s, 2, 2), "22");
    s.delete_cells(0, Rect::new(2, 2, 2, 2), "up").unwrap();
    assert_eq!(text(&s, 2, 2), "32");
    assert_eq!(text(&s, 4, 2), "");
}

#[test]
fn red_negative_numbers() {
    let mut s = session();
    s.set_input(0, 1, 1, "-5", true).unwrap();
    s.apply_style(0, Rect::cell(1, 1), &StylePatch { num_fmt: Some("#,##0;[Red]-#,##0".into()), ..Default::default() }).unwrap();
    let chunk = s.cells(0, Rect::new(1, 1, 5, 5), false).unwrap();
    let a1 = chunk.cells.iter().find(|c| c.0 == 1 && c.1 == 1).unwrap();
    assert_eq!(chunk.styles[a1.4 as usize].color.as_deref(), Some("#FF0000"));
    assert_eq!(super::format_preview(1234.5, "#,##0.00"), "1,234.50");
}

/// Performance smoke test: `cargo test --release --lib perf_large_sheet -- --ignored --nocapture`
#[test]
#[ignore]
fn perf_large_sheet() {
    use crate::storage::{FileStore, Location, WorkbookStore};
    use std::time::Instant;
    let rows = 50_000;
    let mut csv = String::new();
    for r in 1..=rows {
        csv.push_str(&format!("Item {r},{},{},{},North,{},x{},y,z,{}\n", r * 3 % 997, r % 13, (r * 7) % 101, r % 5, r, r as f64 / 3.0));
    }
    let dir = std::env::temp_dir().join(format!("sheets-perf-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("big.csv");
    std::fs::write(&path, csv).unwrap();
    let loc = Location::from_path(&path).unwrap();
    let t = Instant::now();
    let model = FileStore.load(&loc, &test_config()).unwrap();
    let mut s = Session::new("p".into(), "big".into(), model, Some(loc));
    println!("load 50k x 10 csv: {:?}", t.elapsed());
    let t = Instant::now();
    let chunk = s.cells(0, Rect::new(1, 1, 100, 40), false).unwrap();
    println!("viewport top (100x40, {} cells): {:?}", chunk.cells.len(), t.elapsed());
    let t = Instant::now();
    let chunk = s.cells(0, Rect::new(25_000, 1, 25_100, 40), false).unwrap();
    println!("viewport middle ({} cells): {:?}", chunk.cells.len(), t.elapsed());
    let t = Instant::now();
    s.set_input(0, 1, 12, "=SUM(B1:B50000)", true).unwrap();
    println!("edit + full recalc: {:?}", t.elapsed());
    let t = Instant::now();
    s.set_input(0, 2, 12, "5", true).unwrap();
    println!("second edit + recalc: {:?}", t.elapsed());
    let t = Instant::now();
    let _ = s.layout(0).unwrap();
    println!("layout: {:?}", t.elapsed());
    let t = Instant::now();
    let st = s.selection_stats(0, Rect::new(1, 2, super::a1::LAST_ROW, 2)).unwrap();
    println!("stats full column ({}): {:?}", st.count, t.elapsed());
    let t = Instant::now();
    s.sort(0, Rect::new(1, 1, rows, 10), &[SortKey { column: 2, ascending: true }], false).unwrap();
    println!("sort 50k rows: {:?}", t.elapsed());
    let t = Instant::now();
    s.undo().unwrap();
    println!("undo sort: {:?}", t.elapsed());
    let _ = std::fs::remove_dir_all(&dir);
}
