#!/usr/bin/env python3
"""Builds the README artwork in docs/assets.

  hero.svg                        animated banner (has its own background: one version)
  features-{light,dark}.svg       feature grid
  integrity-{light,dark}.svg      "what you type is what you keep"
  architecture-{light,dark}.svg   how Sheets is built
  download-{windows,macos}.svg    download buttons
  screenshot.png                  the app screenshot in a window frame (needs Chromium and ImageMagick)

Text is converted to outlines (Inter and JetBrains Mono, shaped with HarfBuzz)
so the images look the same everywhere: GitHub shows README images in a
sandbox that doesn't load fonts. The light/dark pairs are picked by the
README's <picture> elements to match the reader's GitHub theme.

Requirements: pip install fonttools uharfbuzz, and the Inter and JetBrains
Mono .ttf files in ~/.fonts (or in the folder named by SHEETS_FONT_DIR).

Usage: python3 docs/assets/build.py [--screenshot path/to/screenshot.png]
"""

import glob
import html
import os
import subprocess
import sys
import tempfile

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.environ.get("SHEETS_FONT_DIR", os.path.expanduser("~/.fonts"))
REPO = "Dipendra-creator/sheets-desktop"

# Brand greens (same as the app icon and the LinkedIn kit)
G1 = "#0B3D23"
G2 = "#107C41"
G3 = "#21A366"
G4 = "#33C481"
MINT = "#7FE0A8"

THEMES = {
    "light": {
        "ink": "#10231A",
        "muted": "#56695E",
        "card": "#F6FAF7",
        "card2": "#FFFFFF",
        "line": "#D5E3DA",
        "tile": "#E3F4EA",
        "accent": G2,
        "accent2": G3,
        "bad": "#B42318",
        "bad_bg": "#FDECEA",
        "bad_line": "#F5C2BD",
        "good": "#0E6B39",
        "good_bg": "#E3F4EA",
        "good_line": "#A9DFC0",
        "label": "#6B7F73",
    },
    "dark": {
        "ink": "#E6EDF3",
        "muted": "#9AA7B0",
        "card": "#111A15",
        "card2": "#0D1117",
        "line": "#2A3A31",
        "tile": "#123222",
        "accent": "#3FD17F",
        "accent2": "#2EA864",
        "bad": "#FF9A8F",
        "bad_bg": "#3A1715",
        "bad_line": "#6B2A24",
        "good": "#6EE3A0",
        "good_bg": "#0F2E1D",
        "good_line": "#1F6B42",
        "label": "#8B9A92",
    },
}


def fmt(v: float) -> str:
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def esc(s: str) -> str:
    return html.escape(s, quote=True)


# ----------------------------------------------------------------------
# Text as outlines
# ----------------------------------------------------------------------


class Font:
    def __init__(self, key: str, filename: str):
        path = os.path.join(FONT_DIR, filename)
        if not os.path.exists(path):
            sys.exit(f"Font not found: {path} (set SHEETS_FONT_DIR)")
        self.key = key
        self.hb = hb.Font(hb.Face(hb.Blob.from_file_path(path)))
        self.tt = TTFont(path)
        self.glyphs = self.tt.getGlyphSet()
        self.order = self.tt.getGlyphOrder()
        self.upem = self.tt["head"].unitsPerEm
        self.paths: dict[int, str] = {}

    def layout(self, text: str, size: float, track: float = 0, feats=None):
        """Glyphs as (glyph id, x, y) in font units, and the advance in px."""
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hb, buf, feats or {})
        scale = size / self.upem
        extra = track / scale
        x, out = 0.0, []
        infos, positions = buf.glyph_infos, buf.glyph_positions
        for i, (info, pos) in enumerate(zip(infos, positions)):
            out.append((info.codepoint, x + pos.x_offset, pos.y_offset))
            x += pos.x_advance + (extra if i < len(infos) - 1 else 0)
        return out, x * scale

    def path(self, gid: int) -> str:
        if gid not in self.paths:
            pen = SVGPathPen(self.glyphs, ntos=lambda v: fmt(v))
            self.glyphs[self.order[gid]].draw(pen)
            self.paths[gid] = pen.getCommands()
        return self.paths[gid]


FONTS = {
    key: Font(key, name)
    for key, name in {
        "r": "Inter-Regular.ttf",
        "m": "Inter-Medium.ttf",
        "sb": "Inter-SemiBold.ttf",
        "b": "Inter-Bold.ttf",
        "xb": "Inter-ExtraBold.ttf",
        "mono": "JetBrainsMono-Medium.ttf",
        "monob": "JetBrainsMono-Bold.ttf",
    }.items()
}
TNUM = {"tnum": True}


