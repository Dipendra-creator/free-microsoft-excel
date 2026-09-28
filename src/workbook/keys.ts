// Excel keyboard behaviour for the grid (not editing) and the cell editor.

import { LAST_COL, LAST_ROW, rect } from "../lib/a1";
import { accountingFmt, currencyFmt, shortDate } from "../lib/formats";
import type { WorkbookController } from "./controller";

function isPrintable(e: KeyboardEvent) {
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}

/** Keys while the grid has focus and no edit is in progress. Returns true if handled. */
export function handleGridKey(ctl: WorkbookController, e: KeyboardEvent): boolean {
  const ui = ctl.ui;
  const ctrl = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;
  const key = e.key;

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

  if (ctrl && !e.altKey) {
    switch (key.toLowerCase()) {
      case "arrowup":
        ctl.jumpEdge("up", shift);
        return true;
      case "arrowdown":
        ctl.jumpEdge("down", shift);
        return true;
      case "arrowleft":
        ctl.jumpEdge("left", shift);
        return true;
      case "arrowright":
        ctl.jumpEdge("right", shift);
        return true;
      case "home":
        ctl.select(Math.max(1, ctl.frozenRows + 1), Math.max(1, ctl.frozenCols + 1), shift);
        return true;
      case "end": {
        const l = ctl.layout;
        ctl.select(Math.max(1, l?.maxRow ?? 1), Math.max(1, l?.maxCol ?? 1), shift);
        return true;
      }
      case "pageup":
        ctl.nextSheet(-1);
        return true;
      case "pagedown":
        ctl.nextSheet(1);
        return true;
      case "a":
        ctl.selectAll();
        return true;
      case " ":
        ctl.selectColumns(ctl.sel.range.c1, ctl.sel.range.c2);
        return true;
      case "z":
        ctl.undo();
        return true;
      case "y":
        ctl.redo();
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
      case "4":
        ctl.toggle("underline");
        return true;
      case "5":
        ctl.toggle("strike");
        return true;
      case "1":
        ui?.dialog("formatCells");
        return true;
      case "s":
        if (shift) ui?.saveAs();
        else ctl.save();
        return true;
      case "o":
        ui?.backstage("open");
        return true;
      case "n":
        ui?.backstage("new-blank");
        return true;
      case "f":
        ui?.dialog("find", { tab: "find" });
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
      case ";":
        ctl.insertDate();
        return true;
      case ":":
        ctl.insertTime();
        return true;
      case "`":
      case "~":
        ctl.toggleShowFormulas();
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
      case "0":
        if (shift) ctl.unhideAround("cols");
        else ctl.setHidden("cols", true);
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
      case "enter":
        return false;
      case "w":
      case "f4":
        ui?.dialog("closeWorkbook");
        return true;
      case "p":
        ui?.dialog("print");
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
      case "c":
      case "x":
      case "v":
        // Handled by the native copy/cut/paste events
        return false;
    }
    return false;
  }

  if (e.altKey && !ctrl) {
    // e.code: on macOS Option+= types "≠"
    if (key === "=" || e.code === "Equal") {
      ctl.autoSum();
      return true;
    }
    if (key === "F1") {
      ctl.insertChart("column");
      return true;
    }
    if (key === "PageDown") {
      ctl.pageMove(1, shift, true);
      return true;
    }
    if (key === "PageUp") {
      ctl.pageMove(-1, shift, true);
      return true;
    }
    if (key === "Enter") return true;
    return false;
  }

  switch (key) {
    case "ArrowUp":
      ctl.move(-1, 0, shift);
      return true;
    case "ArrowDown":
      ctl.move(1, 0, shift);
      return true;
    case "ArrowLeft":
      ctl.move(0, -1, shift);
      return true;
    case "ArrowRight":
      ctl.move(0, 1, shift);
      return true;
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
      ctl.select(shift ? ctl.sel.cursor.r : ctl.sel.active.r, 1, shift);
      return true;
    case "End":
      return true;
    case "PageDown":
      ctl.pageMove(1, shift);
      return true;
    case "PageUp":
      ctl.pageMove(-1, shift);
      return true;
    case "Delete":
      ctl.clear("contents");
      return true;
    case "Backspace":
      ctl.startEdit("enter", "");
      return true;
    case "F2":
      if (shift) ui?.dialog("note");
      else ctl.startEdit("edit");
      return true;
    case "F4":
      return true;
    case "F5":
      ui?.dialog("goto");
      return true;
    case "F9":
      ctl.recalculate();
      return true;
    case "F11":
      if (shift) {
        ctl.addSheet();
        return true;
      }
      return false;
    case "F3":
      if (shift) {
        ui?.dialog("insertFunction");
        return true;
      }
      return false;
    case "F12":
      ui?.saveAs();
      return true;
    case "Escape":
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
      ctl.commitEdit(ctrl ? "none" : shift ? "up" : "down", ctrl);
      return true;
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
      ctl.ui?.dialog("insertFunction");
      return true;
    }
  }
  return false;
}

export function fullRange() {
  return rect(1, 1, LAST_ROW, LAST_COL);
}

export { accountingFmt };
