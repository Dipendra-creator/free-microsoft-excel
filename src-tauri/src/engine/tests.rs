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
    FileStore.save(&s, &loc, &test_config()).unwrap();
    // Overwrite works (atomic replace)
    FileStore.save(&s, &loc, &test_config()).unwrap();
    let model = FileStore.load(&loc, &test_config()).unwrap();
    let s2 = Session::new("u".into(), "rt".into(), model, Some(loc));
    assert_eq!(text(&s2, 2, 1), "5");
    assert_eq!(s2.layout(0).unwrap().merges, vec![[3, 1, 3, 3]]);
    let w = s2.layout(0).unwrap().cols;
    assert!(w.iter().any(|c| c.0 == 1 && (c.2 - 150.0).abs() <= 1.0), "{w:?}");
    assert_eq!(s2.info().default_font, "Aptos Narrow");
    let csv = dir.join("out.csv");
    FileStore.save(&s2, &Location::from_path(&csv).unwrap(), &test_config()).unwrap();
    let content = std::fs::read_to_string(&csv).unwrap();
    assert!(content.starts_with("\u{feff}Hello"), "{content}");
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

// ----------------------------------------------------------------------
// Data integrity, notes, charts, filters, data tools, health check
// ----------------------------------------------------------------------

#[test]
fn leading_zeros_and_long_numbers_are_preserved() {
    let mut s = session();
    s.set_input(0, 1, 1, "00501", true).unwrap();
    s.set_input(0, 2, 1, "4111222233334444", true).unwrap();
    s.set_input(0, 3, 1, "42", true).unwrap();
    assert_eq!(text(&s, 1, 1), "00501");
    assert_eq!(text(&s, 2, 1), "4111222233334444");
    assert_eq!(s.cell_info(0, 3, 1).unwrap().kind & 7, super::dto::kind::NUMBER);
    // Opt-out behaves like Excel
    s.preserve_literals = false;
    s.set_input(0, 4, 1, "00501", true).unwrap();
    assert_eq!(text(&s, 4, 1), "501");
}

#[test]
fn ragged_pasted_text_keeps_every_row() {
    let mut s = session();
    let rect = s.paste_text(0, Rect::cell(1, 1), "a\tb\tc\nd\ne\tf\n00123\t7").unwrap();
    assert_eq!(rect, Rect::new(1, 1, 4, 3));
    assert_eq!(text(&s, 2, 1), "d");
    assert_eq!(text(&s, 3, 2), "f");
    assert_eq!(text(&s, 4, 1), "00123");
    assert_eq!(text(&s, 4, 2), "7");
}

