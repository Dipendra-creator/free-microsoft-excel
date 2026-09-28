#!/usr/bin/env python3
"""Builds the LinkedIn launch graphics for Sheets as SVG files.

Outputs (next to this script):
  svg/slide-1.svg … slide-7.svg   carousel, 1080 x 1350 (4:5 portrait)
  svg/banner.svg                  single-image / link post, 1200 x 627

If screenshot.png exists next to this script it is embedded in the cover
slide and the banner (a real screenshot of the app); otherwise a drawn
spreadsheet window is used.
"""

import base64
import html
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "svg")
TOTAL = 7

# Palette
INK = "#10231A"
MUTED = "#4F6358"
BG = "#F3F7F4"
CARD = "#FFFFFF"
LINE = "#D8E4DC"
G1 = "#0B3D23"   # deep green
G2 = "#107C41"   # brand green
G3 = "#21A366"
G4 = "#33C481"
MINT = "#7FE0A8"
RED = "#C8413A"
RED_BG = "#FCEBEA"
GREEN_BG = "#E6F5EC"

FONT = "Inter, 'Segoe UI', 'Helvetica Neue', Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif"
MONO = "'JetBrains Mono', Consolas, 'SF Mono', Menlo, 'Liberation Mono', 'DejaVu Sans Mono', monospace"


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def text(x, y, s, size=28, weight=400, fill=INK, anchor="start", family=FONT, extra=""):
    return (
        f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" '
        f'fill="{fill}" text-anchor="{anchor}" {extra}>{esc(s)}</text>'
    )


