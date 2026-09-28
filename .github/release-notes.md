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

**In-app updates**
- Sheets now checks for new versions. When one is out, an **Update available** button appears in the title bar — click it to see what's new, then **Update now** and **Restart to update**.
- Updates are downloaded in the background, verified with the project's signing key and installed in one step. Workbooks with unsaved changes are kept and offered again on the start screen right after the restart.
- Help → **Check for Updates** checks on demand; Options → *Check for new versions automatically* turns the background check off.

> Updating from 0.3.0 or earlier? Install this version once from the files above — from now on Sheets updates itself.

**Also new in 0.3:** AutoFill Options (Copy Cells / Fill Series / dates by day, weekday, month, year), Ctrl+drag and double-click fill, Series dialog, **Flash Fill** (Ctrl+E), **Paste Special** with transpose and operations, **KeyTips** (Alt), the full Excel keyboard shortcut set (F1 lists them), AutoComplete and Alt+↓ pick lists.

**Also in Sheets** (since 0.2): AutoRecover and crash recovery, Recover Unsaved Workbooks, version history, data-integrity guards (leading zeros, long numbers, gene names), encoding-aware CSV, AutoFilter, charts, Check Workbook, PivotTable summaries, Text to Columns, notes, links, Print / Save as PDF, Windows and macOS.

See the [README](https://github.com/{{REPO}}/blob/{{TAG}}/README.md), the [roadmap](https://github.com/{{REPO}}/blob/{{TAG}}/docs/ROADMAP.md) and [why Sheets is safer than Excel](https://github.com/{{REPO}}/blob/{{TAG}}/docs/EXCEL_PAIN_POINTS.md) for details.
