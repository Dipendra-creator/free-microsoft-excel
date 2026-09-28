# Sheets roadmap

**Goal:** a spreadsheet that opens and saves the same `.xlsx` files as Microsoft
Excel, covers everything most people use Excel for, and is *more reliable*:
it never silently changes your data, never loses your work, and points out
spreadsheet mistakes before they cost you. See
[EXCEL_PAIN_POINTS.md](EXCEL_PAIN_POINTS.md) for the problems this plan is built
around.

Legend: ✅ available · 🟡 partial · 🗺️ planned (target release in brackets)

---

## Guiding principles

1. **Your data is sacred.** No silent conversions, truncation or rounding.
   When Sheets must change something, it tells you.
2. **Work is never lost.** AutoRecover, unsaved-workbook recovery, version
   history and crash-safe saves are on by default.
3. **Excel-compatible files.** `.xlsx` in, `.xlsx` out. Features Excel can't
   store natively are kept in a hidden part of the same file, never in a
   side-car file.
4. **Small and fast.** A few megabytes to download, a compiled Rust engine,
   a virtualised grid.
5. **Same app on Windows and macOS.** One code base, one feature set.

---

## Feature parity with Excel

### Files and reliability

| Feature | Status |
| --- | --- |
| Open/save `.xlsx`; open `.xlsm` (macros are not run; saved as an `.xlsx` copy, the original is never overwritten) | ✅ |
| Open/save CSV, TSV/TXT with delimiter + encoding detection | ✅ |
| Legacy `.xls` | 🗺️ read-only import (0.6) |
| `.ods` (LibreOffice) | 🗺️ (0.7) |
| Export as PDF (via Print → Save as PDF) | ✅ |
| Direct "Export to PDF" without the print dialog | 🗺️ (0.6) |
| AutoRecover every 10 s – 5 min, crash recovery on start | ✅ |
| Recover Unsaved Workbooks (7 days) | ✅ |
| Local version history for every saved file | ✅ |
| Crash-safe atomic saves with `fsync` | ✅ |
| Templates (built-in) | ✅ |
| Recent / pinned files, drag & drop files to open | ✅ |
| Single instance: opening a file reuses the running app | ✅ |
| In-app updates: title-bar Update button, signed downloads, unsaved work kept across the restart | ✅ |

### Editing

| Feature | Status |
| --- | --- |
| In-cell and formula-bar editing, point mode, F4 absolute references | ✅ |
| Function autocomplete and argument hints | ✅ |
| Unlimited undo/redo, one step per user action | ✅ |
| Copy/cut/paste, Paste Special (values, formulas, formats, operations, skip blanks, transpose, paste link) | ✅ |
| Fill handle with AutoFill Options (copy / series / formats / days / months…), Ctrl+drag, double-click fill, Series dialog, Ctrl+D / Ctrl+R, Ctrl+Enter | ✅ |
| Find & Replace (sheet or workbook), Go To | ✅ |
| Go To Special (blanks, formulas, constants…) | 🗺️ (0.5) |
| Flash Fill (Ctrl+E) | ✅ |
| AutoComplete and Alt+↓ pick list | ✅ |
| Excel keyboard shortcuts and KeyTips (Alt / F10) | ✅ |
| Data validation (dropdown lists, number/date rules) | 🗺️ (0.5) |
| Spell check | 🗺️ (0.6) |

### Formatting

| Feature | Status |
| --- | --- |
| Fonts, colours, fills, borders, alignment, wrap, merge | ✅ |
| Number formats + Format Cells dialog | ✅ |
| Cell styles, Format as Table gallery | ✅ |
| Conditional formatting (rules, top/bottom, data bars, colour scales, icon sets) | ✅ |
| Indent and text rotation | 🗺️ (0.6, needs engine support) |
| Themes | 🗺️ (0.6) |

### Formulas

| Feature | Status |
| --- | --- |
| ~490 Excel functions incl. dynamic arrays, XLOOKUP, LET | ✅ (IronCalc) |
| Defined names / Name Manager | ✅ |
| Show formulas, Calculate Now | ✅ |
| **Check Workbook** (errors, inconsistent formulas, totals that skip numbers, numbers as text, hidden data, volatile functions) | ✅ *(Sheets only)* |
| Trace precedents / dependents arrows, Evaluate Formula | 🗺️ (0.6) |
| `HYPERLINK()` function | 🗺️ (0.5, engine) |
| Goal Seek, Data Tables, Solver | 🗺️ (0.7) |
| Macros / VBA | ❌ not planned — a safer scripting option may come later |

