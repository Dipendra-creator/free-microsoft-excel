# LinkedIn launch kit — Sheets

Files in this folder:

| File | Use it for |
| --- | --- |
| `sheets-linkedin-carousel.pdf` | **Main post.** Upload as a *document* (LinkedIn: "+" → Add a document). Shows as a swipeable 7-slide carousel. Title it: **Sheets — a free spreadsheet for everyone** |
| `png/slide-1.png` … `slide-7.png` | The same slides as images (1080 × 1350). Use `slide-1.png` alone for an image post, or several for a multi-image post. |
| `png/banner.png` | 1200 × 627 banner: link posts, LinkedIn articles, GitHub social preview. |
| `svg/*.svg` | Editable sources. Regenerate with `python3 build.py && python3 render.py`. |

---

## 1. Main post (for everyone)

> Paste as is. LinkedIn shows the first ~200 characters before "…see more", so the first two lines are the hook.

```
Microsoft 365 needs 4 GB of disk space and a subscription.
I built a free spreadsheet that's about a 5 MB download — and opens your Excel files. 👇

Meet Sheets, a desktop spreadsheet for Windows and macOS.

✅ Opens and saves .xlsx (and CSV) — your files stay normal Excel files
✅ ~490 Excel functions: XLOOKUP, FILTER, SUMIFS, LET…
✅ Charts, PivotTable summaries, filters, conditional formatting
✅ Flash Fill, AutoFill options, Paste Special — and the keyboard shortcuts you already know (even Alt KeyTips)

The part I care about most: it never silently changes or loses your data.

🔒 00501 stays 00501. A 16-digit card number keeps all 16 digits. SEPT1 stays SEPT1 — not "1-Sep".
💾 AutoRecover every 30 seconds, even for files you never saved.
🗂️ Every save keeps the previous version, and "Don't Save" can be undone for 7 days.
🧮 "Check Workbook" finds broken formulas and totals that skip rows.

Who it's for:
🎓 Students who need a spreadsheet without a subscription
🏪 Small businesses running invoices, budgets and stock lists
📊 Analysts who live on keyboard shortcuts
🔬 Researchers tired of IDs and gene names being mangled
🍎 Mac users who want the same app as their Windows colleagues

Free and open source (MIT License). No account. No telemetry.

⬇️ Download link in the first comment.
💬 Try it with one of your real files and tell me what's missing — the roadmap is built from your feedback.

#Excel #Spreadsheets #Productivity #SmallBusiness #OpenSource
```