#[test]
fn notes_shift_undo_and_roundtrip() {
    use crate::storage::{FileStore, Location, WorkbookStore};
    let mut s = session();
    s.set_note(0, 2, 2, "Check this", "Ana").unwrap();
    s.insert_rows(0, 1, 1).unwrap();
    assert!(s.note_at(0, 3, 2).is_some());
    s.undo().unwrap();
    assert!(s.note_at(0, 2, 2).is_some());
    assert_eq!(s.layout(0).unwrap().notes, vec![[2, 2]]);
    s.save_chart(
        0,
        super::extras::ChartSpec { kind: "line".into(), range: Rect::new(1, 1, 5, 2), title: "Trend".into(), ..Default::default() },
    )
    .unwrap();
    s.set_input(0, 1, 1, "h", true).unwrap();
    s.toggle_filter(0, Rect::cell(1, 1)).unwrap();

    let dir = std::env::temp_dir().join(format!("sheets-meta-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let loc = Location::from_path(dir.join("meta.xlsx")).unwrap();
    FileStore.save(&s, &loc, &test_config()).unwrap();
    let model = FileStore.load(&loc, &test_config()).unwrap();
    let s2 = Session::new("m".into(), "meta".into(), model, Some(loc));
    // The metadata sheet never shows up
    assert_eq!(s2.info().sheets.len(), 1);
    assert_eq!(s2.note_at(0, 2, 2).unwrap().text, "Check this");
    assert_eq!(s2.charts(0)[0].title, "Trend");
    assert!(s2.layout(0).unwrap().filter.is_some());
    let _ = std::fs::remove_dir_all(&dir);
}

fn fruit_table(s: &mut Session) {
    let rows = [
        ["Fruit", "Region", "Amount"],
        ["Apple", "North", "10"],
        ["Pear", "South", "20"],
        ["Apple", "South", "5"],
        ["Plum", "North", "7"],
        ["Pear", "North", "1"],
    ];
    for (r, line) in rows.iter().enumerate() {
        for (c, v) in line.iter().enumerate() {
            s.set_input(0, r as i32 + 1, c as i32 + 1, v, true).unwrap();
        }
    }
}

#[test]
fn autofilter_hides_rows_and_undoes() {
    let mut s = session();
    fruit_table(&mut s);
    assert!(s.toggle_filter(0, Rect::cell(2, 2)).unwrap());
    let values = s.filter_values(0, 1).unwrap();
    assert_eq!(values.iter().map(|v| (v.text.as_str(), v.count)).collect::<Vec<_>>(), vec![("Apple", 2), ("Pear", 2), ("Plum", 1)]);
    s.set_filter(0, 1, Some(vec!["Apple".into()])).unwrap();
    let hidden = |s: &Session, r: i32| s.layout(0).unwrap().rows.iter().any(|(row, px)| *row == r && *px == 0.0);
    assert!(!hidden(&s, 2));
    assert!(hidden(&s, 3));
    assert!(hidden(&s, 6));
    assert_eq!(s.layout(0).unwrap().filter.unwrap().active, vec![1]);
    // Data appended below the filter joins it
    s.set_input(0, 7, 1, "Kiwi", true).unwrap();
    s.reapply_filter(0).unwrap();
    assert!(hidden(&s, 7));
    s.undo().unwrap();
    s.undo().unwrap();
    s.undo().unwrap();
    assert!(!hidden(&s, 3));
    // Sorting from the filter menu is one undo step
    s.set_filter(0, 2, Some(vec!["North".into()])).unwrap();
    let before = text(&s, 2, 3);
    s.sort_filter(0, 3, false).unwrap();
    assert_eq!(text(&s, 2, 3), "20");
    s.undo().unwrap();
    assert_eq!(text(&s, 2, 3), before);
    // Turning the filter off shows everything again
    assert!(!s.toggle_filter(0, Rect::cell(1, 1)).unwrap());
    assert!(!hidden(&s, 3));
}

#[test]
fn text_to_columns_splits_and_protects() {
    let mut s = session();
    s.set_input(0, 1, 1, "Smith,John,00042,12.5", true).unwrap();
    s.set_input(0, 2, 1, "\"Doe, Jr\",Jane", true).unwrap();
    let opts = super::SplitOptions { delimiters: ",".into(), consecutive: false, qualifier: "\"".into() };
    let written = s.text_to_columns(0, Rect::new(1, 1, 2, 1), &opts, true).unwrap();
    assert_eq!(written, Rect::new(1, 1, 2, 4));
    assert_eq!(text(&s, 1, 2), "John");
    assert_eq!(text(&s, 1, 3), "00042");
    assert_eq!(s.cell_info(0, 1, 4).unwrap().kind & 7, super::dto::kind::NUMBER);
    assert_eq!(text(&s, 2, 1), "Doe, Jr");
    s.undo().unwrap();
    assert_eq!(text(&s, 1, 1), "Smith,John,00042,12.5");
}

#[test]
fn pivot_summarises_with_live_formulas() {
    let mut s = session();
    fruit_table(&mut s);
    let spec = super::PivotSpec { source: Rect::new(1, 1, 6, 3), rows_col: 1, cols_col: Some(2), value_col: Some(3), func: "sum".into() };
    let index = s.create_pivot(0, &spec).unwrap();
    let t = |s: &Session, r: i32, c: i32| s.cell_info(index, r, c).unwrap().formatted;
    // Header row 3: Fruit | North | South | Grand Total
    assert_eq!(t(&s, 3, 2), "North");
    assert_eq!(t(&s, 4, 1), "Apple");
    assert_eq!(t(&s, 4, 2), "10");
    assert_eq!(t(&s, 4, 3), "5");
    assert_eq!(t(&s, 4, 4), "15");
    assert_eq!(t(&s, 7, 4), "43");
    // Header row is highlighted across the whole table
    for c in 1..=4 {
        assert!(s.cell_info(index, 3, c).unwrap().style.fill.is_some(), "no fill in column {c}");
    }
    // Live: changing the source updates the summary
    s.set_input(0, 2, 3, "100", true).unwrap();
    assert_eq!(t(&s, 4, 2), "100");
    // One undo step removes the whole pivot sheet
    s.undo().unwrap();
    s.undo().unwrap();
    assert_eq!(s.info().sheets.len(), 1);
}

#[test]
fn health_check_finds_classic_mistakes() {
    let mut s = session();
    for (r, v) in ["10", "20", "30", "40"].iter().enumerate() {
        s.set_input(0, r as i32 + 1, 1, v, true).unwrap();
    }
    // Total that skips A4 (Reinhart-Rogoff style)
    s.set_input(0, 5, 1, "=SUM(A1:A3)", true).unwrap();
    s.set_input(0, 1, 3, "=1/0", true).unwrap();
    s.set_input(0, 1, 5, "'123", true).unwrap();
    s.set_input(0, 2, 5, "=\"4\"&\"5\"", true).unwrap();
    // B1:B3 follow =A*2, B2 breaks the pattern
    s.set_input(0, 1, 2, "=A1*2", true).unwrap();
    s.set_input(0, 2, 2, "=A2*3", true).unwrap();
    s.set_input(0, 3, 2, "=A3*2", true).unwrap();
    let report = s.health_check().unwrap();
    let kinds: Vec<(&str, i32, i32)> = report.issues.iter().map(|i| (i.kind, i.row, i.col)).collect();
    assert!(kinds.contains(&("omitsAdjacent", 5, 1)), "{kinds:?}");
    assert!(kinds.contains(&("error", 1, 3)), "{kinds:?}");
    assert!(kinds.contains(&("inconsistent", 2, 2)), "{kinds:?}");
    // Quote-prefixed text is intentional: not reported
    assert!(!kinds.iter().any(|k| k.0 == "numberAsText" && k.1 == 1), "{kinds:?}");
}

#[test]
fn csv_encodings_and_export_precision() {
    use crate::storage::{FileStore, Location, WorkbookStore};
    let dir = std::env::temp_dir().join(format!("sheets-csv-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    // Windows-1252 "café" and a zip code
    let latin = dir.join("latin.csv");
    std::fs::write(&latin, b"name;zip\ncaf\xe9;00501\n").unwrap();
    let loc = Location::from_path(&latin).unwrap();
    let s = Session::new("c".into(), "latin".into(), FileStore.load(&loc, &test_config()).unwrap(), Some(loc));
    assert_eq!(text(&s, 2, 1), "café");
    assert_eq!(text(&s, 2, 2), "00501");
    // UTF-16 LE with BOM
    let utf16 = dir.join("wide.csv");
    let mut bytes = vec![0xFF, 0xFE];
    for u in "a,β\n1,2\n".encode_utf16() {
        bytes.extend_from_slice(&u.to_le_bytes());
    }
    std::fs::write(&utf16, bytes).unwrap();
    let loc = Location::from_path(&utf16).unwrap();
    let s = Session::new("w".into(), "wide".into(), FileStore.load(&loc, &test_config()).unwrap(), Some(loc));
    assert_eq!(text(&s, 1, 2), "β");
    // Export keeps full precision when the display format rounds
    let mut s = session();
    s.set_input(0, 1, 1, "1.23456", true).unwrap();
    s.apply_style(0, Rect::cell(1, 1), &StylePatch { num_fmt: Some("0.00".into()), ..Default::default() }).unwrap();
    s.set_input(0, 1, 2, "$1,200.00", true).unwrap();
    let out = dir.join("out.csv");
    FileStore.save(&s, &Location::from_path(&out).unwrap(), &test_config()).unwrap();
    let content = std::fs::read_to_string(&out).unwrap();
    assert!(content.contains("1.23456"), "{content}");
    assert!(content.contains("\"$1,200.00\""), "{content}");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn pivot_without_column_field() {
    let mut s = session();
    fruit_table(&mut s);
    let spec = super::PivotSpec { source: Rect::new(1, 1, 6, 3), rows_col: 1, cols_col: None, value_col: Some(3), func: "sum".into() };
    let index = s.create_pivot(0, &spec).unwrap();
    let t = |s: &Session, r: i32, c: i32| s.cell_info(index, r, c).unwrap().formatted;
    assert_eq!(t(&s, 3, 2), "Grand Total");
    assert_eq!(t(&s, 5, 2), "21");
    assert_eq!(t(&s, 7, 2), "43");
    for c in 1..=2 {
        assert!(s.cell_info(index, 3, c).unwrap().style.fill.is_some(), "no fill in column {c}");
    }
}

#[test]
fn macro_workbooks_are_never_overwritten() {
    use crate::storage::Location;
    assert!(Location::for_save("/tmp/book.xlsm").is_err());
    assert!(Location::for_save("/tmp/book.xlsx").is_ok());
    assert!(Location::from_path("/tmp/book.xlsm").unwrap().is_macro_enabled());
}
