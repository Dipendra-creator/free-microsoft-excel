// Excel keyboard behaviour for the grid (not editing) and the cell editor.

import { LAST_COL, LAST_ROW, rect } from "../lib/a1";
import { accountingFmt, currencyFmt, shortDate } from "../lib/formats";
import type { WorkbookController } from "./controller";

function isPrintable(e: KeyboardEvent) {
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}

type Dir = "up" | "down" | "left" | "right";

function arrowDir(key: string): Dir | null {
  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
  }
  return null;
}

const STEP: Record<Dir, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

/** Keys while the grid has focus and no edit is in progress. Returns true if handled. */
export function handleGridKey(ctl: WorkbookController, e: KeyboardEvent): boolean {
  const ui = ctl.ui;
  const ctrl = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;
  const alt = e.altKey;
  const key = e.key;
  const dir = arrowDir(key);
  // F8 (Extend Selection) makes plain arrows extend the selection
  const extend = shift || ctl.extendMode;

  // A selected chart takes Delete / Escape
  if (ctl.selectedChart) {
    if (key === "Delete" || key === "Backspace") {
      ctl.deleteChart();
      return true;
    }
    if (key === "Escape") {
      ctl.selectChart(null);
      return true;
    }
  }

  // End mode: End, then an arrow key jumps to the edge of the data
  if (ctl.endMode && !["Shift", "Control", "Alt", "Meta", "End"].includes(key)) {
    ctl.setEndMode(false);
    if (dir && !ctrl && !alt) {
      ctl.jumpEdge(dir, extend);
      return true;
    }
    if (key === "Home" && !ctrl && !alt) {
      const l = ctl.layout;
      ctl.select(Math.max(1, l?.maxRow ?? 1), Math.max(1, l?.maxCol ?? 1), extend);
      return true;
    }
  }

  if (ctrl && alt) {
    // e.code: these combinations type characters on some layouts (AltGr)
    if (e.code === "KeyV") {
      ui?.dialog("pasteSpecial");
      return true;
    }
    if (e.code === "Equal" || e.code === "NumpadAdd") {
      ctl.zoomStep(1);
      return true;
    }
    if (e.code === "Minus" || e.code === "NumpadSubtract") {
      ctl.zoomStep(-1);
      return true;
    }
    if (key === "F9") {
      ctl.recalculate();
      return true;
    }
    return false;
  }

  if (ctrl) {
    if (dir) {
      ctl.jumpEdge(dir, extend);
      return true;
    }
    switch (key.toLowerCase()) {
      case "home":
        ctl.select(Math.max(1, ctl.frozenRows + 1), Math.max(1, ctl.frozenCols + 1), extend);
        return true;
      case "end": {
        const l = ctl.layout;
        ctl.select(Math.max(1, l?.maxRow ?? 1), Math.max(1, l?.maxCol ?? 1), extend);
        return true;
      }
      case "pageup":
        ctl.nextSheet(-1);
        return true;
      case "pagedown":
        ctl.nextSheet(1);
        return true;
      case "a":
        if (shift) return false;
        ctl.selectRegionOrAll();
        return true;
      case " ":
        if (shift) ctl.selectAll();
        else ctl.selectColumns(ctl.sel.range.c1, ctl.sel.range.c2);
        return true;
      case "*":
        ctl.selectCurrentRegion();
        return true;
      case "8":
        if (!shift) return false;
        ctl.selectCurrentRegion();
        return true;
      case "backspace":
        ctl.scrollToActive();
        return true;
      case ".":
        ctl.nextCorner();
        return true;
      case "z":
        // Cmd+Shift+Z redoes on the Mac
        if (shift) ctl.redo();
        else ctl.undo();
        return true;
      case "y":
        ctl.redoOrRepeat();
        return true;
      case "b":
      case "2":
        ctl.toggle("bold");
        return true;
      case "i":
      case "3":
        ctl.toggle("italic");
        return true;
      case "u":
        // Ctrl+Shift+U expands the formula bar (window handler)
        if (shift) return false;
        ctl.toggle("underline");
        return true;
      case "4":
        ctl.toggle("underline");
        return true;
      case "5":
        ctl.toggle("strike");
        return true;
      case "1":
        ui?.dialog("formatCells");
        return true;
      case "f":
        if (shift) ui?.dialog("formatCells", { tab: "font" });
        else ui?.dialog("find", { tab: "find" });
        return true;
      case "p":
        if (shift) ui?.dialog("formatCells", { tab: "font" });
        else ui?.dialog("print");
        return true;
      case "s":
        if (shift) ui?.saveAs();
        else ctl.save();
        return true;
      case "o":
        if (shift) return false;
        ui?.backstage("open");
        return true;
      case "n":
        ui?.backstage("new-blank");
        return true;
      case "h":
        ui?.dialog("find", { tab: "replace" });
        return true;
      case "g":
        ui?.dialog("goto");
        return true;
      case "d":
        ctl.fillDirection("down");
        return true;
      case "r":
        ctl.fillDirection("right");
        return true;
      case "e":
        ctl.flashFill();
        return true;
      case ";":
        ctl.insertDate();
        return true;
      case ":":
        ctl.insertTime();
        return true;
      case "'":
        ctl.copyFromAbove(false);
        return true;
      case '"':
        ctl.copyFromAbove(true);
        return true;
      case "`":
        if (shift) ctl.style({ numFmt: "general" });
        else ctl.toggleShowFormulas();
        return true;
      case "~":
        ctl.style({ numFmt: "general" });
        return true;
      case "+":
      case "=":
        if (shift || key === "+") {
          ui?.dialog("insertCells");
          return true;
        }
        return false;
      case "-":
        ui?.dialog("deleteCells");
        return true;
      case "9":
        if (shift) ctl.unhideAround("rows");
        else ctl.setHidden("rows", true);
        return true;
      case "(":
        ctl.unhideAround("rows");
        return true;
      case "0":
        if (shift) ctl.unhideAround("cols");
        else ctl.setHidden("cols", true);
        return true;
      case ")":
        ctl.unhideAround("cols");
        return true;
      case "$":
        ctl.style({ numFmt: currencyFmt() });
        return true;
      case "%":
        ctl.style({ numFmt: "0%" });
        return true;
      case "!":
        ctl.style({ numFmt: "#,##0.00" });
        return true;
      case "#":
        ctl.style({ numFmt: shortDate() });
        return true;
      case "@":
        ctl.style({ numFmt: "h:mm AM/PM" });
        return true;
      case "^":
        ctl.style({ numFmt: "0.00E+00" });
        return true;
      case "&":
        ctl.borders("outer");
        return true;
      case "_":
        ctl.borders("none");
        return true;
      case "[":
        ctl.goToPrecedents();
        return true;
      case "enter":
        return false;
      case "f4":
        // Ctrl+Shift+F4 finds the previous match
        if (shift) ctl.findNext(-1);
        else ui?.dialog("closeWorkbook");
        return true;
      case "w":
        ui?.dialog("closeWorkbook");
        return true;
      case "f2":
        ui?.dialog("print");
        return true;
      case "f3":
        ui?.dialog(shift ? "createNames" : "nameManager");
        return true;
      case "f6":
      case "tab":
        ctl.nextWindow(shift ? -1 : 1);
        return true;
      case "f12":
        if (shift) ui?.dialog("print");
        else ui?.backstage("open");
        return true;
      case "k":
        ui?.dialog("link");
        return true;
      case "l":
        if (shift) ctl.toggleFilter();
        else ctl.formatAsTable();
        return true;
      case "t":
        ctl.formatAsTable();
        return true;
      case "v":
        // Ctrl+Shift+V pastes values; Ctrl+V uses the native paste event
        if (shift) {
          ctl.paste("values");
          return true;
        }
        return false;
      case "c":
      case "x":
        return false;
    }
    return false;
  }

  if (alt) {
    // e.code: on macOS Option+= types "≠"
    if (key === "=" || e.code === "Equal") {
      ctl.autoSum();
      return true;
    }
    if (key === "F1") {
      if (shift) ctl.addSheet();
      else ctl.insertChart("column");
      return true;
    }
    if (key === "PageDown") {
      ctl.pageMove(1, extend, true);
      return true;
    }
    if (key === "PageUp") {
      ctl.pageMove(-1, extend, true);
      return true;
    }
    if (key === "ArrowDown") {
      ctl.showPickList();
      return true;
    }
    if (key === "Enter") return true;
    return false;
  }

  if (dir) {
    const [dr, dc] = STEP[dir];
    ctl.move(dr, dc, extend);
    return true;
  }

  switch (key) {
    case "Tab":
      ctl.moveWithin(0, shift ? -1 : 1);
      return true;
    case "Enter":
      // Excel: Enter pastes while a copy is pending ("marching ants")
      if (ctl.clip && !shift) {
        ctl.paste("all").then(() => ctl.clearClip());
        return true;
      }
      ctl.moveWithin(shift ? -1 : 1, 0);
      return true;
    case "Home":
      ctl.select(extend ? ctl.sel.cursor.r : ctl.sel.active.r, 1, extend);
      return true;
    case "End":
      ctl.setEndMode(!ctl.endMode);
      return true;
    case "PageDown":
      ctl.pageMove(1, extend);
      return true;
    case "PageUp":
      ctl.pageMove(-1, extend);
      return true;
    case "Delete":
      ctl.clear("contents");
      return true;
    case "Backspace":
      if (shift) ctl.collapseSelection();
      else ctl.startEdit("enter", "");
      return true;
    case "F1":
      ui?.dialog("shortcuts");
      return true;
    case "F2":
      if (shift) ui?.dialog("note");
      else ctl.startEdit("edit");
      return true;
    case "F3":
      if (shift) ui?.dialog("insertFunction");
      else ui?.dialog("pasteName");
      return true;
    case "F4":
      if (shift) ctl.findNext(1);
      else ctl.repeatLast();
      return true;
    case "F5":
      ui?.dialog("goto");
      return true;
    case "F8":
      ctl.setExtendMode(!ctl.extendMode);
      return true;
    case "F9":
      ctl.recalculate();
      return true;
    case "F10":
      if (shift) {
        ui?.dialog("contextMenu");
        return true;
      }
      return false;
    case "F11":
      if (shift) ctl.addSheet();
      else ctl.insertChart("column");
      return true;
    case "F12":
      if (shift) ctl.save();
      else ui?.saveAs();
      return true;
    case "Escape":
      ctl.setExtendMode(false);
      ctl.setEndMode(false);
      if (ctl.painter) {
        ctl.painter = null;
        ctl.clearClip();
        return true;
      }
      ctl.clearClip();
      return true;
    case " ":
      if (shift) {
        ctl.selectRows(ctl.sel.range.r1, ctl.sel.range.r2);
        return true;
      }
      return false;
    case "ContextMenu":
      ui?.dialog("contextMenu");
      return true;
  }
  if (isPrintable(e)) return false; // let it reach the textarea (starts editing)
  return false;
}