def wrap(s: str, size: float, width: float) -> list[str]:
    """Greedy word wrap using an average glyph width (good enough for sans text)."""
    per_line = max(8, int(width / (size * 0.52)))
    words, lines, cur = s.split(), [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > per_line:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return lines


def para(x, y, s, size=26, width=800, fill=MUTED, weight=400, leading=1.35):
    out = []
    for i, line in enumerate(wrap(s, size, width)):
        out.append(text(x, y + i * size * leading, line, size, weight, fill))
    return "\n".join(out)


def logo(x, y, size=56):
    """The Sheets app icon (same drawing as the in-app logo), scaled from 16 px."""
    k = size / 16
    return f"""<g transform="translate({x},{y}) scale({k})">
  <rect x="4.5" y="1.5" width="11" height="13" rx="1.5" fill="{G4}"/>
  <path d="M4.5 3a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v2.8h-11z" fill="{G3}"/>
  <path d="M4.5 10.2h11V13a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 13z" fill="{G2}"/>
  <rect x="0.5" y="4" width="8" height="8" rx="1" fill="#0B5C30"/>
  <path d="M2.2 5.7h4.6v4.6H2.2zM4.5 5.7v4.6M2.2 8h4.6" stroke="#fff" stroke-width="0.9" fill="none"/>
</g>"""


def header(n, dark=False):
    fg = "#FFFFFF" if dark else INK
    sub = "#A9DDBF" if dark else MUTED
    return "\n".join(
        [
            logo(72, 64, 56),
            text(146, 106, "Sheets", 38, 700, fg),
            text(1008, 104, f"{n} / {TOTAL}", 24, 600, sub, "end"),
        ]
    )


def footer(dark=False, cta="Swipe →"):
    fg = "#CFEBDC" if dark else MUTED
    line = "rgba(255,255,255,0.18)" if dark else LINE
    pill_bg = "rgba(255,255,255,0.14)" if dark else G2
    parts = [
        f'<line x1="72" y1="1238" x2="1008" y2="1238" stroke="{line}" stroke-width="2"/>',
        text(72, 1290, "Free · Windows & macOS · Opens and saves .xlsx", 24, 500, fg),
    ]
    if cta:
        w = 34 + len(cta) * 14
        parts.append(f'<rect x="{1008 - w}" y="1256" width="{w}" height="52" rx="26" fill="{pill_bg}"/>')
        parts.append(text(1008 - w / 2, 1291, cta, 24, 700, "#FFFFFF", "middle"))
    return "\n".join(parts)


def svg(w, h, body, bg=BG, defs=""):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
<defs>
  <linearGradient id="dark" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="{G1}"/>
    <stop offset="1" stop-color="#0E6A38"/>
  </linearGradient>
  <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
    <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#021C0E" flood-opacity="0.45"/>
  </filter>
  <filter id="soft" x="-5%" y="-5%" width="110%" height="120%">
    <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#0B3D23" flood-opacity="0.10"/>
  </filter>
  {defs}
</defs>
<rect width="{w}" height="{h}" fill="{bg}"/>
{body}
</svg>
"""


def screenshot_or_mock(x, y, w, h, clip_id, align="xMidYMin"):
    """A rounded app window: the real screenshot when available."""
    shot = os.path.join(HERE, "screenshot.png")
    clip = f'<clipPath id="{clip_id}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18"/></clipPath>'
    if os.path.exists(shot):
        data = base64.b64encode(open(shot, "rb").read()).decode()
        inner = (
            f'<image x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="{align} slice" '
            f'href="data:image/png;base64,{data}"/>'
        )
    else:
        inner = mock_window(x, y, w, h)
    return clip, (
        f'<g filter="url(#shadow)"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="#fff"/></g>'
        f'<g clip-path="url(#{clip_id})">{inner}</g>'
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>'
    )


def mock_window(x, y, w, h):
    """Drawn stand-in for the app window (title bar, ribbon, grid, chart)."""
    p = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#FFFFFF"/>']
    p.append(f'<rect x="{x}" y="{y}" width="{w}" height="44" fill="#1F1F1F"/>')
    p.append(logo(x + 16, y + 12, 20))
    p.append(text(x + 46, y + 29, "Budget.xlsx - Sheets", 16, 500, "#EEEEEE"))
    p.append(f'<rect x="{x}" y="{y + 44}" width="{w}" height="70" fill="#F6F6F6"/>')
    for i, t in enumerate(["File", "Home", "Insert", "Formulas", "Data", "View"]):
        p.append(text(x + 20 + i * 86, y + 70, t, 15, 700 if t == "Home" else 400, G2 if t == "Home" else "#333"))
    for i in range(10):
        p.append(f'<rect x="{x + 20 + i * 60}" y="{y + 82}" width="44" height="22" rx="4" fill="#E4E4E4"/>')
    top = y + 114
    rows, cols = 12, 8
    cw = (w - 40) / cols
    rh = 30
    p.append(f'<rect x="{x}" y="{top}" width="{w}" height="{h}" fill="#FFFFFF"/>')
    heads = ["Month", "Income", "Rent", "Food", "Travel", "Other", "Saved", "Rate"]
    data = [
        ["Jan", "4,200", "1,300", "520", "180", "240", "1,960", "47%"],
        ["Feb", "4,200", "1,300", "480", "95", "310", "2,015", "48%"],
        ["Mar", "4,350", "1,300", "560", "420", "205", "1,865", "43%"],
        ["Apr", "4,350", "1,300", "505", "160", "260", "2,125", "49%"],
        ["May", "4,500", "1,300", "590", "610", "180", "1,820", "40%"],
        ["Jun", "4,500", "1,300", "530", "240", "300", "2,130", "47%"],
    ]
    for c in range(cols):
        cx = x + 40 + c * cw
        p.append(f'<rect x="{cx}" y="{top}" width="{cw}" height="{rh}" fill="{G2}"/>')
        p.append(text(cx + 10, top + 21, heads[c], 15, 700, "#FFFFFF"))
    for r in range(1, rows):
        ry = top + r * rh
        p.append(f'<rect x="{x}" y="{ry}" width="40" height="{rh}" fill="#F0F0F0"/>')
        p.append(text(x + 20, ry + 20, str(r + 1), 13, 400, "#777", "middle"))
        for c in range(cols):
            cx = x + 40 + c * cw
            fill = "#E9F5EE" if r % 2 == 0 else "#FFFFFF"
            p.append(f'<rect x="{cx}" y="{ry}" width="{cw}" height="{rh}" fill="{fill}" stroke="#E3E3E3" stroke-width="1"/>')
            if r <= len(data):
                v = data[r - 1][c]
                anchor = "start" if c == 0 else "end"
                tx = cx + 10 if c == 0 else cx + cw - 10
                p.append(text(tx, ry + 20, v, 15, 400, INK, anchor))
    # selection + AutoFill Options tag
    sx, sy = x + 40 + 6 * cw, top + rh
    p.append(f'<rect x="{sx}" y="{sy}" width="{cw}" height="{rh * 6}" fill="none" stroke="{G2}" stroke-width="3"/>')
    p.append(f'<rect x="{sx + cw - 5}" y="{sy + rh * 6 - 5}" width="9" height="9" fill="{G2}" stroke="#fff"/>')
    p.append(f'<rect x="{sx + cw + 6}" y="{sy + rh * 6 + 6}" width="34" height="24" rx="3" fill="#fff" stroke="#AAA"/>')
    return "\n".join(p)


# ----------------------------------------------------------------------
# Slides
# ----------------------------------------------------------------------


def slide1():
    clip, window = screenshot_or_mock(72, 742, 936, 460, "shot1")
    body = f"""
<rect width="1080" height="1350" fill="url(#dark)"/>
<circle cx="980" cy="160" r="260" fill="{G3}" opacity="0.18"/>
<circle cx="90" cy="1250" r="220" fill="{G4}" opacity="0.10"/>
{header(1, dark=True)}
<rect x="72" y="178" width="580" height="48" rx="24" fill="rgba(255,255,255,0.12)"/>
{text(96, 211, "FREE SPREADSHEET · WINDOWS & macOS", 22, 700, MINT, extra='letter-spacing="2"')}
{text(72, 340, "Excel files.", 104, 800, "#FFFFFF")}
{text(72, 458, "Zero cost.", 104, 800, "#FFFFFF")}
{text(72, 576, "About 5 MB.", 104, 800, MINT)}
{text(72, 648, "Meet Sheets — a free spreadsheet app that opens and", 32, 400, "#D8F3E4")}
{text(72, 692, "saves your .xlsx files. No subscription. No account.", 32, 400, "#D8F3E4")}
{window}
{footer(dark=True, cta="Swipe to see why →")}
"""
    return svg(1080, 1350, body, G1, clip)


def slide2():
    rows = [
        ("00501", "ZIP code", "501", "leading zeros dropped", "00501"),
        ("4111222233334444", "16-digit card number", "4.11122E+15", "last digit lost for good", "4111222233334444"),
        ("SEPT1", "gene name", "1-Sep", "turned into a date", "SEPT1"),
        ("café", "text in a UTF-8 CSV file", "cafÃ©", "garbled accents", "café"),
    ]
    parts = [header(2)]
    parts.append(text(72, 232, "Excel silently", 70, 800, INK))
    parts.append(text(72, 316, "changes your data.", 70, 800, INK))
    parts.append(text(72, 372, "Sheets keeps it exactly as you typed it.", 32, 600, G2))
    y = 418
    for typed, what, excel, why, sheets in rows:
        parts.append(f'<g filter="url(#soft)"><rect x="72" y="{y}" width="936" height="178" rx="20" fill="{CARD}"/></g>')
        parts.append(text(104, y + 44, f"YOU TYPE · {what.upper()}", 18, 700, MUTED, extra='letter-spacing="1.5"'))
        parts.append(text(104, y + 92, typed, 40, 700, INK, family=MONO))
        parts.append(f'<rect x="{976 - 26 - len(why) * 10.5}" y="{y + 64}" width="{26 + len(why) * 10.5}" height="36" rx="18" fill="{RED_BG}"/>')
        parts.append(text(976 - 13 - len(why) * 5.25, y + 88, why, 19, 700, RED, "middle"))
        # Excel chip
        parts.append(f'<rect x="104" y="{y + 114}" width="430" height="48" rx="12" fill="{RED_BG}"/>')
        parts.append(text(124, y + 146, "Excel:", 22, 700, RED))
        parts.append(text(204, y + 146, excel, 24, 700, RED, family=MONO))
        # Sheets chip
        parts.append(f'<rect x="550" y="{y + 114}" width="426" height="48" rx="12" fill="{GREEN_BG}"/>')
        parts.append(text(570, y + 146, "Sheets:", 22, 700, G2))
        parts.append(text(660, y + 146, sheets, 24 if len(sheets) < 12 else 21, 700, G2, family=MONO))
        parts.append(
            f'<path d="M{950} {y + 138}l8 8 16-18" stroke="{G2}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
        )
        y += 196
    parts.append(text(72, 1210, "27 human genes were renamed because spreadsheets kept turning them into dates.", 22, 500, MUTED, extra='font-style="italic"'))
    parts.append(footer())
    return svg(1080, 1350, "\n".join(parts))


def icon_badge(x, y, glyph, color=G2, size=76):
    r = size / 2
    return f'<circle cx="{x + r}" cy="{y + r}" r="{r}" fill="{color}" opacity="0.12"/>' + glyph(x + r, y + r)


def g_clock(cx, cy):
    return f'<circle cx="{cx}" cy="{cy}" r="20" fill="none" stroke="{G2}" stroke-width="4"/><path d="M{cx} {cy - 11}v12l8 6" stroke="{G2}" stroke-width="4" fill="none" stroke-linecap="round"/>'


def g_undo(cx, cy):
    return f'<path d="M{cx - 14} {cy - 8}h18a10 10 0 0 1 0 20h-12" stroke="{G2}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M{cx - 6} {cy - 16}l-9 8 9 8" stroke="{G2}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'


def g_stack(cx, cy):
    return (
        f'<rect x="{cx - 16}" y="{cy - 20}" width="28" height="34" rx="3" fill="none" stroke="{G2}" stroke-width="4"/>'
        f'<path d="M{cx - 8} {cy + 20}h24v-32" stroke="{G2}" stroke-width="4" fill="none" stroke-linecap="round"/>'
    )


def g_shield(cx, cy):
    return (
        f'<path d="M{cx} {cy - 22}l18 7v12c0 11-8 19-18 23-10-4-18-12-18-23v-12z" fill="none" stroke="{G2}" stroke-width="4" stroke-linejoin="round"/>'
        f'<path d="M{cx - 8} {cy + 1}l6 6 11-12" stroke="{G2}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    )


def slide3():
    cards = [
        (g_clock, "30 s", "AutoRecover", "Every changed workbook is snapshotted — even ones you never saved. Excel's default is every 10 minutes."),
        (g_undo, "7 days", "“Don't Save” is undoable", "Closed without saving? The last state is kept for a week, one click away."),
        (g_stack, "20", "versions per file", "Every save keeps the previous copy. Open any older version in one click."),
        (g_shield, "0", "half-written files", "Saves are flushed to disk, then swapped in. A crash or power cut can't corrupt your file."),
    ]
    parts = [header(3)]
    parts.append(text(72, 232, "Never lose work", 72, 800, INK))
    parts.append(text(72, 318, "again.", 72, 800, G2))
    parts.append(text(72, 376, "Safety nets are switched on by default.", 32, 500, MUTED))
    for i, (glyph, stat, label, detail) in enumerate(cards):
        x = 72 + (i % 2) * 480
        y = 430 + (i // 2) * 396
        parts.append(f'<g filter="url(#soft)"><rect x="{x}" y="{y}" width="456" height="372" rx="24" fill="{CARD}"/></g>')
        parts.append(icon_badge(x + 32, y + 32, glyph))
        parts.append(text(x + 32, y + 184, stat, 72, 800, G2))
        parts.append(text(x + 32, y + 230, label, 28, 700, INK))
        parts.append(para(x + 32, y + 272, detail, 21, 390, MUTED))
    parts.append(footer())
    return svg(1080, 1350, "\n".join(parts))


FEATURES = [
    ("fx", "490 functions", "XLOOKUP, FILTER, SUMIFS…"),
    ("chart", "Charts", "Column, line, pie, scatter…"),
    ("pivot", "PivotTables", "Live summary tables"),
    ("filter", "Filter & sort", "AutoFilter, multi-level sort"),
    ("cf", "Conditional formats", "Data bars, colour scales…"),
    ("flash", "Flash Fill", "Ctrl+E learns from 1 example"),
    ("fill", "AutoFill Options", "Copy, series, days, months"),
    ("paste", "Paste Special", "Values, transpose, multiply"),
    ("keys", "Your shortcuts", "Ctrl+D, F4, Alt KeyTips…"),
    ("check", "Check Workbook", "Finds broken formulas"),
    ("print", "Print & PDF", "Sheet, selection, workbook"),
    ("file", ".xlsx & CSV", "Open and save — no lock-in"),
]


def feature_glyph(kind, cx, cy):
    s = f'stroke="{G2}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"'
    if kind == "fx":
        return f'<text x="{cx}" y="{cy + 9}" font-family="Georgia, serif" font-style="italic" font-size="28" font-weight="700" fill="{G2}" text-anchor="middle">fx</text>'
    if kind == "chart":
        return f'<path d="M{cx-14} {cy+14}v-10M{cx-4} {cy+14}v-22M{cx+6} {cy+14}v-14M{cx+15} {cy+14}v-26" {s}/>'
    if kind == "pivot":
        return f'<rect x="{cx-15}" y="{cy-15}" width="30" height="30" rx="3" {s}/><path d="M{cx-15} {cy-5}h30M{cx-5} {cy-15}v30" {s}/>'
    if kind == "filter":
        return f'<path d="M{cx-15} {cy-13}h30l-11 13v12l-8 4v-16z" {s}/>'
    if kind == "cf":
        return f'<rect x="{cx-15}" y="{cy-13}" width="22" height="7" rx="2" fill="{G3}"/><rect x="{cx-15}" y="{cy-3}" width="30" height="7" rx="2" fill="{G2}"/><rect x="{cx-15}" y="{cy+7}" width="14" height="7" rx="2" fill="{G4}"/>'
    if kind == "flash":
        return f'<path d="M{cx+3} {cy-17}l-12 19h9l-4 15 13-20h-9z" fill="#F2C230" stroke="#D39A1B" stroke-width="2" stroke-linejoin="round"/>'
    if kind == "fill":
        return f'<rect x="{cx-15}" y="{cy-15}" width="18" height="18" rx="2" {s}/><path d="M{cx+10} {cy-6}v20M{cx+4} {cy+8}l6 6 6-6" {s}/>'
    if kind == "paste":
        return f'<rect x="{cx-13}" y="{cy-12}" width="24" height="28" rx="3" {s}/><rect x="{cx-6}" y="{cy-17}" width="10" height="8" rx="2" {s}/>'
    if kind == "keys":
        return f'<rect x="{cx-17}" y="{cy-11}" width="34" height="22" rx="4" {s}/><path d="M{cx-10} {cy-3}h2M{cx-3} {cy-3}h2M{cx+4} {cy-3}h2M{cx-8} {cy+5}h16" {s}/>'
    if kind == "check":
        return f'<path d="M{cx} {cy-16}l15 6v9c0 9-7 15-15 18-8-3-15-9-15-18v-9z" {s}/><path d="M{cx-6} {cy}l4 5 9-9" {s}/>'
    if kind == "print":
        return f'<rect x="{cx-15}" y="{cy-6}" width="30" height="14" rx="3" {s}/><path d="M{cx-9} {cy-6}v-9h18v9M{cx-9} {cy+4}v10h18v-10" {s}/>'
    return f'<path d="M{cx-11} {cy-16}h15l8 8v24h-23z" {s}/><path d="M{cx-5} {cy+2}h11M{cx-5} {cy+8}h11" {s}/>'


def slide4():
    parts = [header(4)]
    parts.append(text(72, 232, "Everything you", 72, 800, INK))
    parts.append(text(72, 318, "use Excel for.", 72, 800, G2))
    for i, (kind, title, sub) in enumerate(FEATURES):
        x = 72 + (i % 3) * 320
        y = 372 + (i // 3) * 212
        parts.append(f'<g filter="url(#soft)"><rect x="{x}" y="{y}" width="296" height="192" rx="20" fill="{CARD}"/></g>')
        parts.append(f'<rect x="{x + 24}" y="{y + 24}" width="56" height="56" rx="14" fill="{GREEN_BG}"/>')
        parts.append(feature_glyph(kind, x + 52, y + 52))
        parts.append(text(x + 24, y + 124, title, 26, 800, INK))
        parts.append(text(x + 24, y + 160, sub, 19, 500, MUTED))
    parts.append(footer())
    return svg(1080, 1350, "\n".join(parts))


PERSONAS = [
    ("student", "Students", "Free, no account, and light enough for any laptop."),
    ("shop", "Small businesses", "Invoices, budgets and stock lists in the .xlsx files your accountant already uses."),
    ("chart", "Analysts & finance", "XLOOKUP, PivotTables, Paste Special and the shortcuts in your muscle memory."),
    ("lab", "Researchers", "Sample IDs, gene names and long numbers stay exactly as typed."),
    ("apple", "Mac users", "The same app and features on Apple Silicon and Intel Macs."),
    ("it", "IT teams", "Per-user installer, MSI package or a single portable .exe."),
]


def persona_glyph(kind, cx, cy):
    s = f'stroke="#FFFFFF" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"'
    if kind == "student":
        return f'<path d="M{cx-18} {cy-4}l18-9 18 9-18 9z" {s}/><path d="M{cx-10} {cy+1}v8c6 5 14 5 20 0v-8M{cx+18} {cy-4}v11" {s}/>'
    if kind == "shop":
        return f'<path d="M{cx-17} {cy-6}l3-10h28l3 10M{cx-17} {cy-6}h34M{cx-14} {cy-6}v20h28v-20M{cx-4} {cy+14}v-9h8v9" {s}/>'
    if kind == "chart":
        return f'<path d="M{cx-16} {cy+14}h32M{cx-12} {cy+9}v-8M{cx-3} {cy+9}v-16M{cx+6} {cy+9}v-11M{cx+14} {cy+9}v-22" {s}/>'
    if kind == "lab":
        return f'<path d="M{cx-6} {cy-17}v12l-11 18a3 3 0 0 0 3 4h28a3 3 0 0 0 3-4l-11-18v-12M{cx-9} {cy-17}h18M{cx-9} {cy+6}h18" {s}/>'
    if kind == "apple":
        return f'<path d="M{cx} {cy-6}c-3-3-12-4-14 5-2 9 4 19 8 19 2 0 4-1 6-1s4 1 6 1c4 0 10-10 8-19-2-9-11-8-14-5z" {s}/><path d="M{cx} {cy-7}c0-5 3-9 7-10" {s}/>'
    return f'<rect x="{cx-17}" y="{cy-15}" width="34" height="22" rx="3" {s}/><path d="M{cx-8} {cy+15}h16M{cx} {cy+7}v8" {s}/>'


def slide5():
    parts = [header(5)]
    parts.append(text(72, 232, "Made for", 72, 800, INK))
    parts.append(text(72, 318, "everyone.", 72, 800, G2))
    y = 366
    colors = [G2, "#1B6FB5", "#7A4FC2", "#C4581C", "#3A3F44", "#0E7C86"]
    for (kind, who, line), color in zip(PERSONAS, colors):
        parts.append(f'<g filter="url(#soft)"><rect x="72" y="{y}" width="936" height="130" rx="22" fill="{CARD}"/></g>')
        parts.append(f'<circle cx="138" cy="{y + 65}" r="38" fill="{color}"/>')
        parts.append(persona_glyph(kind, 138, y + 65))
        parts.append(text(204, y + 52, who, 30, 800, INK))
        lines = wrap(line, 23, 760)
        for j, l in enumerate(lines[:2]):
            parts.append(text(204, y + 88 + j * 29, l, 23, 500, MUTED))
        y += 144
    parts.append(footer())
    return svg(1080, 1350, "\n".join(parts))


def slide6():
    parts = [header(6)]
    parts.append(text(72, 232, "Small. Fast.", 72, 800, INK))
    parts.append(text(72, 318, "Free.", 72, 800, G2))
    # big stat
    parts.append(f'<g filter="url(#soft)"><rect x="72" y="370" width="936" height="200" rx="24" fill="{G2}"/></g>')
    parts.append(text(112, 492, "≈ 4 MB", 96, 800, "#FFFFFF"))
    parts.append(text(470, 456, "Windows installer (Mac: ≈ 5 MB).", 28, 700, "#FFFFFF"))
    parts.append(text(470, 496, "About 12 MB once installed —", 26, 400, "#D8F3E4"))
    parts.append(text(470, 532, "a native Rust engine, not a suite.", 26, 400, "#D8F3E4"))
    # comparison
    rows = [
        ("Disk space", "4 GB (Windows) · 10 GB (Mac)¹", "≈ 12 MB"),
        ("Price", "Subscription", "Free"),
        ("Sign-in", "Microsoft account", "No account"),
        ("AutoRecover", "Every 10 minutes (default)", "Every 30 seconds"),
        ("Undo history", "100 steps", "Unlimited"),
    ]
    top = 604
    parts.append(f'<g filter="url(#soft)"><rect x="72" y="{top}" width="936" height="{76 + len(rows) * 96}" rx="24" fill="{CARD}"/></g>')
    parts.append(text(104, top + 50, "", 20, 700, MUTED))
    parts.append(text(360, top + 50, "Microsoft 365", 24, 800, MUTED))
    parts.append(f'<rect x="720" y="{top + 16}" width="264" height="50" rx="12" fill="{GREEN_BG}"/>')
    parts.append(text(852, top + 50, "Sheets", 24, 800, G2, "middle"))
    for i, (what, ms, us) in enumerate(rows):
        ry = top + 76 + i * 96
        parts.append(f'<line x1="104" y1="{ry}" x2="976" y2="{ry}" stroke="{LINE}" stroke-width="2"/>')
        parts.append(text(104, ry + 58, what, 24, 700, INK))
        ms_lines = wrap(ms, 21, 330)
        for j, l in enumerate(ms_lines[:2]):
            parts.append(text(360, ry + (48 if len(ms_lines) > 1 else 58) + j * 27, l, 21, 500, MUTED))
        parts.append(text(852, ry + 58, us, 25, 800, G2, "middle"))
    parts.append(text(72, 1214, "¹ Microsoft 365 system requirements (Microsoft Support). Sheets figures: v0.4 downloads and install size.", 17, 500, MUTED))
    parts.append(footer())
    return svg(1080, 1350, "\n".join(parts))


def slide7():
    steps = [("1", "Download the installer", "Windows 10/11 · macOS (Apple Silicon & Intel)"),
             ("2", "Open any .xlsx or CSV file", "Your files stay normal Excel files"),
             ("3", "Tell me what to build next", "The roadmap is built from your feedback")]
    parts = ['<rect width="1080" height="1350" fill="url(#dark)"/>',
             f'<circle cx="960" cy="1180" r="300" fill="{G3}" opacity="0.16"/>',
             header(7, dark=True)]
    parts.append(text(72, 290, "Try it free.", 116, 800, "#FFFFFF"))
    parts.append(text(72, 360, "Takes a minute. Needs no account.", 34, 500, "#D8F3E4"))
    y = 430
    for n, title, sub in steps:
        parts.append(f'<rect x="72" y="{y}" width="936" height="128" rx="22" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>')
        parts.append(f'<circle cx="138" cy="{y + 64}" r="34" fill="{MINT}"/>')
        parts.append(text(138, y + 77, n, 34, 800, G1, "middle"))
        parts.append(text(200, y + 56, title, 32, 800, "#FFFFFF"))
        parts.append(text(200, y + 96, sub, 23, 500, "#BFE6D0"))
        y += 148
    parts.append(text(72, 928, "DOWNLOAD", 22, 800, MINT, extra='letter-spacing="3"'))
    parts.append(f'<rect x="72" y="950" width="936" height="96" rx="20" fill="#FFFFFF"/>')
    parts.append(text(540, 1010, "github.com/Dipendra-creator/free-microsoft-excel", 30, 700, G1, "middle", family=MONO))
    parts.append(text(72, 1110, "Excel and Microsoft 365 are trademarks of Microsoft Corporation.", 19, 500, "#A9DDBF"))
    parts.append(text(72, 1138, "Sheets is an independent project and is not affiliated with Microsoft.", 19, 500, "#A9DDBF"))
    parts.append(footer(dark=True, cta="Link in the comments ↓"))
    return svg(1080, 1350, "\n".join(parts), G1)


def banner():
    clip, window = screenshot_or_mock(640, 96, 620, 440, "shotb", "xMinYMin")
    body = f"""
<rect width="1200" height="627" fill="url(#dark)"/>
<circle cx="120" cy="560" r="200" fill="{G4}" opacity="0.10"/>
{logo(60, 56, 52)}
{text(128, 97, "Sheets", 36, 700, "#FFFFFF")}
{text(60, 212, "A free spreadsheet", 50, 800, "#FFFFFF")}
{text(60, 272, "that opens your", 50, 800, "#FFFFFF")}
{text(60, 332, "Excel files.", 50, 800, MINT)}
{text(60, 392, "Windows & macOS · about 5 MB · No account", 24, 600, "#D8F3E4")}
{text(60, 430, "Never silently changes or loses your data.", 24, 400, "#D8F3E4")}
<rect x="60" y="476" width="360" height="60" rx="30" fill="{MINT}"/>
{text(240, 515, "Download free →", 26, 800, G1, "middle")}
{window}
"""
    return svg(1200, 627, body, G1, clip)


def main():
    os.makedirs(OUT, exist_ok=True)
    slides = [slide1, slide2, slide3, slide4, slide5, slide6, slide7]
    for i, make in enumerate(slides, 1):
        with open(os.path.join(OUT, f"slide-{i}.svg"), "w", encoding="utf-8") as f:
            f.write(make())
    with open(os.path.join(OUT, "banner.svg"), "w", encoding="utf-8") as f:
        f.write(banner())
    print(f"wrote {len(slides)} slides and banner.svg to {OUT}")


if __name__ == "__main__":
    main()
