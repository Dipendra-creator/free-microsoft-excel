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

**AutoFill that works like Excel**
- Dragging the fill handle shows the **AutoFill Options** button at the corner of the filled cells: switch between **Copy Cells**, **Fill Series**, **Fill Formatting Only** and **Fill Without Formatting** — and for dates **Fill Days / Weekdays / Months / Years**.
- One number is copied, as in Excel; hold **Ctrl** while dragging (or pick Fill Series) to count 1, 2, 3…. Two or more numbers continue their trend. Dates, `Item 1`, `ID-007`, `1st`, `Q1`, month and day names continue on their own, and filling up or left counts down.
- **Double-click the fill handle** to fill down to the end of the neighbouring data. Home → Fill → **Series…** for linear, growth and date series with a step, stop value or trend.
- **Flash Fill** (Ctrl+E, Data tab): type one example next to your data (`John Smith` → `Smith, J.`) and Sheets fills the rest of the column.

**Paste Special** (Ctrl+Alt+V): formulas, values, formats, number formats, no borders, column widths, **Add / Subtract / Multiply / Divide**, **Skip blanks**, **Transpose** and **Paste Link**. Ctrl+Shift+V pastes values only.

**Keyboard**
- **KeyTips**: press Alt (or F10) and type the letters shown on the ribbon — Alt, H, 1 for Bold, Alt, A, F, F for Flash Fill…
- The rest of Excel's shortcuts: Ctrl+A (data region, then sheet), End mode, F8 Extend Selection, F4 repeat last action, Ctrl+' / Ctrl+Shift+" copy from above, Ctrl+[ go to precedents, Ctrl+. corners, Shift+F4 find next, F3 / Ctrl+F3 / Ctrl+Shift+F3 names, Ctrl+Shift+~ General format, Ctrl+Tab windows, Ctrl+Alt+= / - zoom, and more. **F1** lists them all.
- **AutoComplete** finishes text you have already typed in the column; **Alt+↓** picks from the column's entries.

**Also in Sheets** (since 0.2): AutoRecover and crash recovery, Recover Unsaved Workbooks, version history, data-integrity guards (leading zeros, long numbers, gene names), encoding-aware CSV, AutoFilter, charts, Check Workbook, PivotTable summaries, Text to Columns, notes, links, Print / Save as PDF, Windows and macOS.

See the [README](https://github.com/{{REPO}}/blob/{{TAG}}/README.md), the [roadmap](https://github.com/{{REPO}}/blob/{{TAG}}/docs/ROADMAP.md) and [why Sheets is safer than Excel](https://github.com/{{REPO}}/blob/{{TAG}}/docs/EXCEL_PAIN_POINTS.md) for details.
