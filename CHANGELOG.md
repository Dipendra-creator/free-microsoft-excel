# Changelog

All notable changes to Sheets. Versions follow [Semantic Versioning](https://semver.org).

## [0.4.0] — 2026-09-28

### In-app updates
- Sheets checks for a new version shortly after it starts and every 6 hours.
  When one is out, an **Update available** button appears in the title bar of
  every window, with the release notes one click away.
- **Update now** downloads the update in the background (progress shows in the
  button) and verifies its signature; **Restart to update** installs it.
  Workbooks with unsaved changes are kept and offered again on the start
  screen right after the restart.
- After an update the title bar says **Updated to x.y.z** once, with a link to
  what's new.
- Help → **Check for Updates**, File → Account → **Sheets Updates**, and
  Options → *Check for new versions automatically* (on by default).
- Releases without signed update files are still announced; the button then
  opens the download page.
- Release pipeline: signs the Windows and macOS update files with the project's
  update key and publishes `latest.json` with each release.

Note: Sheets 0.3.0 and earlier have no updater — install 0.4.0 once from the
Releases page; later versions then update themselves.

## [0.3.0] — 2026-09-28

### AutoFill
- **AutoFill Options** button after a fill-handle fill: Copy Cells, Fill Series,
  Fill Formatting Only, Fill Without Formatting, Fill Days / Weekdays / Months /
  Years (for dates) and Flash Fill. Switching is a single undo step.
- New fill engine with Excel's rules: a single number is copied, Ctrl+drag or
  Fill Series counts up; two or more numbers continue their best-fit line;
  dates (including month-end dates), `Item 1`, zero-padded `ID-007`, ordinals
  (`1st`), quarters (`Q1`–`Q4`), month and day names continue; formulas adjust;
  filling up or left counts down; dragging back inside the selection clears it.
- Double-click the fill handle to fill to the end of the adjacent data.
- Home → Fill → **Series…** (linear, growth, date by day/weekday/month/year,
  step, stop value, trend). Ctrl+D / Ctrl+R copy exactly, like Excel.
- **Flash Fill** (Ctrl+E, Data → Flash Fill): learns a text transformation from
  one or two examples and fills the column.

### Paste
- **Paste Special** dialog (Ctrl+Alt+V): all, formulas, values, formats, all
  except borders, column widths, formulas/values with number formats; Add,
  Subtract, Multiply, Divide; Skip blanks; Transpose (references inside the
  copied block follow it); Paste Link.
- Paste menu: Transpose, No Borders, Keep Source Column Widths, Values & Number
  Formatting, Values & Source Formatting, Paste Link. Ctrl+Shift+V pastes values.

### Keyboard
- **KeyTips** (Alt or F10) for ribbon tabs and commands, using Excel's letters.
- Ctrl+A selects the data region, then the sheet; Ctrl+Shift+Space, Ctrl+Shift+*,
  End mode, F8 Extend Selection, Shift+Backspace, Ctrl+Backspace, Ctrl+. ,
  Ctrl+' and Ctrl+Shift+", F4 / Ctrl+Y repeat, Cmd+Shift+Z redo on the Mac,
  Ctrl+[ go to precedents, Shift+F4 / Ctrl+Shift+F4 find next / previous,
  F3 Paste Name, Ctrl+F3 Name Manager, Ctrl+Shift+F3 Create Names from
  Selection, Ctrl+Shift+F / P font settings, Ctrl+Shift+~ General format,
  Ctrl+Shift+( and ) unhide, Ctrl+Tab / Ctrl+F6 next window, Ctrl+Alt+= / -
  zoom, F11 chart, Alt+Shift+F1 new sheet, Shift+F10 / Menu key context menu,
  F1 shortcut reference. While editing: Ctrl+Shift+A argument names,
  Ctrl+Delete, Ctrl+Shift+Enter.
- **AutoComplete** for text entries from the same column and **Alt+↓** pick list.
- Searchable Keyboard Shortcuts reference (F1, Help tab).

### Fixed
- Ctrl+Shift+U toggled underline instead of expanding the formula bar.
- Ctrl+Shift+~ showed formulas instead of applying the General format.
- Ctrl+Shift+( / ) did not unhide on US keyboard layouts.

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
- CSV/TXT files larger than a worksheet (1,048,576 rows × 16,384 columns) are no
  longer truncated silently: Sheets says what didn't fit and never overwrites
  the original file.

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