### Data

| Feature | Status |
| --- | --- |
| Sort (quick and multi-level) | ✅ |
| AutoFilter with value list, search, sort, clear, reapply | ✅ |
| Number / date / text filter conditions (greater than, contains, top 10…) | 🗺️ (0.5) |
| Remove Duplicates | ✅ |
| Text to Columns (delimited) | ✅ |
| Text to Columns (fixed width) | 🗺️ (0.5) |
| PivotTable (formula-based, live values) | ✅ |
| Refreshable PivotTables with drag-and-drop fields | 🗺️ (0.7) |
| Freeze panes, hide/unhide, group/outline | ✅ / ✅ / 🗺️ (0.6) |
| Import from database / web / JSON | 🗺️ (1.0, via the `WorkbookStore` / `SyncBackend` extension points) |

### Charts and objects

| Feature | Status |
| --- | --- |
| Column, bar, line, area, pie, doughnut, scatter charts | ✅ |
| Charts follow data edits, skip filtered rows, move/resize, saved in the file | ✅ |
| Charts visible in Excel (DrawingML export) | 🗺️ (0.6) |
| Stacked / combo / secondary-axis charts, sparklines | 🗺️ (0.6) |
| Pictures, shapes, text boxes | 🗺️ (0.6) |

### Review and collaboration

| Feature | Status |
| --- | --- |
| Cell notes (Excel comments are imported) | ✅ |
| Notes visible in Excel (xlsx comment export) | 🗺️ (0.5) |
| Links in cells (Ctrl+click to open) | ✅ |
| Workbook statistics | ✅ |
| Protect sheet / workbook | 🗺️ (0.5) |
| Co-authoring and cloud sync | 🗺️ (1.0 — hooks already in `sync::SyncBackend`) |

### View, print and platform

| Feature | Status |
| --- | --- |
| Zoom, gridlines, headings, formula bar, collapsible ribbon | ✅ |
| Command search (Alt+Q) | ✅ |
| Print active sheet / selection / workbook, orientation, fit to width, gridlines, headings | ✅ |
| Margins, headers/footers, print area, page break preview | 🗺️ (0.6) |
| Multiple windows, Switch Windows | ✅ |
| Dark and light themes | ✅ |
| Windows 10/11 (x64) | ✅ |
| macOS 10.15+ (Apple Silicon and Intel) | ✅ |
| Linux (AppImage / .deb) | 🗺️ (0.5) |
| Code signing (Windows) and notarization (macOS) | 🗺️ (1.0) |
| Localisation (UI languages, locale-aware number parsing) | 🗺️ (1.0) |

---

## Release plan

### 0.4 — "Always current" (current)
In-app updates with signed downloads; unsaved work survives the update restart.

### 0.3 — "Excel muscle memory"
AutoFill Options, series and date fills, Flash Fill, Paste Special with
operations and transpose, KeyTips, the full Excel keyboard shortcut set,
AutoComplete and pick lists.

### 0.2 — "Never lose data"
AutoRecover, unsaved-workbook recovery, version history, data-integrity guards,
encoding-aware CSV, AutoFilter, charts, notes, links, Text to Columns,
PivotTable summaries, Check Workbook, printing / PDF, macOS support.

### 0.5 — "Data tools"
Data validation with dropdown lists, advanced filter conditions, Go To Special,
fixed-width Text to Columns, notes exported as real Excel comments, sheet
protection, Linux packages, warnings when a paste would run past the sheet edge.

### 0.6 — "Presentation"
Charts saved as native Excel charts, more chart types, pictures and shapes,
page setup (margins, headers/footers, print area), direct PDF export,
indent/rotation, themes, outline/grouping, formula auditing arrows, spell check.

### 0.7 — "Analysis"
Refreshable PivotTables, Goal Seek, Data Tables, Solver, `.ods`.

### 1.0 — "Connected"
Code-signed and notarized builds, database-backed workbooks,
co-authoring, localisation.

---

Suggestions are welcome — open an issue on GitHub.
