// KeyTips: press Alt (or F10) and letters appear on the ribbon tabs; type one
// to open the tab, then the letters on its buttons (Excel's Alt, H, V, V…).

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { WorkbookController } from "../controller";
import { useCtl } from "../hooks";

export const TAB_KEYS: Record<string, string> = {
  File: "F",
  Home: "H",
  Insert: "N",
  "Page Layout": "P",
  Formulas: "M",
  Data: "A",
  Review: "R",
  View: "W",
  Help: "Y",
};

/** Excel's own KeyTips for the most used commands (label prefix → keys). */
const KNOWN: [string, string][] = [
  ["Paste", "V"],
  ["Cut", "X"],
  ["Copy", "C"],
  ["Format Painter", "FP"],
  ["Font Size", "FS"],
  ["Font", "FF"],
  ["Increase Font Size", "FG"],
  ["Decrease Font Size", "FK"],
  ["Bold", "1"],
  ["Italic", "2"],
  ["Underline", "3"],
  ["Borders", "B"],
  ["Fill Color", "H"],
  ["Font Color", "FC"],
  ["Top Align", "AT"],
  ["Middle Align", "AM"],
  ["Bottom Align", "AB"],
  ["Orientation", "FQ"],
  ["Wrap Text", "W"],
  ["Align Left", "AL"],
  ["Center", "AC"],
  ["Align Right", "AR"],
  ["Decrease Indent", "5"],
  ["Increase Indent", "6"],
  ["Merge", "M"],
  ["Number Format", "N"],
  ["Accounting", "AN"],
  ["Percent", "P"],
  ["Comma", "K"],
  ["Increase Decimal", "0"],
  ["Decrease Decimal", "9"],
  ["Conditional Formatting", "L"],
  ["Format as Table", "T"],
  ["Cell Styles", "J"],
  ["Insert", "I"],
  ["Delete", "D"],
  ["Format", "O"],
  ["AutoSum", "U"],
  ["Fill", "FI"],
  ["Clear", "E"],
  ["Sort", "S"],
  ["Find", "FD"],
  ["Flash Fill", "FF"],
  ["Text to Columns", "E"],
  ["Remove Duplicates", "M"],
  ["Filter", "T"],
  ["Freeze Panes", "F"],
  ["Zoom", "Q"],
  ["Gridlines", "VG"],
  ["Headings", "VH"],
  ["Formula Bar", "VF"],
  ["New Note", "N"],
  ["Check Workbook", "K"],
  ["PivotTable", "V"],
  ["Recommended Charts", "R"],
  ["Insert Function", "F"],
  ["Name Manager", "N"],
  ["Show Formulas", "H"],
  ["Calculate Now", "B"],
  ["Link", "I"],
];

interface Tip {
  el: HTMLElement;
  keys: string;
  x: number;
  y: number;
}

function labelOf(el: HTMLElement): string {
  const raw = el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "";
  return raw.replace(/\s*\(.*\)\s*$/, "").replace(/\s+/g, " ").trim();
}

