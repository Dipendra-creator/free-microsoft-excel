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

**One-click updates**
- This release comes with signed update files. If you have Sheets 0.4.0 or 0.4.1, the **Update available** button in the title bar installs it: **Update now**, then **Restart to update**. Workbooks with unsaved changes are kept and offered again right after the restart.

**Also new in 0.4.1**
- The portable Windows `.exe` no longer installs a second copy of Sheets: it announces the new version and links to the new portable file.
- Sheets is open source under the MIT License, and the project lives at github.com/{{REPO}}.

**Also new in 0.4:** in-app updates. Sheets checks for new versions shortly after it starts and every 6 hours; Help → **Check for Updates** checks on demand, and Options → *Check for new versions automatically* turns the background check off.

> Updating from 0.3.0 or earlier? Install this version once from the files above — from now on Sheets updates itself.

**Also new in 0.3:** AutoFill Options (Copy Cells / Fill Series / dates by day, weekday, month, year), Ctrl+drag and double-click fill, Series dialog, **Flash Fill** (Ctrl+E), **Paste Special** with transpose and operations, **KeyTips** (Alt), the full Excel keyboard shortcut set (F1 lists them), AutoComplete and Alt+↓ pick lists.

**Also in Sheets** (since 0.2): AutoRecover and crash recovery, Recover Unsaved Workbooks, version history, data-integrity guards (leading zeros, long numbers, gene names), encoding-aware CSV, AutoFilter, charts, Check Workbook, PivotTable summaries, Text to Columns, notes, links, Print / Save as PDF, Windows and macOS.

See the [README](https://github.com/{{REPO}}/blob/{{TAG}}/README.md), the [roadmap](https://github.com/{{REPO}}/blob/{{TAG}}/docs/ROADMAP.md) and [why Sheets is safer than Excel](https://github.com/{{REPO}}/blob/{{TAG}}/docs/EXCEL_PAIN_POINTS.md) for details.
