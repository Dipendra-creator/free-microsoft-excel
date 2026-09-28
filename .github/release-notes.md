## Download Sheets {{VERSION}}

### 🪟 Windows (10 / 11, 64-bit)

| File | What it is |
| --- | --- |
| [**Sheets_{{VERSION}}_x64-setup.exe**](https://github.com/{{REPO}}/releases/download/{{TAG}}/Sheets_{{VERSION}}_x64-setup.exe) | **Recommended.** Installer (per-user, no admin rights). Adds a Start menu entry and opens `.xlsx` / `.csv` files. |
| [Sheets_{{VERSION}}_x64_en-US.msi](https://github.com/{{REPO}}/releases/download/{{TAG}}/Sheets_{{VERSION}}_x64_en-US.msi) | MSI package for IT deployment (Intune, Group Policy). |
| [Sheets_{{VERSION}}_x64-portable.exe](https://github.com/{{REPO}}/releases/download/{{TAG}}/Sheets_{{VERSION}}_x64-portable.exe) | Portable: a single file, nothing to install. |

> The app is not code-signed yet. If SmartScreen shows "Windows protected your PC", click **More info → Run anyway**.

### 🍎 macOS (10.15 Catalina or later)

| File | Mac |
| --- | --- |
| [**Sheets_{{VERSION}}_aarch64.dmg**](https://github.com/{{REPO}}/releases/download/{{TAG}}/Sheets_{{VERSION}}_aarch64.dmg) | Apple Silicon (M1, M2, M3, M4…) |
| [**Sheets_{{VERSION}}_x64.dmg**](https://github.com/{{REPO}}/releases/download/{{TAG}}/Sheets_{{VERSION}}_x64.dmg) | Intel Macs |

Open the `.dmg` and drag **Sheets** to **Applications**. The app is not notarized by Apple yet, so the first time:
**right-click Sheets → Open → Open**. If macOS says the app "is damaged", run once in Terminal:
`xattr -dr com.apple.quarantine /Applications/Sheets.app`

---

## What's new in {{VERSION}}

**Reliability — never lose work**
- **AutoRecover** snapshots every changed workbook (every 30 s by default, even never-saved ones). After a crash, the start screen offers them back.
- **Recover Unsaved Workbooks**: closing with "Don't Save" keeps the last state for 7 days (File → Open).
- **Version history**: every save keeps the previous version of the file (File → Info).
- Saves are written to a temporary file, flushed to disk, then swapped in — a crash or power cut can't leave a half-written file.

**Data integrity — no silent changes to your data**
- Leading zeros (`00501`) and numbers longer than 15 digits (card numbers, IDs) are kept exactly, when typing, pasting and importing CSV.
- CSV files in UTF-8, UTF-16 or Windows-1252 open with correct accents; CSV is saved as UTF-8 with BOM so Excel reads it correctly too.
- CSV export never rounds numbers to their display format.
- Pasting text with rows of different lengths no longer drops rows.

**New features**
- AutoFilter (Ctrl+Shift+L) with value checklist, search and sort.
- Charts: column, bar, line, area, pie, doughnut, scatter (Alt+F1). Live, movable, resizable, saved in the `.xlsx`.
- Check Workbook: finds formula errors, inconsistent formulas, totals that skip numbers, numbers stored as text and hidden data.
- PivotTable summaries built from live SUMIFS/COUNTIFS formulas.
- Text to Columns, cell notes (Shift+F2), links (Ctrl+K, Ctrl+click to open).
- Print / Save as PDF (Ctrl+P), Switch Windows.
- macOS support with native window buttons and ⌘ shortcuts.

See the [README](https://github.com/{{REPO}}/blob/{{TAG}}/README.md), the [roadmap](https://github.com/{{REPO}}/blob/{{TAG}}/docs/ROADMAP.md) and [why Sheets is safer than Excel](https://github.com/{{REPO}}/blob/{{TAG}}/docs/EXCEL_PAIN_POINTS.md) for details.
