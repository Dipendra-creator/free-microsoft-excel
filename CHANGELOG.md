# Changelog

All notable changes to Sheets. Versions follow [Semantic Versioning](https://semver.org).

## [0.2.0] — 2026-09-28

### Reliability
- **AutoRecover**: every changed workbook — including never-saved ones — is
  snapshotted in the background (30 s by default, configurable 10 s – 5 min).
  After an abnormal exit the start screen shows **Document Recovery**; recovered
  files stay protected until saved.
- **Recover Unsaved Workbooks**: closing without saving keeps the last state for
  7 days (File → Open).
- **Version history**: each save keeps the previous file (20 per file by
  default); File → Info → Version History opens any of them.
- Saves are flushed to disk (`fsync`) before atomically replacing the file.
- Macro-enabled workbooks (`.xlsm`) are never overwritten: saving writes an
  `.xlsx` copy (previously the macros were dropped and Excel could no longer
  open the saved file).

### Data integrity
- Leading zeros (`00501`) and integers longer than 15 digits are kept as text
  when typing, pasting, importing CSV and using Text to Columns.
- CSV/TXT import detects UTF-8 (with/without BOM), UTF-16 LE/BE and
  Windows-1252.
- CSV/TXT export writes a UTF-8 BOM (Excel compatibility) and never rounds
  numbers to their display format.
- Fixed: pasting text whose rows have different numbers of columns dropped rows.

### New features
- AutoFilter (Ctrl+Shift+L): value checklist with counts, search, sort, clear,
  reapply; filtered row numbers shown in blue; data added below joins the filter.
- Charts (Alt+F1 / Insert → Charts): column, bar, line, area, pie, doughnut,
  scatter. Live updates, skip filtered rows, move/resize, edit dialog, saved in
  the `.xlsx`.
- Review → **Check Workbook**: formula errors, inconsistent formulas, totals
  that skip adjacent numbers, numbers stored as text, hidden sheets/rows/columns,
  volatile functions.
- PivotTable summaries on a new sheet, built from live SUMIFS/COUNTIFS/
  AVERAGEIFS/MINIFS/MAXIFS formulas (one undo step).
- Text to Columns with live preview.
- Cell notes (Shift+F2), Show All Notes, next/previous note; Excel comments are
  imported as notes.
- Links: Ctrl+K inserts, Ctrl+click (⌘+click) opens web and mail links.
- Print / Save as PDF (Ctrl+P): active sheet, selection or workbook; orientation,
  fit to width, gridlines, headings; charts included.
- View → Switch Windows; Esc closes the File menu.
- Options: data-integrity, CSV BOM, AutoRecover interval, versions to keep.

### Platforms
- **macOS** (Apple Silicon and Intel): native traffic-light window buttons,
  ⌘ shortcuts, opening files from Finder and the Dock.
- Windows: NSIS installer, MSI package and portable executable.
- Opening a file while Sheets is running hands it to the running app.
- GitHub Actions CI and release pipeline.

## [0.1.0]

First version: Excel-style start screen and workbook window (ribbon, formula bar,
canvas grid, sheet tabs, status bar), IronCalc engine with ~490 functions,
formatting, conditional formatting, sort, remove duplicates, find/replace,
names, templates, `.xlsx`/`.csv` read and write.