class Doc:
    """One SVG file: text runs reuse glyph outlines defined once in <defs>."""

    def __init__(self, w: int, h: int, title: str, desc: str):
        self.w, self.h, self.title, self.desc = w, h, title, desc
        self.used: dict[str, set[int]] = {}
        self.defs: list[str] = []
        self.css: list[str] = []
        self.body: list[str] = []

    def add(self, *parts: str):
        self.body.extend(parts)

    def measure(self, s: str, size: float, font="r", track=0, feats=None) -> float:
        return FONTS[font].layout(s, size, track, feats)[1]

    def text(self, s, x, y, size, font="r", fill="#000", anchor="start", track=0, feats=None, cls="", opacity=None):
        f = FONTS[font]
        glyphs, width = f.layout(s, size, track, feats)
        if anchor == "middle":
            x -= width / 2
        elif anchor == "end":
            x -= width
        k = size / f.upem
        uses = []
        for gid, gx, gy in glyphs:
            if not f.path(gid):
                continue
            self.used.setdefault(font, set()).add(gid)
            yy = f' y="{round(gy)}"' if gy else ""
            uses.append(f'<use href="#{font}{gid}" x="{round(gx)}"{yy}/>')
        attrs = f' class="{cls}"' if cls else ""
        if opacity is not None:
            attrs += f' opacity="{opacity}"'
        return (
            f'<g{attrs} transform="translate({fmt(x)} {fmt(y)}) scale({k:.5f} {-k:.5f})" fill="{fill}">'
            + "".join(uses)
            + "</g>"
        )

    def wrap(self, s: str, size: float, width: float, font="r") -> list[str]:
        lines, cur = [], ""
        for word in filter(None, s.split(" ")):  # no-break spaces stay inside words
            test = f"{cur} {word}".strip()
            if cur and self.measure(test, size, font) > width:
                lines.append(cur)
                cur = word
            else:
                cur = test
        if cur:
            lines.append(cur)
        return lines

    def svg(self) -> str:
        glyph_defs = "".join(
            f'<path id="{key}{gid}" d="{FONTS[key].path(gid)}"/>'
            for key, gids in sorted(self.used.items())
            for gid in sorted(gids)
        )
        style = f"<style>{''.join(self.css)}</style>" if self.css else ""
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" '
            f'height="{self.h}" role="img" aria-labelledby="title desc">'
            f'<title id="title">{esc(self.title)}</title><desc id="desc">{esc(self.desc)}</desc>'
            f"{style}<defs>{''.join(self.defs)}{glyph_defs}</defs>"
            + "\n".join(self.body)
            + "</svg>\n"
        )

    def save(self, name: str):
        with open(os.path.join(HERE, name), "w", encoding="utf-8") as f:
            f.write(self.svg())
        print(f"{name}: {os.path.getsize(os.path.join(HERE, name)) // 1024} KB")


# ----------------------------------------------------------------------
# Shared drawings
# ----------------------------------------------------------------------


def logo(x, y, size):
    """The Sheets app icon, drawn on a 16-unit grid."""
    k = size / 16
    return f"""<g transform="translate({fmt(x)} {fmt(y)}) scale({fmt(k)})">
<rect x="4.5" y="1.5" width="11" height="13" rx="1.5" fill="{G4}"/>
<path d="M4.5 3a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v2.8h-11z" fill="{G3}"/>
<path d="M4.5 10.2h11V13a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 13z" fill="{G2}"/>
<rect x="0.5" y="4" width="8" height="8" rx="1" fill="#0B5C30"/>
<path d="M2.2 5.7h4.6v4.6H2.2zM4.5 5.7v4.6M2.2 8h4.6" stroke="#fff" stroke-width="0.9" fill="none"/>
</g>"""


# Feature icons on a 24-unit grid, drawn with round 2-unit strokes
ICONS = {
    "file": '<path d="M6 2.5h8l4.5 4.5v14.5H5.5V3a.5.5 0 0 1 .5-.5z"/><path d="M14 2.5V7h4.5"/>'
    '<path d="M8.5 11.5h7M8.5 15h7M8.5 18.5h7M12 11.5v7"/>',
    "chart": '<path d="M3 21h18"/><path d="M6.5 17.5v-5M11 17.5V7M15.5 17.5v-7.5M20 17.5V4" stroke-width="3"/>',
    "fill": '<rect x="3.5" y="3" width="9" height="5" rx="1"/><rect x="3.5" y="10" width="9" height="5" rx="1"/>'
    '<rect x="3.5" y="17" width="9" height="4.5" rx="1"/><path d="M17.5 4v14M14 14.5l3.5 3.5 3.5-3.5"/>',
    "keys": '<rect x="2" y="5.5" width="20" height="13" rx="2.5"/>'
    '<path d="M6 9.5h0M9.5 9.5h0M13 9.5h0M16.5 9.5h0M6 12.5h0M9.5 12.5h0M13 12.5h0M16.5 12.5h0M8 15.5h8" '
    'stroke-width="2.2"/>',
    "shield": '<path d="M12 2.5l7.5 3v6c0 4.6-3.2 8.3-7.5 10-4.3-1.7-7.5-5.4-7.5-10v-6z"/>'
    '<path d="M8.5 12l2.5 2.5 4.5-5"/>',
    "history": '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 3.5v4.5h4.5"/><path d="M12 7.5V12l3 2"/>',
    "check": '<path d="M3.5 6l1.8 1.8 3.2-3.3M3.5 12l1.8 1.8 3.2-3.3M3.5 18l1.8 1.8 3.2-3.3"/>'
    '<path d="M11.5 6.5h9M11.5 12.5h9M11.5 18.5h9"/>',
    "update": '<path d="M20 12a8 8 0 0 1-13.8 5.5"/><path d="M4 12a8 8 0 0 1 13.8-5.5"/>'
    '<path d="M18 2.8v3.9h-3.9M6 21.2v-3.9h3.9"/>',
}


def icon(name, x, y, size, color, doc=None):
    if name == "fx":
        # Drawn as text: the formula-bar "fx"
        return doc.text("fx", x + size / 2, y + size * 0.72, size * 0.78, "monob", color, "middle")
    k = size / 24
    return (
        f'<g transform="translate({fmt(x)} {fmt(y)}) scale({fmt(k)})" fill="none" stroke="{color}" '
        f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</g>'
    )