/** Keys while editing a cell (in-cell editor or formula bar). */
export function handleEditorKey(ctl: WorkbookController, e: KeyboardEvent): boolean {
  const edit = ctl.edit;
  if (!edit) return false;
  const ctrl = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;

  // Autocomplete list
  if (edit.suggest) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const n = edit.suggest.items.length;
      const index = (edit.suggest.index + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      ctl.edit = { ...edit, suggest: { ...edit.suggest, index } };
      ctl.emit();
      return true;
    }
    if (e.key === "Tab") {
      ctl.acceptSuggestion();
      return true;
    }
    if (e.key === "Escape") {
      ctl.edit = { ...edit, suggest: null };
      ctl.emit();
      return true;
    }
  }

  switch (e.key) {
    case "Enter":
      if (e.altKey) {
        const t = edit.text.slice(0, edit.caret) + "\n" + edit.text.slice(edit.caretEnd);
        ctl.updateEdit(t, edit.caret + 1, edit.caret + 1, true);
        return true;
      }
      // Ctrl+Shift+Enter (array formula): dynamic arrays spill on their own
      if (ctrl && shift) {
        ctl.commitEdit("none");
        return true;
      }
      ctl.commitEdit(ctrl ? "none" : shift ? "up" : "down", ctrl);
      return true;
    case "F3":
      if (shift) ctl.ui?.dialog("insertFunction");
      else ctl.ui?.dialog("pasteName");
      return true;
    case "Delete":
      // Ctrl+Delete deletes to the end of the line
      if (ctrl && edit.source === "cell") {
        const lineEnd = edit.text.indexOf("\n", edit.caret);
        const end = lineEnd < 0 ? edit.text.length : lineEnd;
        ctl.updateEdit(edit.text.slice(0, edit.caret) + edit.text.slice(end), edit.caret, edit.caret, true);
        return true;
      }
      return false;
    case "Tab":
      ctl.commitEdit(shift ? "left" : "right");
      return true;
    case "Escape":
      ctl.cancelEdit();
      return true;
    case "F2":
      ctl.edit = { ...edit, mode: edit.mode === "edit" ? "enter" : "edit", point: null };
      ctl.emit();
      return true;
    case "F4":
      ctl.cycleReference();
      return true;
    case "ArrowUp":
    case "ArrowDown":
    case "ArrowLeft":
    case "ArrowRight": {
      if (edit.source === "bar") return false;
      const dr = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      const dc = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      if (ctl.canPoint()) {
        ctl.pointMove(dr, dc, shift);
        return true;
      }
      if (edit.mode === "enter" && !ctrl) {
        ctl.commitEdit(dr > 0 ? "down" : dr < 0 ? "up" : dc > 0 ? "right" : "left");
        return true;
      }
      return false;
    }
  }
  if (ctrl) {
    const k = e.key.toLowerCase();
    if (k === "z") {
      ctl.cancelEdit();
      return true;
    }
    if (k === ";") {
      ctl.insertDate();
      return true;
    }
    if (k === ":") {
      ctl.insertTime();
      return true;
    }
    if (k === "a" && edit.text.startsWith("=")) {
      // Ctrl+Shift+A types the argument names of the function before the caret
      if (shift) ctl.insertArgumentNames();
      else ctl.ui?.dialog("insertFunction");
      return true;
    }
  }
  return false;
}

export function fullRange() {
  return rect(1, 1, LAST_ROW, LAST_COL);
}

export { accountingFmt };