Add this line before "Free and open source." **only after v0.4.0 is released** (it's the first version with in-app updates):

```
🔄 Updates itself: when a new version is out, an Update button appears in the title bar.
```

## 2. First comment (post it right after publishing)

LinkedIn shows posts with links in the body to fewer people, so the link goes here.

```
⬇️ Download Sheets (free, Windows & macOS):
https://github.com/Dipendra-creator/free-microsoft-excel/releases/latest

• Windows 10/11: Sheets_…_x64-setup.exe (or the portable .exe)
• Mac with Apple Silicon (M1–M4): Sheets_…_aarch64.dmg
• Intel Mac: Sheets_…_x64.dmg

The builds aren't code-signed yet, so the first launch needs one extra click:
Windows → "More info" → "Run anyway". macOS → right-click Sheets → Open → Open.

Source code, roadmap and issue tracker: https://github.com/Dipendra-creator/free-microsoft-excel
```

## 3. Short version (if you prefer a tight post)

```
I built a free alternative to Excel. It's about a 5 MB download.

Sheets opens and saves your .xlsx files, has ~490 Excel functions (XLOOKUP included), charts, PivotTables, Flash Fill and all the shortcuts you know — on Windows and macOS.

And it never silently changes your data: 00501 stays 00501, long IDs keep every digit, and your work is auto-saved every 30 seconds.

Free, open source, no account. Link in the comments 👇

#Excel #Productivity #OpenSource
```

## 4. Follow-up posts, one audience at a time

Post these over the following days/weeks — each one reuses a slide as its image.

**Students** (image: `slide-5.png`)
```
Students: you don't need a subscription to do spreadsheets.

Sheets is free, needs no account and runs on any laptop — even an old one. It opens the .xlsx files your professors send, and saves files they can open in Excel.

It even auto-saves every 30 seconds, so a crash the night before a deadline doesn't cost you your work.

Link in the comments. #Students #Excel #StudyTips
```

**Small businesses** (image: `slide-6.png`)
```
Running a small business doesn't have to mean another monthly subscription.

Sheets is a free spreadsheet for Windows and Mac. Invoices, budgets, stock lists, price sheets — in the same .xlsx files your accountant already uses. It comes with invoice, budget and to-do templates.

Link in the comments. #SmallBusiness #Entrepreneurs #Excel
```

**Analysts & finance** (image: `slide-4.png`)
```
If your hands know Excel shortcuts, they already know Sheets.

Ctrl+D, Ctrl+R, F4, Ctrl+Shift+L, Alt+=, Ctrl+Alt+V — and Alt KeyTips (Alt, H, 1 is still Bold). Plus Flash Fill, Paste Special with Transpose and Multiply, AutoFill options, XLOOKUP and PivotTable summaries.

Free, about 5 MB, Windows and macOS. Link in the comments. #Finance #DataAnalysis #Excel
```

**Researchers** (image: `slide-2.png`)
```
27 human genes were renamed because spreadsheets kept turning them into dates.

Sheets doesn't. SEPT1 stays SEPT1, sample ID 00501 keeps its zeros, a 16-digit accession number keeps all 16 digits, and UTF-8 CSV files open with their accents intact.

Free spreadsheet for Windows and macOS that opens and saves .xlsx. Link in the comments.
#Research #Bioinformatics #DataIntegrity
```

**Never lose work** (image: `slide-3.png`)
```
Excel's AutoRecover saves every 10 minutes by default. Sheets saves every 30 seconds — including files you never saved.

Clicked "Don't Save" by mistake? Sheets keeps the last state for 7 days. Every save keeps the previous version, too.

Free, Windows and macOS. Link in the comments. #Productivity #Excel
```

## 5. Image alt text (LinkedIn: "Alt text" on each image)

1. Sheets cover, labelled "Free & open source · Windows & macOS": "Excel files. Zero cost. About 5 MB." above a screenshot of the Sheets app showing a personal monthly budget with a chart.
2. Four examples of Excel changing data — 00501 becomes 501, a 16-digit card number loses its last digit, SEPT1 becomes 1-Sep, café becomes cafÃ© — while Sheets keeps each value exactly.
3. Sheets safety features: AutoRecover every 30 seconds, "Don't Save" undoable for 7 days, 20 versions per file, crash-safe saves.
4. Grid of 12 Sheets features: 490 functions, charts, PivotTables, filter and sort, conditional formats, Flash Fill, AutoFill Options, Paste Special, Excel shortcuts, Check Workbook, print and PDF, .xlsx and CSV.
5. Who Sheets is for: students, small businesses, analysts, researchers, Mac users and IT teams.
6. Comparison: about 4 MB download for Sheets versus 4 GB (Windows) or 10 GB (Mac) of disk space for Microsoft 365; free versus subscription; no account; AutoRecover every 30 seconds versus 10 minutes; unlimited undo versus 100 steps.
7. Try it free — open source (MIT), no account: download, open any .xlsx or CSV file, send feedback. Download link: github.com/Dipendra-creator/free-microsoft-excel.

## 6. Posting tips

- **Best format:** the PDF carousel (document post) — people swipe through it, and every swipe counts as engagement.
- **Timing:** Tuesday–Thursday, 8–10 am in your audience's time zone.
- **First hour:** reply to every comment; ask people which feature they want next.
- **Name:** call it **"Sheets"** or "a free Excel alternative" — not "free Microsoft Excel". Using Microsoft's name as the product name invites trademark problems and makes it look official when it isn't. The last slide carries a "not affiliated with Microsoft" note for the same reason.
- **Claims:** every number on the slides is sourced — Microsoft's system requirements (4 GB / 10 GB), Excel's default AutoRecover interval (10 minutes) and undo limit (100), the gene-renaming story (HGNC, 2020), and Sheets' own release sizes. Keep the footnote on slide 6.
- **Open source:** the repository has an MIT `LICENSE`, so "free and open source" is accurate. Anyone may use, change and share the code, as long as your copyright notice stays with it.