# ----------------------------------------------------------------------
# Hero (animated)
# ----------------------------------------------------------------------

LOOP = 10.0  # seconds
RESET = 9.3  # things fade out here and the loop starts again


class Anim:
    """CSS keyframe animations on a 10-second loop. Every animated element's
    base style is its final state, which is what shows with reduced motion."""

    def __init__(self, doc: Doc):
        self.doc, self.n = doc, 0
        doc.css.append(
            f".an{{animation-duration:{LOOP}s;animation-iteration-count:infinite}}"
            "@media (prefers-reduced-motion:reduce){.an{animation:none!important}}"
        )

    def _add(self, base: str, frames: list[tuple[float, str]], timing="linear") -> str:
        self.n += 1
        name = f"k{self.n}"
        body = "".join(f"{fmt(t / LOOP * 100)}%{{{v}}}" for t, v in frames)
        self.doc.css.append(f".{name}{{{base};animation-name:{name};animation-timing-function:{timing}}}")
        self.doc.css.append(f"@keyframes {name}{{{body}}}")
        return f"an {name}"

    def between(self, t0: float, t1: float, still: bool | None = None) -> str:
        """Shown from t0 to t1 (instant switches, like a selection moving).
        `still`: shown in the final state (default: when it lasts to the end)."""
        final = t1 >= LOOP
        frames = [(0, f"opacity:{1 if t0 == 0 else 0}")]
        if t0 > 0:
            frames.append((t0, "opacity:1"))
        if not final:
            frames.append((t1, "opacity:0"))
        frames.append((LOOP, f"opacity:{1 if final else 0}"))
        shown = final if still is None else still
        return self._add(f"opacity:{1 if shown else 0}", frames, "step-end")

    def appear(self, t: float, fade=0.25) -> str:
        """Fades in at t, stays until the loop resets."""
        return self._add(
            "opacity:1",
            [(0, "opacity:0"), (t, "opacity:0"), (t + fade, "opacity:1"), (RESET, "opacity:1"),
             (RESET + 0.3, "opacity:0"), (LOOP, "opacity:0")],
        )

    def grow(self, t: float, dur=0.55) -> str:
        """Grows up from its bottom edge at t."""
        return self._add(
            "transform-box:fill-box;transform-origin:50% 100%",
            [(0, "transform:scaleY(0)"), (t, "transform:scaleY(0);animation-timing-function:cubic-bezier(.2,.8,.2,1)"),
             (t + dur, "transform:scaleY(1)"), (RESET, "transform:scaleY(1);opacity:1"),
             (RESET + 0.3, "transform:scaleY(1);opacity:0"), (LOOP, "transform:scaleY(0);opacity:0")],
        )

    def typing(self, t0: float, t1: float, width: float, chars: int) -> str:
        """Slides a cover off text one character at a time."""
        w = fmt(width)
        return self._add(
            f"transform:translateX({w}px)",
            [(0, "transform:translateX(0px)"),
             (t0, f"transform:translateX(0px);animation-timing-function:steps({chars},end)"),
             (t1, f"transform:translateX({w}px)"), (LOOP, f"transform:translateX({w}px)")],
        )


