# Where Microsoft Excel lets people down — and what Sheets does about it

Excel is the most successful spreadsheet ever built, and its compatibility is
Sheets' baseline: every workbook you open and save stays a normal `.xlsx` file.
But decades of backwards compatibility have left well-documented failure modes
that cost real money and real research. This document collects them, with
sources, and records how Sheets answers each one.

Status legend: ✅ shipped in Sheets 0.2 · 🟡 partly addressed · 🗺️ on the [roadmap](ROADMAP.md)

---

## 1. Excel silently changes your data

### 1.1 Identifiers become dates (the gene-name problem)

When a CSV or pasted list contains values such as `SEPT1`, `MARCH1`, `DEC1` or
`OCT4`, Excel's default settings convert them to dates. A 2016 study found the
error in about one fifth of 3,597 genomics papers with supplementary Excel
files; the 2021 follow-up *"Gene name errors: Lessons not learned"* found it had
grown to **30.9 %**. The problem was bad enough that the HUGO Gene Nomenclature
Committee **renamed 27 human genes** (`MARCH1` → `MARCHF1`, `SEPT1` → `SEPTIN1`)
rather than wait for a fix.

**Sheets** ✅ Only complete dates (`2026-09-28`, `28/09/2026`, `28 Sep 2026`) are
recognised as dates. `SEPT1`, `MARCH1`, `DEC1`, `1-Mar`, `3/4` and `1-2` stay
exactly as typed. This is covered by automated tests.

### 1.2 Leading zeros disappear

ZIP codes, employee IDs, product codes and phone numbers such as `00501` or
`007` become `501` and `7` the moment they are typed, pasted or opened from a
CSV. Once the file is saved, the zeros are gone for good.

**Sheets** ✅ Digit strings with leading zeros are kept as text — when typing,
when pasting from other apps, when splitting with Text to Columns and when
opening CSV/TXT files. (Options → *Data integrity* can switch this off for
Excel-identical behaviour.)

### 1.3 Numbers longer than 15 digits are destroyed

Excel stores numbers with 15 significant digits. A 16-digit card number such as
`4111222233334444` is stored as `4111222233334440` and shown as
`4.11122E+15`. Microsoft's own support article confirms that "changing the cells
to Text after Excel has already converted the numbers will not restore any lost
digits."

**Sheets** ✅ Integers longer than 15 digits are stored as text, digit for digit,
in every input path (typing, paste, CSV import, Text to Columns).

### 1.4 CSV export writes what you see, not what you have

"Save as CSV" in Excel writes the *displayed* value. A cell showing `1.23`
(format `0.00`) but containing `1.23456` is exported as `1.23` — silent
precision loss in every downstream system.

**Sheets** ✅ CSV/TXT export uses the displayed text only when it reads back as
exactly the same number (e.g. `$1,200.00`), or for dates and times. Otherwise
the full-precision value is written.

---

## 2. Excel loses work

### 2.1 AutoRecover is too slow and too narrow

By default Excel's AutoRecover saves every **10 minutes** — up to ten minutes of
work lost on a crash. It only protects workbooks that have been **saved at least
once**, it has to be enabled before the crash, and the temporary files are
deleted as soon as the recovery pane is closed.

**Sheets** ✅ AutoRecover snapshots every changed workbook **30 seconds** after it
changes (configurable to 10 s), including workbooks that were never saved.
Snapshots are written atomically in the background, and after an abnormal exit
the start screen shows a **Document Recovery** panel. Recovered files stay
protected until you save them. (Verified by killing the app with `kill -9`.)

### 2.2 "Don't Save" is final

Clicking the wrong button in the close dialog loses everything since the last
save.

**Sheets** ✅ Closing with unsaved changes keeps the last state for **7 days**
under *File → Open → Recover Unsaved Workbooks* — including when the app is
quit with workbooks still open.

### 2.3 One bad save overwrites the only copy

Excel keeps no local version history for files outside OneDrive/SharePoint.

**Sheets** ✅ Every save first keeps the previous file in a local **version
history** (20 versions per file by default). *File → Info → Version History*
opens any of them as a new workbook.

### 2.4 A crash during save can corrupt the file

**Sheets** ✅ Files are written to a temporary file, flushed to disk (`fsync`),
and only then swapped in, so a crash or power cut leaves either the old or the
new file — never a half-written one.

### 2.5 The undo limit

Excel keeps **100** undo steps (raising it means editing the Windows registry),
and running a macro clears the undo history completely.

**Sheets** ✅ Undo history is unlimited for the session, and composite actions
(sort, Replace All, filters, PivotTable creation, Text to Columns) are one undo
step each.

---

## 3. Silent truncation and data dropped without warning

In October 2020 Public Health England lost **15,841 positive COVID-19 test
results**: lab CSVs were imported into the legacy `.xls` format, whose
65,536-row limit silently cut off new rows. An estimated 48,000 contacts were
not traced in time.

**Sheets** ✅ Sheets never writes the legacy `.xls` format (and refuses to open
it rather than guess). Workbooks use `.xlsx` with 1,048,576 rows × 16,384
columns.
✅ A real silent-data-loss path we found in our own engine was fixed: pasted text
whose rows have different numbers of columns (common when copying from web
pages) used to drop rows; it is now padded and every row arrives.
✅ Opening a CSV/TXT file larger than a worksheet (1,048,576 rows × 16,384
columns) loads what fits, says exactly how many rows/columns did not, and never
overwrites the original file — saving asks for a new file instead.
🗺️ Planned: the same warning for pastes that would run past the sheet edge.

---

## 4. Formula mistakes that nobody sees

* **Reinhart–Rogoff (2010).** An influential paper on public debt averaged a
  range that left out five of twenty countries. Corrected, "−0.1 % growth"
  became "+2.2 %". The paper had been used to justify austerity policies.
