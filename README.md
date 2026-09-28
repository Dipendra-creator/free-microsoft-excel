# Sheets

A lightweight, Excel-style spreadsheet desktop app for internal use, built with **Rust + Tauri 2** and a **React/TypeScript** UI.
The spreadsheet engine is [IronCalc](https://github.com/ironcalc/IronCalc) (Rust): ~490 Excel functions, number formats,
conditional formatting and native `.xlsx` read/write.

MVP scope: two screens that mirror Excel — the **Start / backstage screen** (new from blank or template, recent & pinned
files, open) and the **workbook view** (ribbon, formula bar, grid, sheet tabs, status bar).

## Download (Windows x64)

Prebuilt binaries of v0.1.0 are in [`builds/windows-x64`](builds/windows-x64):

- `Sheets_0.1.0_x64-setup.exe` — installer (per-user, adds Start menu entry and `.xlsx`/`.csv` associations)
- `Sheets-portable.exe` — single executable, no install needed (requires WebView2, preinstalled on Windows 10/11)

## Run it

Prerequisites: Rust (stable, MSVC toolchain on Windows), Node 20+, pnpm, WebView2 (preinstalled on Windows 11).

```bash
pnpm install
pnpm tauri dev          # development (hot reload for the UI)
pnpm tauri build        # release build + installers (NSIS/MSI) in src-tauri/target/release/bundle
```

Tests:

```bash
cd src-tauri
cargo test --lib                                                     # engine, storage, templates (29 tests)
cargo test --release --lib perf_large_sheet -- --ignored --nocapture  # performance smoke test
cd .. && pnpm typecheck                                              # TypeScript
```

## Architecture

```
src-tauri/src
├── engine/        Session = one open workbook on top of IronCalc's UserModel
│   ├── session.rs   edits, styles, merges, sort, find/replace, clipboard, grouped undo/redo
│   ├── dto.rs       screen-ready DTOs (Excel pixels, resolved colours, style tables)
│   ├── input.rs     Excel-like typed input (dates, times, currency) by locale
│   ├── merges.rs    merged cells (shifted on row/column insert/delete)
│   └── styling.rs   style patches, borders, decimal changes
├── storage/       WorkbookStore trait + FileStore (.xlsx, .csv/.tsv), atomic saves
├── templates/     TemplateProvider trait + BuiltinTemplates (10 templates, previews)
├── sync/          SyncBackend trait (change stream hook) + LocalOnly default
├── commands/      Tauri IPC surface (thin wrappers)
├── state.rs       sessions, window ↔ workbook binding, clipboard, settings, recent files
└── recent.rs, settings.rs

src
├── api/           typed wrappers for every command (the only place that calls invoke)
├── workbook/      WorkbookController (state + behaviour), canvas grid renderer,
│                  ribbon tabs, formula bar, sheet tabs, status bar, dialogs
├── backstage/     start screen / File menu pages
├── components/    icons, menus, popups, dialogs, colour picker
└── lib/           A1 helpers, formula tokenizer, function catalogue, formats, galleries
```

Key design points:

- **Rust owns the data.** The UI never holds workbook state beyond a cache of the visible cells. Every edit is a
  command; the backend returns `WorkbookInfo` and the UI refetches only the visible window (≈1–2 ms per fetch).
- **Canvas grid.** Virtualised rendering with frozen panes, merges, text overflow, wrap, borders, data bars/icons,
  drawn in device pixels so gridlines stay crisp at any Windows scaling.
- **One undo step per user action.** `Session` groups several engine operations (e.g. "Top and Bottom Border",
  sort, Replace All, merge) into a single undo entry, including merge changes IronCalc does not track.
- **Ordered mutations.** The UI serialises mutating IPC calls so fast typing always reaches the engine in order.
- **Windows like Excel.** Opening/creating a workbook reuses the start window or an untouched blank workbook,
  otherwise it opens a new window. Closing asks to save unsaved changes.

### Future database layer — where it plugs in

| Need | Extension point |
| --- | --- |
| Load/save workbooks from a DB | implement `storage::WorkbookStore` (e.g. `DatabaseStore`) and add a `Location` variant such as `Remote { workbook_id }` |
| Organisation templates | implement `templates::TemplateProvider` and register it in `AppState::new` next to `BuiltinTemplates`; previews are generated automatically |
| Live sync / co-authoring | implement `sync::SyncBackend`. Every edit already produces an IronCalc diff batch (`flush_send_queue`) that is passed to `publish()`; remote batches are applied with `Session::apply_remote_diffs` |
| Identity | `Settings.user_name` / initials are local today; replace with the signed-in user |

Workbooks are identified by a stable id (UUID) independent of their file path, and sheets by `sheet_id`, so the same
model works for DB-backed workbooks.

## Features (MVP)

- Start screen: greeting, New (blank + templates, More templates), Recent / Pinned (pin, remove, open file location),
  Open (browse), Account (theme Black/White/System), Options (default font/size, sheets per workbook, date order).
- File backstage in a workbook: Info, Save, Save As (.xlsx/.csv/.txt), Export, Close.
- Editing: in-cell and formula-bar editing, point mode (arrows/click insert references, coloured reference boxes),
  function autocomplete + argument hints, F4 absolute references, Alt+Enter, Ctrl+Enter, auto-closing parentheses,
  typed dates/times/currency, AutoSum, fill handle and Ctrl+D/Ctrl+R (series), copy/cut/paste (values, formulas,
  formats; to/from Excel as text), Format Painter, undo/redo.
- Formatting: fonts, sizes, bold/italic/underline/strike, colours, fills, all Excel border presets, alignment,
  wrap, merge (center/across/cells/unmerge), number formats + Format Cells dialog with live previews,
  cell styles gallery, Format as Table gallery, conditional formatting (highlight rules, top/bottom, data bars,
  colour scales, icon sets, manage/clear rules).
- Structure: insert/delete rows, columns, cells (shift), hide/unhide, column width/row height (drag, dialog,
  AutoFit), freeze panes, gridlines/headings, zoom (Ctrl+wheel, slider), sheets (add, delete, rename, move by drag,
  duplicate, tab colour, hide/unhide).
- Data: sort (quick + multi-level), remove duplicates, find/replace (sheet or workbook), Go To, Name Manager.
- Status bar: Ready/Enter/Edit/Point, Average/Count/Sum (customisable), zoom.
- Keyboard: the common Excel shortcuts (see Help → Keyboard Shortcuts).
- Drag & drop `.xlsx`/`.csv` files onto a window to open them.

## Known limitations

- Not yet implemented: charts, pictures, AutoFilter, comments, hyperlinks, printing, data validation, indent and
  text rotation (IronCalc styles have no fields for these); these buttons are shown disabled.
- `.xls` (legacy binary) is not supported; open it in Excel and save as `.xlsx`.
- IronCalc recalculates the whole workbook after each edit: instant for typical sheets, ~150 ms for 500k filled cells.
  Sorting 50k rows takes a few seconds (runs off the UI thread).
- Fraction number formats render incorrectly in the current IronCalc version.
- CSP is disabled (`"csp": null`) for development convenience; tighten it before distributing outside the team.