def hero():
    W, H = 1200, 540
    d = Doc(
        W, H, "Sheets: the free spreadsheet that opens your Excel files",
        "Sheets for Windows and macOS: about a 4 MB download, open source under the MIT License, "
        "no account, no subscription, no telemetry. The picture shows a Sheets window where a "
        "month column is filled with AutoFill, a SUM formula totals the sales and a chart grows.",
    )
    a = Anim(d)
    d.defs.append(
        f'<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{G1}"/>'
        f'<stop offset="0.62" stop-color="#0D4A2B"/><stop offset="1" stop-color="#126B3C"/></linearGradient>'
        '<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#33C481" stop-opacity="0.35"/>'
        '<stop offset="1" stop-color="#33C481" stop-opacity="0"/></radialGradient>'
        '<pattern id="grid" width="56" height="30" patternUnits="userSpaceOnUse">'
        '<path d="M56 0H0V30" fill="none" stroke="#FFFFFF" stroke-opacity="0.055"/></pattern>'
        f'<clipPath id="card"><rect width="{W}" height="{H}" rx="28"/></clipPath>'
        '<filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">'
        '<feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#021A0D" flood-opacity="0.55"/></filter>'
    )
    d.add('<g clip-path="url(#card)">', f'<rect width="{W}" height="{H}" fill="url(#bg)"/>',
          f'<rect width="{W}" height="{H}" fill="url(#grid)"/>',
          '<circle cx="930" cy="250" r="360" fill="url(#glow)"/>',
          '<circle cx="80" cy="560" r="260" fill="url(#glow)" opacity="0.6"/>')

    # Left: name, promise, facts
    d.add(logo(64, 70, 50), d.text("Sheets", 126, 107, 34, "b", "#FFFFFF"))
    lines = [("The free spreadsheet", "#FFFFFF"), ("that opens your", "#FFFFFF"), ("Excel files.", MINT)]
    size = min(54.0, 532 / max(d.measure(s, 1, "xb", -0.02) for s, _ in lines))
    y = 210
    for s, color in lines:
        d.add(d.text(s, 62, y, size, "xb", color, track=-size * 0.02))
        y += size * 1.13
    y += 8
    d.add(d.text("Windows & macOS  ·  ≈ 4 MB download  ·  Open source", 64, y, 20, "sb", "#CDEFDB"))
    x, y = 64, y + 26
    for chip in ("No account", "No subscription", "No telemetry"):
        tw = d.measure(chip, 17, "sb")
        w = tw + 58
        d.add(f'<rect x="{fmt(x)}" y="{fmt(y)}" width="{fmt(w)}" height="40" rx="20" fill="#FFFFFF" '
              'fill-opacity="0.09" stroke="#FFFFFF" stroke-opacity="0.2"/>',
              f'<path d="M{fmt(x + 18)} {fmt(y + 20.5)}l4 4 8-8.5" fill="none" stroke="{MINT}" stroke-width="2.4" '
              'stroke-linecap="round" stroke-linejoin="round"/>',
              d.text(chip, x + 38, y + 26, 17, "sb", "#FFFFFF"))
        x += w + 10

    # Right: a Sheets window doing AutoFill, a SUM and a chart
    X, Y, WW, WH = 646, 56, 498, 428
    d.defs.append(f'<clipPath id="win"><rect x="{X}" y="{Y}" width="{WW}" height="{WH}" rx="14"/></clipPath>')
    d.add(f'<rect x="{X}" y="{Y}" width="{WW}" height="{WH}" rx="14" fill="#FFFFFF" filter="url(#shadow)"/>',
          '<g clip-path="url(#win)">')
    chrome, grid_line, head_ink = "#F3F5F4", "#E2E7E4", "#5B6660"
    # Title bar
    d.add(f'<rect x="{X}" y="{Y}" width="{WW}" height="38" fill="{chrome}"/>', logo(X + 14, Y + 10, 18),
          d.text("Budget.xlsx - Sheets", X + 42, Y + 24, 13, "m", "#2B332E"))
    cx = X + WW - 24
    d.add(f'<g stroke="#56615B" stroke-width="1.3" fill="none" stroke-linecap="round">'
          f'<path d="M{cx - 5} {Y + 14}l10 10M{cx + 5} {Y + 14}l-10 10"/>'
          f'<rect x="{cx - 41}" y="{Y + 14}" width="10" height="10" rx="1"/>'
          f'<path d="M{cx - 77} {Y + 19}h10"/></g>')
    # Ribbon tabs
    d.add(f'<rect x="{X}" y="{Y + 38}" width="{WW}" height="30" fill="{chrome}"/>')
    tx = X + 14
    for tab in ("File", "Home", "Insert", "Formulas", "Data", "Review"):
        on = tab == "Home"
        d.add(d.text(tab, tx, Y + 58, 12.5, "sb" if on else "m", G2 if on else "#4A544E"))
        tw = d.measure(tab, 12.5, "sb" if on else "m")
        if on:
            d.add(f'<rect x="{fmt(tx)}" y="{Y + 64}" width="{fmt(tw)}" height="2.5" rx="1.2" fill="{G2}"/>')
        tx += tw + 20
    d.add(f'<path d="M{X} {Y + 68.5}H{X + WW}" stroke="{grid_line}"/>')

    # Formula bar
    fy = Y + 76
    d.add(f'<rect x="{X + 10}" y="{fy}" width="54" height="24" rx="4" fill="#FFFFFF" stroke="#D3D9D5"/>',
          d.text("A2", X + 19, fy + 16.5, 12.5, "m", "#26302A", cls=a.between(0, 3.4)),
          d.text("B7", X + 19, fy + 16.5, 12.5, "m", "#26302A", cls=a.between(3.4, LOOP)),
          d.text("fx", X + 75, fy + 16.5, 13, "mono", "#7A857F"),
          f'<rect x="{X + 96}" y="{fy}" width="{WW - 106}" height="24" rx="4" fill="#FFFFFF" stroke="#D3D9D5"/>')
    formula = "=SUM(B2:B6)"
    fw = d.measure(formula, 13, "mono")
    ftx = X + 104
    d.add(f'<g class="{a.between(3.4, RESET + 0.3, still=True)}">',
          d.text("=SUM(", ftx, fy + 16.5, 13, "mono", "#26302A"),
          d.text("B2:B6", ftx + d.measure("=SUM(", 13, "mono"), fy + 16.5, 13, "mono", "#1F6FD1"),
          d.text(")", ftx + d.measure("=SUM(B2:B6", 13, "mono"), fy + 16.5, 13, "mono", "#26302A"),
          "</g>",
          f'<g class="{a.typing(3.5, 4.6, fw + 2, len(formula))}">'
          f'<rect x="{fmt(ftx - 1)}" y="{fy + 3}" width="{fmt(fw + 12)}" height="18" fill="#FFFFFF"/>'
          f'<rect x="{fmt(ftx - 1)}" y="{fy + 5}" width="1.4" height="14" fill="#26302A" class="{a.between(3.4, RESET)}"/>'
          "</g>",
          d.text("Jan", ftx, fy + 16.5, 13, "mono", "#26302A", cls=a.between(0, 3.4)))

    # Grid: row header 30, A 120, B 110, then C and D under the chart
    gy = Y + 108
    cols = [(X, 30, ""), (X + 30, 120, "A"), (X + 150, 110, "B"), (X + 260, 115, "C"), (X + 375, 123, "D")]
    rows = 8
    rh = 28
    top = gy + 24
    bottom = top + rows * rh
    d.add(f'<rect x="{X}" y="{gy}" width="{WW}" height="24" fill="{chrome}"/>',
          f'<rect x="{X}" y="{top}" width="30" height="{rows * rh}" fill="{chrome}"/>')
    for cx0, cw, name in cols[1:]:
        d.add(d.text(name, cx0 + cw / 2, gy + 16.5, 11.5, "m", head_ink, "middle"))
    for r in range(rows):
        d.add(d.text(str(r + 1), X + 15, top + r * rh + 18.5, 11.5, "m", head_ink, "middle"))
    lines = [f"M{X} {gy + 0.5}H{X + WW}"]
    lines += [f"M{X} {top + r * rh + 0.5}H{X + WW}" for r in range(rows + 1)]
    lines += [f"M{cx0 + 0.5} {gy}V{bottom}" for cx0, _, _ in cols[1:]]
    d.add(f'<path d="{" ".join(lines)}" stroke="{grid_line}" fill="none"/>')

    ax, bx = X + 30, X + 150

    def row_y(r):  # top of row r (1-based)
        return top + (r - 1) * rh

    # Header row styled like a table header
    d.add(f'<rect x="{ax + 1}" y="{row_y(1) + 1}" width="229" height="{rh - 1}" fill="#E3F4EA"/>',
          d.text("Month", ax + 9, row_y(1) + 18.5, 13, "sb", G1),
          d.text("Sales", bx + 110 - 9, row_y(1) + 18.5, 13, "sb", G1, "end"))
    sales = [1240, 1580, 1410, 1920, 2180]
    months = ["Jan", "Feb", "Mar", "Apr", "May"]
    fill_at = [0, 1.0, 1.4, 1.8, 2.2]
    for i, (m, v) in enumerate(zip(months, sales)):
        r = i + 2
        cls = a.between(fill_at[i], RESET + 0.3, still=True) if i else ""
        d.add(d.text(m, ax + 9, row_y(r) + 18.5, 13, "r", "#1D2621", cls=cls),
              d.text(f"{v:,}", bx + 110 - 9, row_y(r) + 18.5, 13, "r", "#1D2621", "end", feats=TNUM))
    d.add(f'<path d="M{ax} {row_y(7) + 0.5}H{bx + 110}" stroke="#1D2621" stroke-width="1.2"/>',
          d.text("Total", ax + 9, row_y(7) + 18.5, 13, "sb", "#1D2621"),
          d.text(f"{sum(sales):,}", bx + 110 - 9, row_y(7) + 18.5, 13, "sb", "#1D2621", "end", feats=TNUM,
                 cls=a.appear(4.9)))

    # Selection: A2, then the fill handle drags it down to A6, then B7
    def selection(x, y, w, h, cls, tint=False):
        fill = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{G2}" fill-opacity="0.08"/>' if tint else ""
        return (f'<g class="{cls}">{fill}<rect x="{x + 1}" y="{y + 1}" width="{w - 1}" height="{h - 1}" '
                f'fill="none" stroke="{G2}" stroke-width="2"/>'
                f'<rect x="{x + w - 3.5}" y="{y + h - 3.5}" width="7" height="7" fill="{G2}" stroke="#FFFFFF"/></g>')

    steps = [0, 1.0, 1.4, 1.8, 2.2, 3.4]
    for n in range(5):
        d.add(selection(ax, row_y(2), 120, rh * (n + 1), a.between(steps[n], steps[n + 1]), tint=n > 0))
    d.add(selection(bx, row_y(7), 110, rh, a.between(3.4, LOOP)))
    # AutoFill Options button under the filled range
    ox, oy = ax + 124, row_y(7) + 2
    d.add(f'<g class="{a.between(2.5, 3.4)}"><rect x="{ox}" y="{oy}" width="22" height="18" rx="3" '
          f'fill="#FFFFFF" stroke="#B9C4BE"/><rect x="{ox + 5}" y="{oy + 4}" width="8" height="10" rx="1" '
          f'fill="none" stroke="{G2}" stroke-width="1.3"/><path d="M{ox + 15} {oy + 8}l2.5 2.5 2.5-2.5" '
          f'fill="none" stroke="#56615B" stroke-width="1.2"/></g>')

    # Chart floating over C1:D7
    kx, ky = X + 270, row_y(1) + 6
    kw, kh = WW - 270 - 12, rh * 7 - 12
    d.add(f'<rect x="{kx}" y="{ky}" width="{kw}" height="{kh}" rx="6" fill="#FFFFFF" stroke="#D3DBD6"/>',
          d.text("Sales by month", kx + 12, ky + 21, 12, "sb", "#26302A"))
    base = ky + kh - 24
    ptop = ky + 38
    d.add(f'<path d="M{kx + 12} {base + 0.5}H{kx + kw - 12}" stroke="#AEB9B3"/>',
          f'<path d="M{kx + 12} {fmt((base + ptop) / 2) }H{kx + kw - 12}M{kx + 12} {ptop}H{kx + kw - 12}" '
          'stroke="#EDF1EE"/>')
    slot = (kw - 24) / 5
    for i, v in enumerate(sales):
        bh = (base - ptop) * v / 2200
        bw = slot * 0.56
        x0 = kx + 12 + slot * i + (slot - bw) / 2
        d.add(f'<rect x="{fmt(x0)}" y="{fmt(base - bh)}" width="{fmt(bw)}" height="{fmt(bh)}" rx="2" '
              f'fill="{G3 if i < 4 else G2}" class="{a.grow(5.3 + i * 0.18)}"/>',
              d.text(months[i], x0 + bw / 2, base + 15, 10.5, "m", "#6A7570", "middle"))

    # Sheet tab and status bar
    sy = bottom
    d.add(f'<rect x="{X}" y="{sy}" width="{WW}" height="32" fill="#F8FAF9"/>',
          f'<path d="M{X} {sy + 0.5}H{X + WW}" stroke="{grid_line}"/>',
          d.text("Budget", X + 44, sy + 21, 12.5, "sb", G2),
          f'<rect x="{X + 44}" y="{sy + 26}" width="{fmt(d.measure("Budget", 12.5, "sb"))}" height="2.5" rx="1.2" fill="{G2}"/>',
          f'<circle cx="{X + 112}" cy="{sy + 16}" r="7.5" fill="none" stroke="#8C9791"/>'
          f'<path d="M{X + 108.5} {sy + 16}h7M{X + 112} {sy + 12.5}v7" stroke="#8C9791" stroke-linecap="round"/>')
    st = sy + 32
    d.add(f'<rect x="{X}" y="{st}" width="{WW}" height="{Y + WH - st}" fill="{chrome}"/>',
          d.text("Ready", X + 14, st + 19, 12, "m", "#56615B"))
    saved = "AutoRecover saved"
    sw = d.measure(saved, 12, "m")
    d.add(f'<g class="{a.appear(6.8)}">'
          f'<path d="M{fmt(X + WW - 34 - sw)} {st + 14.5}l3 3 6-6.5" fill="none" stroke="{G3}" stroke-width="1.8" '
          'stroke-linecap="round" stroke-linejoin="round"/>'
          + d.text(saved, X + WW - 16, st + 19, 12, "m", G2, "end") + "</g>")
    d.add("</g>", "</g>")
    d.save("hero.svg")