* **JPMorgan "London Whale" (2012).** A value-at-risk model built from Excel
  sheets filled by copy and paste understated risk; the bank lost about
  **$6 billion**.

Excel flags some of these with small green triangles that are easy to miss and
never gives a workbook-wide summary.

**Sheets** ✅ **Review → Check Workbook** scans every sheet and lists, with one
click to jump to each cell:

| Finding | Why it matters |
| --- | --- |
| Formula errors (`#DIV/0!`, `#REF!`, `#N/A`, circular references…) | Broken results propagate silently |
| Totals that skip adjacent numbers | The Reinhart–Rogoff error |
| Formulas that break their row/column pattern | Copy/paste and edit mistakes (London Whale) |
| Numbers stored as text | `SUM` ignores them |
| Hidden sheets, rows and columns | Data that affects results but isn't visible |
| Volatile functions (`NOW`, `RAND`, `OFFSET`, `INDIRECT`) | Results that change on every recalculation |

🗺️ Planned: formula precedents/dependents arrows, and hard-coded constants in
formulas.

---

## 5. CSV files and text encodings

Double-clicking a UTF-8 CSV without a byte-order mark makes Excel read it with
the legacy Windows code page: `café` turns into `cafÃ©`, and Chinese, Arabic or
emoji text becomes garbage. Microsoft's own guidance is to avoid double-clicking
CSV files and use the import wizard instead.

**Sheets** ✅ Opening a CSV detects UTF-8 (with or without BOM), UTF-16 LE/BE and
falls back to Windows-1252 for legacy files; the delimiter (`,` `;` tab `|`) is
detected from the first line. Saved CSV files include a UTF-8 BOM so that Excel
reads them correctly too (configurable).

---

## 6. Size, cost and startup

Microsoft 365 requires **4 GB of free disk space on Windows and 10 GB on macOS**
and a subscription.

**Sheets** ✅ The Windows installer is about **3 MB** and the installed app about
**10 MB**, because it uses the operating system's built-in web view (WebView2 on
Windows, WebKit on macOS) and a compiled Rust spreadsheet engine
([IronCalc](https://github.com/ironcalc/IronCalc)). It is free, needs no
account, and sends no telemetry.

---

## 7. Other long-standing quirks

| Quirk | Excel | Sheets |
| --- | --- | --- |
| 1900 leap-year bug (`29 Feb 1900` exists) | Kept for Lotus 1-2-3 compatibility | Serial numbers stay Excel-compatible so files round-trip; typed dates are validated against the real calendar (`31/02/2026` is rejected as a date) |
| Mac edition lags behind Windows | Features missing on Mac | The same code base and feature set on Windows and macOS |
| Heavy app for light work | Full Office suite install | Native Rust engine and a virtualised canvas grid that only draws the visible cells |

---

## Sources

* Ziemann, Eren & El-Osta, *Gene name errors are widespread in the scientific literature*, Genome Biology (2016); Abeysooriya et al., *Gene name errors: Lessons not learned*, PLOS Computational Biology (2021) — https://journals.plos.org/ploscompbiol/article?id=10.1371%2Fjournal.pcbi.1008984
* ThePrint, *27 genes in your body now have a new name because Microsoft Excel confused them for dates* — https://theprint.in/science/27-genes-in-your-body-now-have-a-new-name-because-microsoft-excel-confused-them-for-dates/477398/
* Microsoft Support, *Keeping leading zeros and large numbers* — https://support.microsoft.com/en-us/excel/keeping-leading-zeros-and-large-numbers
* Wikipedia, *Numeric precision in Microsoft Excel* — https://en.wikipedia.org/wiki/Numeric_precision_in_Microsoft_Excel
* PublicTechnology, *Lost data on 16,000 coronavirus cases pinned on Excel* — https://www.publictechnology.net/2020/10/06/health-and-social-care/lost-data-16000-coronavirus-cases-pinned-excel/
* City St George's, *What really caused the Excel error in NHS Test and Trace?* — https://blogs.city.ac.uk/cityshortcourses/2020/10/13/what-really-caused-the-excel-error-in-nhs-test-and-trace-covid-19-system-an-in-depth-technical-analysis/
* How-To Geek, *6 ways to recover "lost" work in Microsoft Excel* — https://www.howtogeek.com/microsoft-excel-ways-to-recover-lost-work/
* Ablebits, *How to recover unsaved Excel file* — https://www.ablebits.com/office-addins-blog/recover-unsaved-excel-file/
* Microsoft Support, *Undo, redo, or repeat an action* — https://support.microsoft.com/en-us/office/foundations-experiences/undo-redo-or-repeat-an-action
* Excel Tips, *Clearing the Undo Stack in a Macro* — https://excel.tips.net/T002463_Clearing_the_Undo_Stack_in_a_Macro.html
* The Conversation, *The Reinhart-Rogoff error – or how not to Excel at economics* — https://theconversation.com/the-reinhart-rogoff-error-or-how-not-to-excel-at-economics-13646
* Forbes, *Solutions To Spreadsheet Risk Post JPM's London Whale* — https://www.forbes.com/sites/tomgroenfeldt/2013/02/19/solutions-to-spreadsheet-risk-post-jpms-london-whale/
* Microsoft Q&A, *UTF-8 encoded CSV file opening garbled* — https://learn.microsoft.com/en-us/answers/questions/5134937/utf-8-encoded-csv-file-opening-garbled
* Microsoft Learn, *Excel incorrectly assumes that the year 1900 is a leap year* — https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/wrongly-assumes-1900-is-leap-year
* Microsoft Support, *System requirements for Microsoft 365 for home use* — https://support.microsoft.com/en-us/office/system-requirements/system-requirements-for-microsoft-365-for-home-use
