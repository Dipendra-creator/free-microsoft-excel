// Keyboard shortcuts reference (F1 / Help), plus the Paste Name (F3) and
// Create Names from Selection (Ctrl+Shift+F3) dialogs.

import { useEffect, useMemo, useState } from "react";
import { api, type DefinedName, type Rect } from "../../api";
import { Dialog } from "../../components/Dialog";
import { colName, rect } from "../../lib/a1";
import { keyLabel } from "../../lib/platform";
import type { WorkbookController } from "../controller";

export const SHORTCUT_GROUPS: [string, [string, string][]][] = [
  [
    "Workbook",
    [
      ["Ctrl+N", "New workbook"],
      ["Ctrl+O / Ctrl+F12", "Open"],
      ["Ctrl+S / Shift+F12", "Save"],
      ["F12 / Ctrl+Shift+S", "Save As"],
      ["Ctrl+P / Ctrl+F2", "Print / Save as PDF"],
      ["Ctrl+W / Ctrl+F4", "Close the workbook"],
      ["Ctrl+Tab / Ctrl+F6", "Next workbook window"],
      ["Ctrl+PageDown / Ctrl+PageUp", "Next / previous sheet"],
      ["Shift+F11 / Alt+Shift+F1", "Insert a new sheet"],
      ["Alt or F10", "Show KeyTips for the ribbon (then type the letters)"],
      ["Alt+Q", "Search commands"],
      ["Ctrl+F1", "Collapse or pin the ribbon"],
      ["Ctrl+Shift+U", "Expand or collapse the formula bar"],
      ["Ctrl+Alt+= / Ctrl+Alt+-", "Zoom in / out"],
      ["F1", "Keyboard shortcuts"],
    ],
  ],
  [
    "Move around",
    [
      ["Arrow keys", "Move one cell"],
      ["Ctrl+Arrow", "Edge of the data region"],
      ["End, then Arrow", "Edge of the data region (End mode)"],
      ["Home / Ctrl+Home", "Start of the row / top-left cell"],
      ["Ctrl+End", "Last used cell"],
      ["PageDown / PageUp", "One screen down / up"],
      ["Alt+PageDown / Alt+PageUp", "One screen right / left"],
      ["Tab / Shift+Tab", "Next / previous cell (within a selection)"],
      ["Enter / Shift+Enter", "Next / previous row (within a selection)"],
      ["Ctrl+G / F5", "Go To"],
      ["Ctrl+[", "Go to the cells a formula refers to"],
      ["Ctrl+Backspace", "Scroll to the active cell"],
    ],
  ],
  [
    "Select",
    [
      ["Shift+Arrow", "Extend the selection"],
      ["Ctrl+Shift+Arrow", "Extend to the edge of the data"],
      ["Ctrl+Shift+Home / End", "Extend to the first / last used cell"],
      ["F8", "Extend Selection mode (arrows extend)"],
      ["Ctrl+A", "Current region, then the whole sheet"],
      ["Ctrl+Shift+Space", "Whole sheet"],
      ["Ctrl+Shift+*", "Current region"],
      ["Ctrl+Space / Shift+Space", "Entire column / row"],
      ["Shift+Backspace", "Only the active cell"],
      ["Ctrl+.", "Move to the next corner of the selection"],
    ],
  ],
  [
    "Edit",
    [
      ["F2", "Edit the active cell"],
      ["Esc", "Cancel the entry"],
      ["Alt+Enter", "New line in the cell"],
      ["Ctrl+Enter", "Fill the selection with the entry"],
      ["Ctrl+Z / Ctrl+Y", "Undo / Redo (Ctrl+Y repeats when there is nothing to redo)"],
      ["F4", "Repeat the last action"],
      ["Ctrl+C / Ctrl+X / Ctrl+V", "Copy / Cut / Paste"],
      ["Ctrl+Alt+V", "Paste Special"],
      ["Ctrl+Shift+V", "Paste values"],
      ["Ctrl+D / Ctrl+R", "Fill down / right"],
      ["Ctrl+E", "Flash Fill"],
      ["Ctrl+drag fill handle", "Fill series instead of copy (and the reverse)"],
      ["Double-click fill handle", "Fill down to the end of the data"],
      ["Ctrl+'", "Copy the formula from the cell above"],
      ["Ctrl+Shift+\"", "Copy the value from the cell above"],
      ["Alt+Down", "Pick from the column's entries"],
      ["Ctrl+; / Ctrl+Shift+;", "Insert today's date / the time"],
      ["Ctrl+K", "Insert link"],
      ["Shift+F2", "New / edit note"],
      ["Delete / Backspace", "Clear the cells / clear and edit"],
      ["Ctrl++ / Ctrl+-", "Insert / delete cells"],
      ["Ctrl+F / Ctrl+H", "Find / Replace"],
      ["Shift+F4", "Find next"],
    ],
  ],
  [
    "While editing",
    [
      ["F4", "Cycle absolute / relative reference"],
      ["Arrow keys (after = + , ( )", "Point to a cell"],
      ["Tab", "Accept the function suggestion"],
      ["Ctrl+A / Ctrl+Shift+A", "Function arguments dialog / type argument names"],
      ["F3", "Paste a defined name"],
      ["Ctrl+Delete", "Delete to the end of the line"],
      ["Ctrl+Shift+Enter", "Enter the formula (arrays spill automatically)"],
    ],
  ],
  [
    "Format",
    [
      ["Ctrl+1", "Format Cells"],
      ["Ctrl+Shift+F / Ctrl+Shift+P", "Format Cells – Font"],
      ["Ctrl+B / Ctrl+I / Ctrl+U", "Bold / Italic / Underline"],
      ["Ctrl+5", "Strikethrough"],
      ["Ctrl+Shift+~", "General number format"],
      ["Ctrl+Shift+$", "Currency"],
      ["Ctrl+Shift+%", "Percent"],
      ["Ctrl+Shift+^", "Scientific"],
      ["Ctrl+Shift+#", "Date"],
      ["Ctrl+Shift+@", "Time"],
      ["Ctrl+Shift+!", "Number with thousands separator"],
      ["Ctrl+Shift+& / Ctrl+Shift+_", "Outline border / remove borders"],
      ["Ctrl+9 / Ctrl+Shift+9", "Hide / unhide rows"],
      ["Ctrl+0 / Ctrl+Shift+0", "Hide / unhide columns"],
      ["Ctrl+T / Ctrl+L", "Format as Table"],
    ],
  ],
  [
    "Formulas and data",
    [
      ["Alt+=", "AutoSum"],
      ["Shift+F3", "Insert Function"],
      ["Ctrl+F3 / Ctrl+Shift+F3", "Name Manager / create names from selection"],
      ["Ctrl+`", "Show formulas"],
      ["F9 / Shift+F9 / Ctrl+Alt+F9", "Calculate now"],
      ["Ctrl+Shift+L", "Filter on / off"],
      ["Alt+F1 / F11", "Insert chart"],
      ["Shift+F10 / Menu key", "Context menu"],
    ],
  ],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return SHORTCUT_GROUPS.map(([name, items]) => [
      name,
      items.filter(([k, d]) => !needle || k.toLowerCase().includes(needle) || d.toLowerCase().includes(needle) || keyLabel(k).toLowerCase().includes(needle)),
    ] as [string, [string, string][]]).filter(([, items]) => items.length);
  }, [q]);
  return (
    <Dialog title="Keyboard Shortcuts" onClose={onClose} width={640} onSubmit={onClose} footer={<button type="submit" className="btn primary">Close</button>}>
      <input className="shortcut-search" placeholder="Search shortcuts" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
      <div className="shortcut-groups">
        {groups.map(([name, items]) => (
          <section key={name}>
            <h4>{name}</h4>
            <div className="shortcut-list">
              {items.map(([k, d]) => (
                <div key={k + d}>
                  <kbd>{keyLabel(k)}</kbd>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
        {!groups.length && <p className="muted">No shortcut matches "{q}".</p>}
      </div>
    </Dialog>
  );
}

// ----------------------------------------------------------------------
// Paste Name (F3)
// ----------------------------------------------------------------------

export function PasteNameDialog({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const [names, setNames] = useState<DefinedName[] | null>(null);
  const [sel, setSel] = useState(0);
  useEffect(() => {
    api.names(ctl.id).then(
      (list) => setNames(list.filter((n) => n.scope === null || n.scope === ctl.sheet)),
      () => setNames([]),
    );
  }, [ctl]);
  const paste = () => {
    const n = names?.[sel];
    onClose();
    if (!n) return;
    if (ctl.edit) ctl.insertText(n.name);
    else ctl.startEdit("enter", `=${n.name}`);
  };
  return (
    <Dialog
      title="Paste Name"
      onClose={onClose}
      width={360}
      onSubmit={paste}
      footer={
        <>
          <button type="submit" className="btn primary" disabled={!names?.length}>
            OK
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="fc-label">Paste name</div>
      <div className="name-pick-list" role="listbox">
        {names === null && <div className="muted">Loading…</div>}
        {names?.length === 0 && <div className="muted">This workbook has no defined names. Use Ctrl+F3 or Ctrl+Shift+F3 to create some.</div>}
        {names?.map((n, i) => (
          <div
            key={`${n.name}-${n.scope}`}
            role="option"
            aria-selected={i === sel}
            className={`name-pick ${i === sel ? "active" : ""}`}
            onClick={() => setSel(i)}
            onDoubleClick={paste}
          >
            <b>{n.name}</b>
            <span className="muted">{n.formula}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

// ----------------------------------------------------------------------
// Create Names from Selection (Ctrl+Shift+F3)
// ----------------------------------------------------------------------

function quoteSheet(name: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

/** Excel turns labels into valid names: spaces → _, a leading digit gets _. */
export function nameFromLabel(label: string): string | null {
  let n = label.trim().replace(/[^\p{L}\p{N}_.\\]+/gu, "_").replace(/^_+|_+$/g, "");
  if (!n) return null;
  if (/^[\p{N}.]/u.test(n)) n = `_${n}`;
  // Names that look like cell references (A1, R1C1) are not allowed
  if (/^[A-Za-z]{1,3}\d+$/.test(n) || /^[rRcC]$/.test(n) || /^[rR]\d*[cC]\d*$/.test(n)) n = `_${n}`;
  return n.slice(0, 255);
}

function absolute(r: Rect) {
  const a = `$${colName(r.c1)}$${r.r1}`;
  return r.r1 === r.r2 && r.c1 === r.c2 ? a : `${a}:$${colName(r.c2)}$${r.r2}`;
}

export function CreateNamesDialog({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const range = ctl.usedClamp(ctl.range);
  const wide = range.c2 - range.c1 >= range.r2 - range.r1;
  const [top, setTop] = useState(wide || range.c1 === range.c2);
  const [left, setLeft] = useState(!wide && range.c1 !== range.c2);
  const [bottom, setBottom] = useState(false);
  const [right, setRight] = useState(false);

  const create = async () => {
    onClose();
    try {
      const chunk = await api.cells(ctl.id, ctl.sheet, range, false);
      const text = new Map<string, string>();
      for (const [r, c, t] of chunk.cells) text.set(`${r},${c}`, t);
      const label = (r: number, c: number) => text.get(`${r},${c}`) ?? "";
      const body = rect(top ? range.r1 + 1 : range.r1, left ? range.c1 + 1 : range.c1, bottom ? range.r2 - 1 : range.r2, right ? range.c2 - 1 : range.c2);
      if (body.r1 > body.r2 || body.c1 > body.c2) return;
      const sheet = quoteSheet(ctl.sheetName);
      const wanted: [string, Rect][] = [];
      for (let c = body.c1; c <= body.c2; c++) {
        if (top) wanted.push([label(range.r1, c), rect(body.r1, c, body.r2, c)]);
        if (bottom) wanted.push([label(range.r2, c), rect(body.r1, c, body.r2, c)]);
      }
      for (let r = body.r1; r <= body.r2; r++) {
        if (left) wanted.push([label(r, range.c1), rect(r, body.c1, r, body.c2)]);
        if (right) wanted.push([label(r, range.c2), rect(r, body.c1, r, body.c2)]);
      }
      const existing = new Set((await api.names(ctl.id)).map((n) => n.name.toLowerCase()));
      let created = 0;
      const skipped: string[] = [];
      for (const [raw, target] of wanted) {
        const name = nameFromLabel(raw);
        if (!name || existing.has(name.toLowerCase())) {
          if (raw.trim()) skipped.push(raw.trim());
          continue;
        }
        try {
          await ctl.setInfo(await api.addName(ctl.id, name, null, `=${sheet}!${absolute(target)}`));
          existing.add(name.toLowerCase());
          created++;
        } catch {
          skipped.push(raw.trim());
        }
      }
      if (skipped.length) {
        ctl.ui?.error(`Created ${created} name${created === 1 ? "" : "s"}. Skipped (empty, invalid or already defined): ${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? "…" : ""}`);
      }
    } catch (e) {
      ctl.fail(e);
    }
  };

  const box = (label: string, v: boolean, set: (v: boolean) => void) => (
    <label className="fc-row check">
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  );
  return (
    <Dialog
      title="Create Names from Selection"
      onClose={onClose}
      width={340}
      onSubmit={create}
      footer={
        <>
          <button type="submit" className="btn primary" disabled={!top && !left && !bottom && !right}>
            OK
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <fieldset>
        <legend>Create names from values in the:</legend>
        {box("Top row", top, setTop)}
        {box("Left column", left, setLeft)}
        {box("Bottom row", bottom, setBottom)}
        {box("Right column", right, setRight)}
      </fieldset>
    </Dialog>
  );
}