# ----------------------------------------------------------------------
# Feature grid
# ----------------------------------------------------------------------

FEATURES = [
    ("file", "Your .xlsx stays .xlsx",
     "Opens and saves Excel workbooks, CSV and TSV. Nothing to import, nothing to export."),
    ("fx", "~490 Excel functions",
     "XLOOKUP, FILTER, SORT, UNIQUE, LET and SUMIFS, with autocomplete and argument hints."),
    ("chart", "Charts & PivotTables",
     "Seven chart types that follow your data, and PivotTable summaries built from live formulas."),
    ("fill", "AutoFill & Flash Fill",
     "Drag to continue a series, switch with AutoFill Options, or press Ctrl+E to fill from an example."),
    ("keys", "The shortcuts you know",
     "Ctrl+D, F4, Ctrl+Shift+L, Alt KeyTips and the rest of Excel\u2019s keyboard. F1 lists them all."),
    ("shield", "AutoRecover every 30 s",
     "Every workbook, saved or not. After a crash, a recovery screen brings your work back."),
    ("history", "Version history",
     "Each save keeps the previous version, and “Don’t Save” can be undone for 7 days."),
    ("check", "Check Workbook",
     "Lists formula errors, inconsistent formulas and totals that skip rows, on every sheet."),
    ("update", "Updates itself",
     "When a new version is out, an Update button appears in the title bar. One click installs it."),
]