/** Assigns unique KeyTips to the buttons of the open ribbon tab. */
function controlTips(): Tip[] {
  const root = document.querySelector(".ribbon-content");
  if (!root) return [];
  const els = Array.from(root.querySelectorAll<HTMLElement>("button, input, select")).filter(
    (el) => !el.classList.contains("ribbon-collapse") && !(el as HTMLButtonElement).disabled && el.offsetParent !== null,
  );
  const used = new Set<string>();
  const assigned = new Map<HTMLElement, string>();
  const taken = (k: string) => used.has(k) || [...used].some((u) => u.startsWith(k) || k.startsWith(u));
  // Excel's KeyTips first, then letters from the label
  for (const el of els) {
    const label = labelOf(el).toLowerCase();
    // The most specific name wins ("Font Color" over "Font")
    const known = KNOWN.filter(([name]) => label === name.toLowerCase() || label.startsWith(`${name.toLowerCase()} `)).sort(
      (a, b) => b[0].length - a[0].length,
    )[0];
    if (known && !taken(known[1])) {
      used.add(known[1]);
      assigned.set(el, known[1]);
    }
  }
  for (const el of els) {
    if (assigned.has(el)) continue;
    const words = labelOf(el).toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(" ").filter(Boolean);
    const letters = words.join("");
    const candidates = [
      ...(words.length > 1 ? [words[0][0] + words[1][0]] : []),
      ...[...letters].slice(1).map((ch) => letters[0] + ch),
      ...["Y", "Z", "Q", "J"].flatMap((a) => [...letters].map((ch) => a + ch)),
    ].filter((k) => k.length === 2);
    const single = letters[0];
    let keys = single && !taken(single) && words.length === 1 && letters.length > 0 ? single : candidates.find((k) => !taken(k));
    if (!keys) {
      let n = 1;
      while (taken(String(n))) n++;
      keys = String(n);
    }
    used.add(keys);
    assigned.set(el, keys);
  }
  return els.map((el) => {
    const r = el.getBoundingClientRect();
    return { el, keys: assigned.get(el)!, x: r.left + r.width / 2, y: r.bottom - 6 };
  });
}

function tabTips(): Tip[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".ribbon-tabs .ribbon-tab")).map((el) => {
    const r = el.getBoundingClientRect();
    return { el, keys: TAB_KEYS[el.textContent?.trim() ?? ""] ?? "", x: r.left + r.width / 2, y: r.bottom - 4 };
  });
}

export function KeyTips({
  ctl,
  tab,
  onTab,
  onFile,
}: {
  ctl: WorkbookController;
  tab: string;
  onTab: (tab: string) => void;
  onFile: () => void;
}) {
  const level = useCtl(ctl, (c) => c.keyTips);
  const [typed, setTyped] = useState("");
  const [tips, setTips] = useState<Tip[]>([]);

  useLayoutEffect(() => {
    setTyped("");
    if (level === "tabs") setTips(tabTips());
    else if (level === "controls") {
      // The tab's buttons render on the next frame
      const id = requestAnimationFrame(() => setTips(controlTips()));
      return () => cancelAnimationFrame(id);
    } else setTips([]);
  }, [level, tab]);

  useEffect(() => {
    if (!level) return;
    const close = () => ctl.setKeyTips(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Alt" || e.key === "Shift" || e.key === "Control" || e.key === "Meta") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        ctl.setKeyTips(level === "controls" ? "tabs" : null);
        if (level === "tabs") ctl.ui?.focusGrid();
        return;
      }
      if (e.key === "F10") {
        close();
        ctl.ui?.focusGrid();
        return;
      }
      if (e.key.length !== 1) return;
      const next = typed + e.key.toUpperCase();
      const matches = tips.filter((t) => t.keys && t.keys.startsWith(next));
      if (!matches.length) return;
      const exact = matches.find((t) => t.keys === next);
      if (!exact) {
        setTyped(next);
        return;
      }
      if (level === "tabs") {
        const name = exact.el.textContent?.trim() ?? "";
        if (name === "File") {
          close();
          onFile();
        } else {
          onTab(name);
          ctl.setKeyTips("controls");
        }
        return;
      }
      close();
      if (exact.el instanceof HTMLInputElement || exact.el instanceof HTMLSelectElement) {
        exact.el.focus();
        if (exact.el instanceof HTMLInputElement) exact.el.select();
      } else exact.el.click();
    };
    const onDown = () => close();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("blur", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("blur", onDown);
    };
  }, [level, tips, typed, ctl, onFile, onTab]);

  if (!level || !tips.length) return null;
  return createPortal(
    <div className="keytips">
      {tips
        .filter((t) => t.keys && t.keys.startsWith(typed))
        .map((t, i) => (
          <span key={i} className="keytip" style={{ left: t.x, top: t.y }}>
            {t.keys}
          </span>
        ))}
    </div>,
    document.body,
  );
}
