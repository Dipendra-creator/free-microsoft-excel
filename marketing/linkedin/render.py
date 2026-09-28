#!/usr/bin/env python3
"""Renders the SVGs to PNG (for LinkedIn image posts) and to one PDF (for a
LinkedIn document / carousel post) with headless Chromium.

Usage: python3 render.py [path/to/chrome]
"""

import glob
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "svg")
PNG = os.path.join(HERE, "png")


def chrome() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]
    for pattern in ["/opt/pw-browsers/chromium-*/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/google-chrome"]:
        found = sorted(glob.glob(pattern))
        if found:
            return found[-1]
    sys.exit("Chromium not found: pass its path as the first argument")


def run(args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    exe = chrome()
    os.makedirs(PNG, exist_ok=True)
    base = [exe, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1"]
    sizes = {"banner": (1200, 627)}
    names = sorted(os.path.splitext(f)[0] for f in os.listdir(SVG) if f.endswith(".svg"))
    for name in names:
        w, h = sizes.get(name, (1080, 1350))
        out = os.path.join(PNG, f"{name}.png")
        # The headless viewport is shorter than the window: render taller, then crop
        run(base + [f"--window-size={w},{h + 240}", f"--screenshot={out}", f"file://{os.path.join(SVG, name + '.svg')}"])
        run(["convert", out, "-crop", f"{w}x{h}+0+0", "+repage", out])
        print("png", out)

    # One PDF page per slide, kept as vectors
    slides = [n for n in names if n.startswith("slide-")]
    pages = "\n".join(f'<img src="svg/{n}.svg">' for n in slides)
    page = os.path.join(HERE, "carousel.html")
    with open(page, "w", encoding="utf-8") as f:
        f.write(
            "<!doctype html><meta charset=utf-8><style>"
            "@page{size:1080px 1350px;margin:0}html,body{margin:0}"
            "img{display:block;width:1080px;height:1350px;page-break-after:always}"
            "</style>" + pages
        )
    pdf = os.path.join(HERE, "sheets-linkedin-carousel.pdf")
    run(base + ["--no-pdf-header-footer", f"--print-to-pdf={pdf}", f"file://{page}"])
    os.remove(page)
    print("pdf", pdf)


if __name__ == "__main__":
    main()