def features(theme):
    t = THEMES[theme]
    W, gap, cols = 1200, 22, 3
    cw = (W - gap * (cols - 1)) / cols
    pad, title_size, body_size, lead = 28, 24, 19, 28
    probe = Doc(1, 1, "", "")
    width = cw - pad * 2
    max_lines = max(len(probe.wrap(desc, body_size, width)) for _, _, desc in FEATURES)
    title_y = pad + 52 + 44
    ch = title_y + 34 + (max_lines - 1) * lead + pad
    rows = -(-len(FEATURES) // cols)
    H = int(rows * ch + (rows - 1) * gap + 2)
    d = Doc(W, H, "What Sheets can do",
            "; ".join(f"{title}: {desc}" for _, title, desc in FEATURES))
    for i, (ic, title, desc) in enumerate(FEATURES):
        x = (i % cols) * (cw + gap)
        y = (i // cols) * (ch + gap) + 1
        d.add(f'<rect x="{fmt(x + 1)}" y="{fmt(y)}" width="{fmt(cw - 2)}" height="{fmt(ch)}" rx="20" '
              f'fill="{t["card"]}" stroke="{t["line"]}"/>',
              f'<rect x="{fmt(x + pad)}" y="{fmt(y + pad)}" width="52" height="52" rx="14" fill="{t["tile"]}"/>',
              icon(ic, x + pad + 12, y + pad + 12, 28, t["accent"], d),
              d.text(title, x + pad, y + title_y, title_size, "sb", t["ink"]))
        for j, line in enumerate(d.wrap(desc, body_size, width)):
            d.add(d.text(line, x + pad, y + title_y + 34 + j * lead, body_size, "r", t["muted"]))
    d.save(f"features-{theme}.svg")


# ----------------------------------------------------------------------
# Data integrity: what you type is what you keep
# ----------------------------------------------------------------------

INTEGRITY = [
    ("00501", "ZIP code", "501", "leading zeros dropped", "00501", "kept as typed"),
    ("4111111111111111", "16-digit card number", "4.11111E+15", "stored as …1110: last digit lost",
     "4111111111111111", "all 16 digits kept"),
    ("SEPT1", "gene name", "1-Sep", "turned into a date", "SEPT1", "stays text"),
    ("café", "in a UTF-8 CSV file", "cafÃ©", "read with the wrong encoding", "café",
     "encoding detected"),
]


def integrity(theme):
    t = THEMES[theme]
    W, head, rh = 1200, 64, 112
    H = head + rh * len(INTEGRITY) + 12
    d = Doc(W, H, "What you type is what you keep",
            " ".join(f"You type {a} ({b}): Excel shows {c} ({e}); Sheets keeps {f}."
                     for a, b, c, e, f, _ in INTEGRITY))
    c1, c2, c3 = 36, 420, 810
    d.add(f'<rect x="0.5" y="0.5" width="{W - 1}" height="{H - 1}" rx="22" fill="{t["card"]}" stroke="{t["line"]}"/>')
    for x, label, color in ((c1, "YOU TYPE", t["label"]), (c2, "EXCEL SHOWS", t["bad"]), (c3, "SHEETS KEEPS", t["good"])):
        d.add(d.text(label, x, 40, 15, "b", color, track=1.6))
    for i, (typed, what, shown, why, kept, how) in enumerate(INTEGRITY):
        y = head + i * rh
        d.add(f'<path d="M24 {y + 0.5}H{W - 24}" stroke="{t["line"]}"/>')
        d.add(d.text(typed, c1, y + 50, 27, "mono", t["ink"]),
              d.text(what, c1, y + 84, 16, "m", t["muted"]))
        for x, value, note, fg, bg, border, mark in (
            (c2, shown, why, t["bad"], t["bad_bg"], t["bad_line"], "x"),
            (c3, kept, how, t["good"], t["good_bg"], t["good_line"], "ok"),
        ):
            vw = d.measure(value, 25, "mono")
            cw = vw + 70
            d.add(f'<rect x="{x}" y="{y + 16}" width="{fmt(cw)}" height="48" rx="12" fill="{bg}" stroke="{border}"/>')
            mx, my = x + 25, y + 40
            if mark == "x":
                d.add(f'<path d="M{mx - 6} {my - 6}l12 12M{mx + 6} {my - 6}l-12 12" stroke="{fg}" stroke-width="2.6" '
                      'stroke-linecap="round"/>')
            else:
                d.add(f'<path d="M{mx - 7} {my + 0.5}l4.5 4.5 9.5-10" fill="none" stroke="{fg}" stroke-width="2.6" '
                      'stroke-linecap="round" stroke-linejoin="round"/>')
            d.add(d.text(value, x + 48, y + 49, 25, "mono", fg),
                  d.text(note, x, y + 88, 16, "m", t["muted"]))
    d.save(f"integrity-{theme}.svg")


# ----------------------------------------------------------------------
# Architecture
# ----------------------------------------------------------------------

MODULES = [
    ("Session", "Edits, one undo step per action; notes, charts and filters"),
    ("IronCalc engine", "~490 functions, recalculation, .xlsx reading and writing"),
    ("Recovery", "AutoRecover every 30\u00a0s, crash recovery, version history"),
    ("Storage", ".xlsx, .csv and .tsv; encoding detection; atomic saves"),
    ("Updates", "Background checks; signed, verified installs"),
]


def architecture(theme):
    t = THEMES[theme]
    W, H = 1200, 648
    d = Doc(W, H, "How Sheets is built",
            "A React and TypeScript desktop UI talks to a Rust core through Tauri's typed IPC commands. "
            "The Rust core has five parts: " + "; ".join(f"{n}: {s}" for n, s in MODULES) +
            ". Storage reads and writes plain .xlsx and .csv files on your disk; Updates fetches signed "
            "releases from GitHub.")
    d.defs.append(f'<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" '
                  f'orient="auto-start-reverse"><path d="M1 1l8 4-8 4" fill="none" stroke="{t["muted"]}" '
                  'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></marker>')

    def box(x, y, w, h, fill, stroke, rx=20, dash=False):
        dash_attr = ' stroke-dasharray="6 6"' if dash else ""
        return (f'<rect x="{fmt(x)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h)}" rx="{rx}" fill="{fill}" '
                f'stroke="{stroke}"{dash_attr}/>')

    def label(x, y, s, color):
        return d.text(s, x, y, 14, "b", color, track=1.5)

    # UI layer
    d.add(box(1, 1, W - 2, 142, t["card"], t["line"]),
          label(32, 40, "DESKTOP UI", t["label"]),
          d.text("React + TypeScript", 32, 76, 26, "sb", t["ink"]))
    x = 32
    for chip in ("Canvas grid", "Ribbon & KeyTips", "Formula bar", "Dialogs", "SVG charts", "Update button"):
        w = d.measure(chip, 16, "m") + 30
        d.add(box(x, 92, w, 34, t["card2"], t["line"], rx=17), d.text(chip, x + 15, 114, 16, "m", t["muted"]))
        x += w + 10

    # IPC
    mid = W / 2
    d.add(f'<path d="M{mid - 150} 150V222" stroke="{t["muted"]}" stroke-width="1.8" marker-end="url(#arrow)"/>',
          f'<path d="M{mid + 150} 222V150" stroke="{t["muted"]}" stroke-width="1.8" marker-end="url(#arrow)"/>',
          d.text("commands", mid - 164, 192, 15, "m", t["muted"], "end"),
          d.text("screen-ready cells", mid + 164, 192, 15, "m", t["muted"]))
    pill = "Tauri IPC  ·  typed commands"
    pw = d.measure(pill, 16, "sb") + 40
    d.add(box(mid - pw / 2, 168, pw, 36, t["tile"], t["good_line"], rx=18),
          d.text(pill, mid, 192, 16, "sb", t["accent"], "middle"))

    # Rust core
    cy = 230
    d.add(box(1, cy, W - 2, 268, t["good_bg"] if theme == "light" else "#0C1F15", t["good_line"]),
          label(32, cy + 40, "RUST CORE", t["label"]),
          d.text("Tauri 2 + IronCalc", 32, cy + 76, 26, "sb", t["ink"]))
    n = len(MODULES)
    gap = 14
    mw = (W - 64 - gap * (n - 1)) / n
    centers = []
    for i, (name, desc) in enumerate(MODULES):
        x = 32 + i * (mw + gap)
        centers.append(x + mw / 2)
        d.add(box(x, cy + 98, mw, 146, t["card2"], t["line"], rx=16),
              d.text(name, x + 18, cy + 132, 19, "sb", t["ink"]))
        for j, line in enumerate(d.wrap(desc, 15.5, mw - 36)):
            d.add(d.text(line, x + 18, cy + 160 + j * 22, 15.5, "r", t["muted"]))

    # Outside world
    by = 562
    for ci, name, desc, arrow_up in ((3, "Your files", "plain .xlsx and .csv files", False),
                                     (4, "GitHub Releases", "signed update files", True)):
        x = centers[ci] - mw / 2
        assert d.measure(desc, 14.5) <= mw - 36, desc
        path = (f'M{fmt(centers[ci])} {by - 4}V{cy + 250}' if arrow_up else f'M{fmt(centers[ci])} {cy + 250}V{by - 4}')
        d.add(f'<path d="{path}" stroke="{t["muted"]}" stroke-width="1.8" marker-end="url(#arrow)"'
              + ('' if arrow_up else ' marker-start="url(#arrow)"') + "/>",
              box(x, by, mw, 84, t["card"], t["line"], rx=16, dash=True),
              d.text(name, x + 18, by + 34, 18, "sb", t["ink"]),
              d.text(desc, x + 18, by + 60, 14.5, "r", t["muted"]))
    d.add(label(32, by + 34, "OUTSIDE THE APP", t["label"]),
          d.text("Nothing leaves your computer except the update check.", 32, by + 62, 16, "r", t["muted"]))
    d.save(f"architecture-{theme}.svg")


# ----------------------------------------------------------------------
# Download buttons
# ----------------------------------------------------------------------


def button(name, title, sub):
    size, sub_size = 21, 14
    tw = max(FONTS["sb"].layout(title, size)[1], FONTS["m"].layout(sub, sub_size)[1])
    W, H = int(tw + 96), 72
    d = Doc(W, H, title, sub)
    d.defs.append(f'<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{G2}"/>'
                  f'<stop offset="1" stop-color="#0B5C30"/></linearGradient>')
    d.add(f'<rect width="{W}" height="{H}" rx="16" fill="url(#bg)"/>',
          f'<rect x="0.5" y="0.5" width="{W - 1}" height="{H - 1}" rx="15.5" fill="none" stroke="#FFFFFF" '
          'stroke-opacity="0.18"/>',
          '<circle cx="38" cy="36" r="20" fill="#FFFFFF" fill-opacity="0.14"/>',
          f'<path d="M38 25v15M31.5 34l6.5 6.5 6.5-6.5M29 47h18" fill="none" stroke="#FFFFFF" stroke-width="2.4" '
          'stroke-linecap="round" stroke-linejoin="round"/>',
          d.text(title, 72, 33, size, "sb", "#FFFFFF"),
          d.text(sub, 72, 54, sub_size, "m", "#CDEFDB"))
    d.save(f"download-{name}.svg")


# ----------------------------------------------------------------------
# Screenshot in a window frame
# ----------------------------------------------------------------------


def chrome_path():
    for pattern in ["/opt/pw-browsers/chromium-*/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/google-chrome"]:
        found = sorted(glob.glob(pattern))
        if found:
            return found[-1]
    return None


def framed_screenshot(src):
    exe = chrome_path()
    if not exe:
        print("Chromium not found: screenshot.png not rebuilt")
        return
    from struct import unpack

    with open(src, "rb") as f:
        head = f.read(24)
    w, h = unpack(">II", head[16:24])
    pad = 44
    page = (
        "<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:transparent}"
        f"img{{display:block;margin:{pad // 2}px {pad}px {pad + 16}px;width:{w}px;height:{h}px;border-radius:12px;"
        "border:1px solid rgba(0,0,0,.14);box-shadow:0 22px 50px -12px rgba(0,30,15,.38),0 4px 14px rgba(0,30,15,.12)}"
        f"</style><img src='file://{os.path.abspath(src)}'>"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
        f.write(page)
    out = os.path.join(HERE, "screenshot.png")
    size = (w + pad * 2, h + pad + pad // 2 + 16 + 2)
    subprocess.run(
        [exe, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
         "--default-background-color=00000000", f"--window-size={size[0]},{size[1] + 240}",
         f"--screenshot={out}", f"file://{f.name}"],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    subprocess.run(["convert", out, "-crop", f"{size[0]}x{size[1]}+0+0", "+repage", out], check=True)
    os.remove(f.name)
    print(f"screenshot.png: {os.path.getsize(out) // 1024} KB")


def main():
    hero()
    for theme in THEMES:
        features(theme)
        integrity(theme)
        architecture(theme)
    button("windows", "Download for Windows", "Windows 10 / 11  ·  64-bit  ·  ≈ 4 MB")
    button("macos", "Download for macOS", "Apple Silicon & Intel  ·  ≈ 5 MB")
    if "--screenshot" in sys.argv:
        framed_screenshot(sys.argv[sys.argv.index("--screenshot") + 1])


if __name__ == "__main__":
    main()
