// WorkbookController: state and behaviour of one open workbook view.
// React components subscribe to it; the canvas grid repaints from it.

import {
  api,
  errorMessage,
  Kind,
  type CellInfo,
  type CellsChunk,
  type Rect,
  type SelectionStats,
  type SheetLayout,
  type StylePatch,
  type WorkbookInfo,
} from "../api";
import { cellName, colName, contains, isFullCols, isFullRows, LAST_COL, LAST_ROW, parseRange, rect, rectName, sameRect } from "../lib/a1";
import { autoClose, canInsertRef, identifierAt, refEndingAt, tokenize, type RefToken } from "../lib/formula";
import { searchFunctions, type FunctionDoc } from "../lib/functions";
import { cellStyle, TABLE_STYLES, DEFAULT_TABLE_STYLE } from "../lib/galleries";
import { nowTimeInput, todayInput } from "../lib/formats";
import { Axis } from "./grid/axis";
import { CellCache } from "./grid/cache";

export type Mode = "Ready" | "Enter" | "Edit" | "Point";

export interface Pos {
  r: number;
  c: number;
}

export interface Selection {
  active: Pos;
  anchor: Pos;
  /** Moving end of the range (for Shift+arrow extension). */
  cursor: Pos;
  range: Rect;
}

export interface EditState {
  row: number;
  col: number;
  sheet: number;
  text: string;
  original: string;
  mode: "enter" | "edit";
  source: "cell" | "bar";
  caret: number;
  caretEnd: number;
  /** Reference being inserted by pointing. */
  point: { start: number; end: number; anchor: Pos; cursor: Pos } | null;
  suggest: { items: FunctionDoc[]; index: number; start: number } | null;
  /** true when started by typing (replaces the value). */
  typed: boolean;
  /** Bumped on programmatic text/caret changes that inputs must mirror. */
  sync: number;
}

export interface UiBridge {
  error: (message: string) => void;
  ask: (title: string, message: string, buttons: { label: string; value: string; primary?: boolean }[]) => Promise<string>;
  dialog: (name: string, props?: Record<string, unknown>) => void;
  backstage: (page?: string) => void;
  saveAs: () => Promise<boolean>;
  focusGrid: () => void;
}

export interface HitResult {
  kind: "cell" | "colHeader" | "rowHeader" | "corner" | "none";
  r: number;
  c: number;
  resize?: "col" | "row";
  /** Index being resized. */
  index?: number;
  fillHandle?: boolean;
}

const HEADER_H = 20;

export class WorkbookController {
  readonly id: string;
  info: WorkbookInfo;
  sheet: number;
  layout: SheetLayout | null = null;
  rows: Axis;
  cols: Axis;
  zoom = 1;
  cache = new CellCache();
  sel: Selection = { active: { r: 1, c: 1 }, anchor: { r: 1, c: 1 }, cursor: { r: 1, c: 1 }, range: rect(1, 1) };
  scroll = { x: 0, y: 0 };
  viewport = { width: 800, height: 600 };
  edit: EditState | null = null;
  activeInfo: CellInfo | null = null;
  stats: SelectionStats | null = null;
  clip: { sheet: number; rect: Rect; cut: boolean } | null = null;
  painter: { sticky: boolean } | null = null;
  fillPreview: Rect | null = null;
  resizeGuide: { axis: "col" | "row"; pos: number } | null = null;
  showFormulas = false;
  showHeadings = true;
  showFormulaBar = true;
  formulaBarExpanded = true;
  ribbonCollapsed = false;
  busy = false;
  lastError: string | null = null;
  ui: UiBridge | null = null;

  version = 0;
  private stateListeners = new Set<() => void>();
  private painters = new Set<() => void>();
  private paintQueued = false;
  private dataVersion = 0;
  private fetchState = { inFlight: false, pending: false, stale: true };
  private infoSeq = 0;
  private statsTimer: number | undefined;
  private lastKnownBottom = 1;
  private lastKnownRight = 1;
  private syncSeq = 0;

  private nextSync() {
    return ++this.syncSeq;
  }

  constructor(info: WorkbookInfo) {
    this.id = info.id;
    this.info = info;
    this.sheet = info.activeSheet;
    this.rows = new Axis(20, [], LAST_ROW, 1);
    this.cols = new Axis(64, [], LAST_COL, 1);
  }

  // ------------------------------------------------------------------
  // Subscriptions
  // ------------------------------------------------------------------

  subscribe = (fn: () => void) => {
    this.stateListeners.add(fn);
    return () => {
      this.stateListeners.delete(fn);
    };
  };

  getVersion = () => this.version;

  onPaint(fn: () => void) {
    this.painters.add(fn);
    return () => {
      this.painters.delete(fn);
    };
  }

  emit() {
    this.version++;
    for (const fn of this.stateListeners) fn();
    this.paint();
  }

  paint() {
    if (this.paintQueued) return;
    this.paintQueued = true;
    requestAnimationFrame(() => {
      this.paintQueued = false;
      for (const fn of this.painters) fn();
    });
  }

  // ------------------------------------------------------------------
  // Loading
  // ------------------------------------------------------------------

  async init() {
    await this.loadLayout();
    this.select(1, 1);
    this.requestCells(true);
  }

  get sheetName(): string {
    return this.info.sheets[this.sheet]?.name ?? "";
  }

  get mode(): Mode {
    if (!this.edit) return "Ready";
    if (this.edit.point) return "Point";
    return this.edit.mode === "edit" ? "Edit" : "Enter";
  }

  private async loadLayout() {
    const layout = await api.layout(this.id, this.sheet);
    this.applyLayout(layout);
  }

  private applyLayout(layout: SheetLayout) {
    this.layout = layout;
    this.cache.setLayout(layout);
    this.rebuildAxes();
  }

  private rebuildAxes() {
    const l = this.layout;
    if (!l) return;
    const cols: [number, number][] = [];
    for (const [a, b, px] of l.cols) {
      const end = Math.min(b, LAST_COL);
      if (end - a > 20000) continue;
      for (let c = a; c <= end; c++) cols.push([c, px]);
    }
    this.rows = new Axis(l.defaultRowPx, l.rows, LAST_ROW, this.zoom);
    this.cols = new Axis(l.defaultColPx, cols, LAST_COL, this.zoom);
  }

  /** Called with the WorkbookInfo returned by every mutation. */
  async setInfo(info: WorkbookInfo) {
    const layoutChanged = info.layoutVersion !== this.info.layoutVersion;
    const sheetsChanged = info.sheets.length !== this.info.sheets.length;
    this.info = info;
    if (this.sheet >= info.sheets.length || info.sheets[this.sheet]?.hidden) {
      this.sheet = info.activeSheet;
    }
    if (sheetsChanged && info.activeSheet !== this.sheet) {
      await this.switchSheet(info.activeSheet, true);
      return;
    }
    if (layoutChanged) await this.loadLayout();
    this.invalidate();
    this.emit();
  }

  /** Marks cached cells stale and refetches everything visible. */
  invalidate() {
    this.dataVersion++;
    this.fetchState.stale = true;
    this.requestCells(true);
    this.refreshActiveInfo();
    this.scheduleStats();
  }

  async switchSheet(index: number, force = false) {
    if (index === this.sheet && !force) return;
    if (this.edit) {
      if (this.edit.text.startsWith("=")) {
        // Excel allows pointing to other sheets; we commit first for simplicity.
      }
      await this.commitEdit("none");
    }
    this.sheet = index;
    this.cache.clear();
    this.scroll = { x: 0, y: 0 };
    this.fillPreview = null;
    await this.loadLayout();
    api.activateSheet(this.id, index).catch(() => {});
    this.select(1, 1);
    this.dataVersion++;
    this.fetchState.stale = true;
    this.requestCells(true);
    this.emit();
  }

  // ------------------------------------------------------------------
  // Geometry
  // ------------------------------------------------------------------

  get frozenRows() {
    return this.layout?.frozenRows ?? 0;
  }

  get frozenCols() {
    return this.layout?.frozenCols ?? 0;
  }

  get headerH() {
    return this.showHeadings ? Math.round(HEADER_H * this.zoom) : 0;
  }

  get headerW() {
    if (!this.showHeadings) return 0;
    const digits = String(Math.max(this.lastKnownBottom, 99)).length;
    return Math.round(Math.max(25, 9 + digits * 7) * this.zoom);
  }

  get frozenW() {
    return this.frozenCols > 0 ? this.cols.start(this.frozenCols + 1) : 0;
  }

  get frozenH() {
    return this.frozenRows > 0 ? this.rows.start(this.frozenRows + 1) : 0;
  }

  get originX() {
    return this.headerW + this.frozenW;
  }

  get originY() {
    return this.headerH + this.frozenH;
  }

  colX(c: number): number {
    if (c <= this.frozenCols) return this.headerW + this.cols.start(c);
    return this.originX + this.cols.start(c) - this.cols.start(this.frozenCols + 1) - this.scroll.x;
  }

  rowY(r: number): number {
    if (r <= this.frozenRows) return this.headerH + this.rows.start(r);
    return this.originY + this.rows.start(r) - this.rows.start(this.frozenRows + 1) - this.scroll.y;
  }

  /** Screen rectangle of a range (css px relative to the grid canvas). */
  rangeBox(r: Rect): { x: number; y: number; w: number; h: number } {
    const x1 = this.colX(r.c1);
    const y1 = this.rowY(r.r1);
    const x2 = this.colX(r.c2) + this.cols.size(r.c2);
    const y2 = this.rowY(r.r2) + this.rows.size(r.r2);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  colAt(x: number): number {
    if (x < this.originX && this.frozenCols > 0) return this.cols.indexAt(Math.max(0, x - this.headerW));
    return this.cols.indexAt(x - this.originX + this.scroll.x + this.cols.start(this.frozenCols + 1));
  }

  rowAt(y: number): number {
    if (y < this.originY && this.frozenRows > 0) return this.rows.indexAt(Math.max(0, y - this.headerH));
    return this.rows.indexAt(y - this.originY + this.scroll.y + this.rows.start(this.frozenRows + 1));
  }

  hitTest(x: number, y: number): HitResult {
    const hw = this.headerW;
    const hh = this.headerH;
    if (x < 0 || y < 0 || x > this.viewport.width || y > this.viewport.height) return { kind: "none", r: 0, c: 0 };
    if (x < hw && y < hh) return { kind: "corner", r: 0, c: 0 };
    if (y < hh) {
      const c = this.colAt(x);
      const left = this.colX(c);
      const right = left + this.cols.size(c);
      if (Math.abs(x - right) <= 4) return { kind: "colHeader", r: 0, c, resize: "col", index: c };
      if (Math.abs(x - left) <= 3 && c > 1) {
        const prev = this.cols.prev(c);
        return { kind: "colHeader", r: 0, c, resize: "col", index: prev === c ? c - 1 : prev };
      }
      return { kind: "colHeader", r: 0, c };
    }
    if (x < hw) {
      const r = this.rowAt(y);
      const top = this.rowY(r);
      const bottom = top + this.rows.size(r);
      if (Math.abs(y - bottom) <= 3) return { kind: "rowHeader", r, c: 0, resize: "row", index: r };
      if (Math.abs(y - top) <= 2 && r > 1) {
        const prev = this.rows.prev(r);
        return { kind: "rowHeader", r, c: 0, resize: "row", index: prev === r ? r - 1 : prev };
      }
      return { kind: "rowHeader", r, c: 0 };
    }
    const r = this.rowAt(y);
    const c = this.colAt(x);
    // Fill handle: bottom-right corner of the selection
    const box = this.rangeBox(this.visibleSel());
    const hx = box.x + box.w;
    const hy = box.y + box.h;
    const fillHandle = !this.edit && Math.abs(x - hx) <= 5 && Math.abs(y - hy) <= 5;
    return { kind: "cell", r, c, fillHandle };
  }

  /** Selection clamped to the used area for drawing full row/column selections. */
  visibleSel(): Rect {
    return this.sel.range;
  }

  /** Visible rectangles for the main and frozen panes. */
  visibleRanges(): { main: Rect; top: Rect | null; left: Rect | null; corner: Rect | null } {
    const fr = this.frozenRows;
    const fc = this.frozenCols;
    const r1 = this.rowAt(this.originY + 0.5);
    const c1 = this.colAt(this.originX + 0.5);
    const r2 = Math.min(LAST_ROW, this.rowAt(this.viewport.height - 1));
    const c2 = Math.min(LAST_COL, this.colAt(this.viewport.width - 1));
    const main = rect(Math.max(r1, fr + 1), Math.max(c1, fc + 1), Math.max(r2, fr + 1), Math.max(c2, fc + 1));
    this.lastKnownBottom = main.r2;
    this.lastKnownRight = main.c2;
    return {
      main,
      top: fr > 0 ? rect(1, main.c1, fr, main.c2) : null,
      left: fc > 0 ? rect(main.r1, 1, main.r2, fc) : null,
      corner: fr > 0 && fc > 0 ? rect(1, 1, fr, fc) : null,
    };
  }

  // ------------------------------------------------------------------
  // Scrolling
  // ------------------------------------------------------------------

  get mainW() {
    return Math.max(0, this.viewport.width - this.originX);
  }

  get mainH() {
    return Math.max(0, this.viewport.height - this.originY);
  }

  /** Scrollable content size (grows as the user scrolls, like Excel). */
  extent(): { w: number; h: number } {
    const l = this.layout;
    const visRows = Math.ceil(this.mainH / Math.max(1, this.rows.def));
    const visCols = Math.ceil(this.mainW / Math.max(1, this.cols.def));
    const lastRow = Math.min(LAST_ROW, Math.max(l?.maxRow ?? 1, this.sel.active.r, this.lastKnownBottom) + Math.max(10, visRows >> 1));
    const lastCol = Math.min(LAST_COL, Math.max(l?.maxCol ?? 1, this.sel.active.c, this.lastKnownRight) + Math.max(3, visCols >> 2));
    const baseY = this.rows.start(this.frozenRows + 1);
    const baseX = this.cols.start(this.frozenCols + 1);
    return {
      h: Math.max(this.rows.end(lastRow) - baseY, this.scroll.y + this.mainH),
      w: Math.max(this.cols.end(lastCol) - baseX, this.scroll.x + this.mainW),
    };
  }

  maxScroll() {
    return {
      x: this.cols.end(LAST_COL) - this.cols.start(this.frozenCols + 1) - this.mainW,
      y: this.rows.end(LAST_ROW) - this.rows.start(this.frozenRows + 1) - this.mainH,
    };
  }

  scrollTo(x: number, y: number) {
    const max = this.maxScroll();
    const nx = Math.max(0, Math.min(x, max.x));
    const ny = Math.max(0, Math.min(y, max.y));
    if (nx === this.scroll.x && ny === this.scroll.y) return;
    this.scroll = { x: nx, y: ny };
    this.requestCells();
    this.version++;
    for (const fn of this.stateListeners) fn();
    this.paint();
  }

  scrollBy(dx: number, dy: number) {
    this.scrollTo(this.scroll.x + dx, this.scroll.y + dy);
  }

  /** Scrolls so that the cell is visible (no-op for frozen cells). */
  ensureVisible(r: number, c: number) {
    let { x, y } = this.scroll;
    if (r > this.frozenRows) {
      const top = this.rows.start(r) - this.rows.start(this.frozenRows + 1);
      const bottom = top + this.rows.size(r);
      if (top < y) y = top;
      else if (bottom > y + this.mainH) y = Math.max(0, bottom - this.mainH);
    }
    if (c > this.frozenCols) {
      const left = this.cols.start(c) - this.cols.start(this.frozenCols + 1);
      const right = left + this.cols.size(c);
      if (left < x) x = left;
      else if (right > x + this.mainW) x = Math.max(0, right - this.mainW);
    }
    this.scrollTo(x, y);
  }

  setViewport(width: number, height: number) {
    if (width === this.viewport.width && height === this.viewport.height) return;
    this.viewport = { width, height };
    this.requestCells();
    this.paint();
    this.version++;
    for (const fn of this.stateListeners) fn();
  }

  setZoom(z: number) {
    const zoom = Math.max(0.1, Math.min(4, Math.round(z * 100) / 100));
    if (zoom === this.zoom) return;
    const ratio = zoom / this.zoom;
    this.zoom = zoom;
    this.rebuildAxes();
    this.scroll = { x: this.scroll.x * ratio, y: this.scroll.y * ratio };
    this.requestCells();
    this.emit();
  }

  // ------------------------------------------------------------------
  // Cell data fetching
  // ------------------------------------------------------------------

  requestCells(force = false) {
    if (!this.layout) return;
    const vis = this.visibleRanges();
    const panes = [vis.main, vis.top, vis.left, vis.corner].filter((p): p is Rect => !!p);
    const covered =
      !this.fetchState.stale && this.cache.sheet === this.sheet && panes.every((p) => this.cache.covers(p));
    if (covered && !force) return;
    if (this.fetchState.inFlight) {
      this.fetchState.pending = true;
      return;
    }
    const fr = this.frozenRows;
    const fc = this.frozenCols;
    const m = vis.main;
    const main = rect(
      Math.max(fr + 1, m.r1 - 20),
      Math.max(fc + 1, m.c1 - 12),
      Math.min(LAST_ROW, m.r2 + 40),
      Math.min(LAST_COL, m.c2 + 12),
    );
    const wins: Rect[] = [main];
    if (fr > 0) wins.push(rect(1, main.c1, fr, main.c2));
    if (fc > 0) wins.push(rect(main.r1, 1, main.r2, fc));
    if (fr > 0 && fc > 0) wins.push(rect(1, 1, fr, fc));
    const sheet = this.sheet;
    const dataVersion = this.dataVersion;
    this.fetchState.inFlight = true;
    this.fetchState.pending = false;
    Promise.all(wins.map((w) => api.cells(this.id, sheet, w, this.showFormulas)))
      .then((chunks: CellsChunk[]) => {
        if (sheet !== this.sheet) return;
        this.cache.load(chunks);
        this.fetchState.stale = dataVersion !== this.dataVersion;
        this.paint();
      })
      .catch((e) => console.error("cells", e))
      .finally(() => {
        this.fetchState.inFlight = false;
        if (this.fetchState.pending || this.fetchState.stale) {
          this.fetchState.pending = false;
          this.requestCells(true);
        }
      });
  }

  private refreshActiveInfo() {
    const seq = ++this.infoSeq;
    const { r, c } = this.sel.active;
    const sheet = this.sheet;
    api
      .cellInfo(this.id, sheet, r, c)
      .then((info) => {
        if (seq !== this.infoSeq) return;
        this.activeInfo = info;
        this.emit();
      })
      .catch(() => {});
  }

  private scheduleStats() {
    window.clearTimeout(this.statsTimer);
    const range = this.sel.range;
    if (range.r1 === range.r2 && range.c1 === range.c2) {
      if (this.stats) {
        this.stats = null;
        this.emit();
      }
      return;
    }
    this.statsTimer = window.setTimeout(() => {
      api
        .selectionStats(this.id, this.sheet, range)
        .then((s) => {
          if (!sameRect(range, this.sel.range)) return;
          this.stats = s;
          this.emit();
        })
        .catch(() => {});
    }, 60);
  }

  // ------------------------------------------------------------------
  // Selection
  // ------------------------------------------------------------------

  merges(): Rect[] {
    return (this.layout?.merges ?? []).map(([r1, c1, r2, c2]) => ({ r1, c1, r2, c2 }));
  }

  mergeAt(r: number, c: number): Rect | null {
    for (const [r1, c1, r2, c2] of this.layout?.merges ?? []) {
      if (r >= r1 && r <= r2 && c >= c1 && c <= c2) return { r1, c1, r2, c2 };
    }
    return null;
  }

  expandForMerges(range: Rect): Rect {
    let out = { ...range };
    const merges = this.layout?.merges ?? [];
    if (!merges.length || isFullCols(out) || isFullRows(out)) return out;
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 50) {
      changed = false;
      for (const [r1, c1, r2, c2] of merges) {
        if (r1 <= out.r2 && out.r1 <= r2 && c1 <= out.c2 && out.c1 <= c2) {
          const n = rect(Math.min(out.r1, r1), Math.min(out.c1, c1), Math.max(out.r2, r2), Math.max(out.c2, c2));
          if (!sameRect(n, out)) {
            out = n;
            changed = true;
          }
        }
      }
    }
    return out;
  }

  /** Column where a Tab…Tab…Enter data-entry sequence started (Excel returns there). */
  private tabStartCol: number | null = null;
  private keepTab = false;

  private setSelection(sel: Selection, scroll = true) {
    const changedActive = sel.active.r !== this.sel.active.r || sel.active.c !== this.sel.active.c;
    if (!this.keepTab) this.tabStartCol = null;
    this.sel = sel;
    if (scroll) this.ensureVisible(sel.cursor.r, sel.cursor.c);
    if (changedActive) {
      this.activeInfo = null;
      this.refreshActiveInfo();
    }
    this.scheduleStats();
    this.emit();
  }

  select(r: number, c: number, extend = false) {
    r = Math.max(1, Math.min(LAST_ROW, r));
    c = Math.max(1, Math.min(LAST_COL, c));
    if (extend) {
      const anchor = this.sel.anchor;
      const range = this.expandForMerges(rect(anchor.r, anchor.c, r, c));
      this.setSelection({ active: this.sel.active, anchor, cursor: { r, c }, range });
      return;
    }
    const merge = this.mergeAt(r, c);
    const pos = merge ? { r: merge.r1, c: merge.c1 } : { r, c };
    this.setSelection({ active: pos, anchor: pos, cursor: { r, c }, range: merge ?? rect(r, c) });
  }

  selectRange(range: Rect, active?: Pos, scroll = true) {
    const act = active ?? { r: range.r1, c: range.c1 };
    this.setSelection(
      { active: act, anchor: act, cursor: { r: range.r2, c: range.c2 }, range: this.expandForMerges(range) },
      scroll,
    );
  }

  selectAll() {
    this.setSelection({ active: this.sel.active, anchor: { r: 1, c: 1 }, cursor: { r: 1, c: 1 }, range: rect(1, 1, LAST_ROW, LAST_COL) }, false);
  }

  selectColumns(c1: number, c2: number, extendFrom?: number) {
    const a = extendFrom ?? c1;
    const topRow = Math.max(1, this.rowAt(this.originY + 1));
    this.setSelection(
      {
        active: { r: topRow, c: a },
        anchor: { r: 1, c: a },
        cursor: { r: 1, c: c2 },
        range: rect(1, Math.min(a, c2), LAST_ROW, Math.max(a, c2)),
      },
      false,
    );
    this.ensureVisible(this.rowAt(this.originY + 1), c2);
  }

  selectRows(r1: number, r2: number, extendFrom?: number) {
    const a = extendFrom ?? r1;
    const leftCol = Math.max(1, this.colAt(this.originX + 1));
    this.setSelection(
      {
        active: { r: a, c: leftCol },
        anchor: { r: a, c: 1 },
        cursor: { r: r2, c: 1 },
        range: rect(Math.min(a, r2), 1, Math.max(a, r2), LAST_COL),
      },
      false,
    );
    this.ensureVisible(r2, this.colAt(this.originX + 1));
  }

  /** Arrow / Tab / Enter movement. */
  move(dr: number, dc: number, extend = false) {
    const from = extend ? this.sel.cursor : this.sel.active;
    let { r, c } = from;
    const m = !extend ? this.mergeAt(r, c) : null;
    if (m) {
      if (dr > 0) r = m.r2;
      if (dr < 0) r = m.r1;
      if (dc > 0) c = m.c2;
      if (dc < 0) c = m.c1;
    }
    if (dr > 0) r = this.rows.next(r, dr);
    if (dr < 0) r = this.rows.prev(r, -dr);
    if (dc > 0) c = this.cols.next(c, dc);
    if (dc < 0) c = this.cols.prev(c, -dc);
    this.select(r, c, extend);
  }

  /** Enter/Tab inside a multi-cell selection cycles within it. */
  moveWithin(dr: number, dc: number) {
    const range = this.sel.range;
    const merged = this.mergeAt(range.r1, range.c1);
    const single = (range.r1 === range.r2 && range.c1 === range.c2) || (merged && sameRect(merged, range));
    if (single) {
      if (dr === 0 && dc > 0) {
        const start = this.tabStartCol ?? this.sel.active.c;
        this.keepTab = true;
        this.move(0, dc);
        this.keepTab = false;
        this.tabStartCol = start;
        return;
      }
      if (dr > 0 && dc === 0 && this.tabStartCol !== null) {
        const col = this.tabStartCol;
        this.tabStartCol = null;
        this.select(this.rows.next(merged ? merged.r2 : this.sel.active.r), col);
        return;
      }
      this.move(dr, dc);
      return;
    }
    let { r, c } = this.sel.active;
    if (dr !== 0) {
      r += dr;
      if (r > range.r2) {
        r = range.r1;
        c = c + 1 > range.c2 ? range.c1 : c + 1;
      } else if (r < range.r1) {
        r = range.r2;
        c = c - 1 < range.c1 ? range.c2 : c - 1;
      }
    } else {
      c += dc;
      if (c > range.c2) {
        c = range.c1;
        r = r + 1 > range.r2 ? range.r1 : r + 1;
      } else if (c < range.c1) {
        c = range.c2;
        r = r - 1 < range.r1 ? range.r2 : r - 1;
      }
    }
    this.setSelection({ ...this.sel, active: { r, c } });
    this.ensureVisible(r, c);
  }

  async jumpEdge(dir: "up" | "down" | "left" | "right", extend: boolean) {
    const from = extend ? this.sel.cursor : this.sel.active;
    try {
      const [r, c] = await api.navigateEdge(this.id, this.sheet, from.r, from.c, dir);
      this.select(r, c, extend);
    } catch (e) {
      this.fail(e);
    }
  }

  pageMove(dir: 1 | -1, extend: boolean, horizontal = false) {
    if (horizontal) {
      const cols = Math.max(1, Math.floor(this.mainW / Math.max(1, this.cols.def)) - 1);
      this.scrollBy(dir * cols * this.cols.def, 0);
      this.move(0, dir * cols, extend);
    } else {
      const rows = Math.max(1, Math.floor(this.mainH / Math.max(1, this.rows.def)) - 1);
      this.scrollBy(0, dir * rows * this.rows.def);
      this.move(dir * rows, 0, extend);
    }
  }

  goTo(text: string): boolean {
    const t = text.trim();
    if (!t) return false;
    let target = t;
    let sheetIndex = this.sheet;
    const bang = t.lastIndexOf("!");
    if (bang > 0) {
      const name = t.slice(0, bang).replace(/^'|'$/g, "").replace(/''/g, "'");
      const idx = this.info.sheets.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
      if (idx < 0) return false;
      sheetIndex = idx;
      target = t.slice(bang + 1);
    }
    const r = parseRange(target);
    if (!r) return false;
    const go = () => {
      this.selectRange(r, { r: r.r1, c: r.c1 });
      this.ensureVisible(r.r1, r.c1);
    };
    if (sheetIndex !== this.sheet) this.switchSheet(sheetIndex).then(go);
    else go();
    return true;
  }

  // ------------------------------------------------------------------
  // Editing
  // ------------------------------------------------------------------

  /** Starts editing the active cell. `initial` replaces the content (typing). */
  startEdit(mode: "enter" | "edit", initial?: string, source: "cell" | "bar" = "cell") {
    if (this.edit) return;
    const { r, c } = this.sel.active;
    const info = this.activeInfo && this.activeInfo.row === r && this.activeInfo.col === c ? this.activeInfo : null;
    if (info?.arrayAnchor && (info.arrayAnchor[0] !== r || info.arrayAnchor[1] !== c)) {
      this.ui?.error("You can't change part of an array.");
      return;
    }
    const original = info?.content ?? "";
    const text = initial ?? original;
    if (!info) {
      // Fill in the original content once it arrives (normally already cached).
      const sheet = this.sheet;
      api
        .cellInfo(this.id, sheet, r, c)
        .then((ci) => {
          const e = this.edit;
          if (!e || e.row !== r || e.col !== c || e.sheet !== sheet) return;
          if (ci.arrayAnchor && (ci.arrayAnchor[0] !== r || ci.arrayAnchor[1] !== c)) {
            this.edit = null;
            this.emit();
            this.ui?.error("You can't change part of an array.");
            return;
          }
          const fill = initial === undefined && e.text === "";
          this.edit = {
            ...e,
            original: ci.content,
            text: fill ? ci.content : e.text,
            caret: fill ? ci.content.length : e.caret,
            caretEnd: fill ? ci.content.length : e.caretEnd,
            sync: fill ? this.nextSync() : e.sync,
          };
          this.emit();
        })
        .catch(() => {});
    }
    this.edit = {
      row: r,
      col: c,
      sheet: this.sheet,
      text,
      original,
      mode,
      source,
      caret: text.length,
      caretEnd: text.length,
      point: null,
      suggest: null,
      typed: initial !== undefined,
      sync: this.nextSync(),
    };
    this.updateSuggest();
    this.emit();
  }

  /** `external` = the change did not come from the input the user types in. */
  updateEdit(text: string, caret: number, caretEnd = caret, external = false) {
    const e = this.edit;
    if (!e) return;
    const pointStillValid = e.point && e.point.end === caret && text.slice(0, e.point.start) === e.text.slice(0, e.point.start);
    this.edit = { ...e, text, caret, caretEnd, point: pointStillValid ? e.point : null, sync: external ? this.nextSync() : e.sync };
    this.updateSuggest();
    this.emit();
  }

  setEditCaret(caret: number, caretEnd = caret) {
    if (!this.edit) return;
    if (this.edit.caret === caret && this.edit.caretEnd === caretEnd) return;
    this.edit = { ...this.edit, caret, caretEnd, point: this.edit.point && this.edit.point.end === caret ? this.edit.point : null };
    this.updateSuggest();
    this.emit();
  }

  private updateSuggest() {
    const e = this.edit;
    if (!e) return;
    const id = e.caret === e.caretEnd ? identifierAt(e.text, e.caret) : null;
    const items = id && id.word.length >= 1 ? searchFunctions(id.word) : [];
    e.suggest = items.length ? { items, index: 0, start: id!.start } : null;
  }

  acceptSuggestion(index?: number) {
    const e = this.edit;
    if (!e?.suggest) return;
    const item = e.suggest.items[index ?? e.suggest.index];
    const before = e.text.slice(0, e.suggest.start);
    const after = e.text.slice(e.caret).replace(/^[A-Za-z0-9_.]*/, "");
    const insert = `${item.name}(`;
    const text = before + insert + after;
    const caret = before.length + insert.length;
    this.edit = { ...e, text, caret, caretEnd: caret, suggest: null, point: null, sync: this.nextSync() };
    this.emit();
  }

  cancelEdit() {
    if (!this.edit) return;
    this.edit = null;
    this.emit();
    this.ui?.focusGrid();
  }

  /** Formula references of the text being edited (for highlighting). */
  editRefs(): RefToken[] {
    const e = this.edit;
    if (!e || !e.text.startsWith("=")) return [];
    const name = this.sheetName.toLowerCase();
    return tokenize(e.text).refs.filter((r) => !r.sheet || r.sheet.toLowerCase() === name);
  }

  /** Commits and moves. `ctrl` writes the value into every selected cell. */
  async commitEdit(move: "down" | "up" | "right" | "left" | "none", ctrl = false) {
    const e = this.edit;
    if (!e) return;
    this.edit = null;
    let text = e.text;
    if (text.startsWith("=")) text = autoClose(text);
    const changed = text !== e.original || ctrl;
    const range = this.sel.range;
    const multi = ctrl && !(range.r1 === range.r2 && range.c1 === range.c2);
    // Move first so that fast typing continues in the next cell.
    if (e.sheet === this.sheet) {
      if (move === "down") this.moveWithin(1, 0);
      else if (move === "up") this.moveWithin(-1, 0);
      else if (move === "right") this.moveWithin(0, 1);
      else if (move === "left") this.moveWithin(0, -1);
    }
    this.emit();
    this.ui?.focusGrid();
    if (changed) {
      try {
        const info = multi
          ? await api.setRange(this.id, e.sheet, range, text)
          : await api.setCell(this.id, e.sheet, e.row, e.col, text);
        await this.setInfo(info);
        if (!multi && text && !text.startsWith("=")) await this.widenForNumber(e.sheet, e.row, e.col);
      } catch (err) {
        this.fail(err);
      }
    }
  }

  /** Excel widens a standard-width column when a typed number/date does not fit. */
  private async widenForNumber(sheet: number, row: number, col: number) {
    if (sheet !== this.sheet || !this.layout) return;
    if (this.layout.cols.some(([a, b]) => col >= a && col <= b)) return;
    const ci = await api.cellInfo(this.id, sheet, row, col);
    if ((ci.kind & 7) !== Kind.NUMBER || this.mergeAt(row, col)) return;
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = fontCss(ci.style, this.info.defaultFont, 1);
    const needed = Math.ceil(ctx.measureText(ci.formatted).width + 7);
    if (needed > this.layout.defaultColPx && needed < 400) {
      await this.run(api.colWidth(this.id, sheet, col, col, needed));
    }
  }

  /** Point mode: inserts/replaces a reference at the caret. */
  pointTo(range: Rect, anchor: Pos, cursor: Pos) {
    const e = this.edit;
    if (!e) return;
    const ref = range.r1 === range.r2 && range.c1 === range.c2 ? cellName(range.r1, range.c1) : rectName(range);
    const prefix = e.sheet !== this.sheet ? `${quoteSheet(this.sheetName)}!` : "";
    const refText = prefix + ref;
    let start: number;
    let end: number;
    if (e.point) {
      start = e.point.start;
      end = e.point.end;
    } else {
      start = e.caret;
      end = e.caretEnd;
    }
    const text = e.text.slice(0, start) + refText + e.text.slice(end);
    const caret = start + refText.length;
    this.edit = { ...e, text, caret, caretEnd: caret, point: { start, end: caret, anchor, cursor }, suggest: null, sync: this.nextSync() };
    this.ensureVisible(cursor.r, cursor.c);
    this.emit();
  }

  canPoint(): boolean {
    const e = this.edit;
    if (!e || e.mode !== "enter") return false;
    if (e.point && e.caret === e.point.end) return true;
    return canInsertRef(e.text, e.caret);
  }

  /** Mouse pointing is allowed in both enter and edit mode. */
  canPointWithMouse(): boolean {
    const e = this.edit;
    if (!e) return false;
    if (e.point && e.caret === e.point.end) return true;
    return canInsertRef(e.text, e.caret) || (!!refEndingAt(e.text, e.caret) && e.text.startsWith("="));
  }

  pointMove(dr: number, dc: number, extend: boolean) {
    const e = this.edit;
    if (!e) return;
    const base = e.point ? e.point.cursor : { r: e.row, c: e.col };
    const anchor = e.point && extend ? e.point.anchor : undefined;
    let r = base.r;
    let c = base.c;
    if (!e.point) {
      // first press: start from the edited cell
    }
    if (dr > 0) r = this.rows.next(r, dr);
    if (dr < 0) r = this.rows.prev(r, -dr);
    if (dc > 0) c = this.cols.next(c, dc);
    if (dc < 0) c = this.cols.prev(c, -dc);
    const a = anchor ?? { r, c };
    this.pointTo(rect(a.r, a.c, r, c), a, { r, c });
  }

  async cycleReference() {
    const e = this.edit;
    if (!e || !e.text.startsWith("=")) return;
    try {
      const [text, start, end] = await api.cycleReference(this.id, e.text, e.caret, e.caretEnd);
      if (this.edit !== e) return;
      this.edit = { ...e, text, caret: end, caretEnd: end, point: null, sync: this.nextSync() };
      void start;
      this.emit();
    } catch {
      /* not on a reference */
    }
  }

  // ------------------------------------------------------------------
  // Mutations
  // ------------------------------------------------------------------

  fail(e: unknown) {
    const msg = errorMessage(e);
    console.error(msg);
    this.ui?.error(msg);
  }

  /** Runs a mutation returning WorkbookInfo and refreshes the view. */
  async run(p: Promise<WorkbookInfo>): Promise<boolean> {
    try {
      const info = await p;
      await this.setInfo(info);
      return true;
    } catch (e) {
      this.fail(e);
      return false;
    }
  }

  get range() {
    return this.sel.range;
  }

  /** Selection limited to the used area (avoids 1M-row loops for full columns). */
  usedClamp(r: Rect): Rect {
    const maxRow = Math.max(this.layout?.maxRow ?? 1, 1);
    const maxCol = Math.max(this.layout?.maxCol ?? 1, 1);
    return {
      r1: r.r1,
      c1: r.c1,
      r2: isFullCols(r) ? Math.max(r.r1, maxRow) : r.r2,
      c2: isFullRows(r) ? Math.max(r.c1, maxCol) : r.c2,
    };
  }

  style(patch: StylePatch) {
    return this.run(api.style(this.id, this.sheet, this.range, patch));
  }

  toggle(prop: "bold" | "italic" | "underline" | "strike") {
    const current = this.activeInfo?.style[prop] ?? false;
    return this.style({ [prop]: !current });
  }

  borders(kind: string, style = "thin", color = "#000000") {
    return this.run(api.borders(this.id, this.sheet, this.range, kind, style, color));
  }

  decimals(delta: number) {
    const { r, c } = this.sel.active;
    return this.run(api.decimals(this.id, this.sheet, this.range, r, c, delta));
  }

  async applyCellStyle(name: string) {
    const def = cellStyle(name);
    if (!def) return;
    if (!def.patch) {
      await this.run(api.clear(this.id, this.sheet, this.range, "formats"));
      return;
    }
    await this.style(def.patch);
  }

  async formatAsTable(styleId = DEFAULT_TABLE_STYLE) {
    const def = TABLE_STYLES.find((t) => t.id === styleId) ?? TABLE_STYLES[0];
    let target = this.range;
    if (target.r1 === target.r2 && target.c1 === target.c2) {
      target = await api.currentRegion(this.id, this.sheet, target.r1, target.c1);
    }
    if (target.r1 === target.r2 && target.c1 === target.c2) {
      this.ui?.error("Select a range with data (including headers) to format as a table.");
      return;
    }
    this.selectRange(target);
    await this.run(api.tableStyle(this.id, this.sheet, target, def.header, def.odd, def.even, true));
  }

  merge(mode: "center" | "across" | "merge" | "unmerge") {
    return this.run(api.merge(this.id, this.sheet, this.range, mode));
  }

  isMerged(): boolean {
    const r = this.range;
    return (this.layout?.merges ?? []).some(([r1, c1, r2, c2]) => r1 <= r.r2 && r.r1 <= r2 && c1 <= r.c2 && r.c1 <= c2);
  }

  clear(what: "all" | "contents" | "formats") {
    return this.run(api.clear(this.id, this.sheet, this.range, what));
  }

  async undo() {
    if (this.edit) {
      this.cancelEdit();
      return;
    }
    await this.run(api.undo(this.id));
  }

  async redo() {
    await this.run(api.redo(this.id));
  }

  // Rows / columns
  async insertRows() {
    const r = this.range;
    await this.run(api.insertRows(this.id, this.sheet, r.r1, r.r2 - r.r1 + 1));
  }

  async deleteRows() {
    const r = this.range;
    await this.run(api.deleteRows(this.id, this.sheet, r.r1, Math.min(r.r2, LAST_ROW) - r.r1 + 1));
  }

  async insertCols() {
    const r = this.range;
    await this.run(api.insertCols(this.id, this.sheet, r.c1, r.c2 - r.c1 + 1));
  }

  async deleteCols() {
    const r = this.range;
    await this.run(api.deleteCols(this.id, this.sheet, r.c1, r.c2 - r.c1 + 1));
  }

  async insertCells(shift: "down" | "right" | "row" | "col") {
    if (shift === "row") return this.insertRows();
    if (shift === "col") return this.insertCols();
    await this.run(api.insertCells(this.id, this.sheet, this.range, shift));
  }

  async deleteCells(shift: "up" | "left" | "row" | "col") {
    if (shift === "row") return this.deleteRows();
    if (shift === "col") return this.deleteCols();
    await this.run(api.deleteCells(this.id, this.sheet, this.range, shift));
  }

  setHidden(axis: "rows" | "cols", hidden: boolean) {
    const r = this.range;
    if (axis === "rows") return this.run(api.setHidden(this.id, this.sheet, "rows", r.r1, r.r2, hidden));
    return this.run(api.setHidden(this.id, this.sheet, "cols", r.c1, r.c2, hidden));
  }

  unhideAround(axis: "rows" | "cols") {
    const r = this.range;
    // Unhide within the selection, plus neighbours when a single row/col is selected
    if (axis === "rows") {
      const a = r.r1 === r.r2 ? Math.max(1, r.r1 - 1) : r.r1;
      const b = r.r1 === r.r2 ? r.r2 + 1 : r.r2;
      return this.run(api.setHidden(this.id, this.sheet, "rows", a, Math.min(b, LAST_ROW), false));
    }
    const a = r.c1 === r.c2 ? Math.max(1, r.c1 - 1) : r.c1;
    const b = r.c1 === r.c2 ? r.c2 + 1 : r.c2;
    return this.run(api.setHidden(this.id, this.sheet, "cols", a, Math.min(b, LAST_COL), false));
  }

  setColWidth(px: number, c1 = this.range.c1, c2 = this.range.c2) {
    return this.run(api.colWidth(this.id, this.sheet, c1, c2, px));
  }

  setRowHeight(px: number, r1 = this.range.r1, r2 = this.range.r2) {
    return this.run(api.rowHeight(this.id, this.sheet, r1, r2, px));
  }

  /** AutoFit column widths from measured text. */
  async autoFitCols(c1 = this.range.c1, c2 = this.range.c2) {
    const maxRow = Math.max(1, this.layout?.maxRow ?? 1);
    const cols = Math.min(c2, Math.max(c1, this.layout?.maxCol ?? c1));
    try {
      const chunk = await api.cells(this.id, this.sheet, rect(1, c1, maxRow, cols), this.showFormulas);
      const ctx = document.createElement("canvas").getContext("2d")!;
      const widths = new Map<number, number>();
      const merged = this.merges();
      for (const [r, c, text, , s] of chunk.cells) {
        if (!text) continue;
        if (merged.some((m) => contains(m, r, c) && m.c1 !== m.c2)) continue;
        const st = chunk.styles[s];
        ctx.font = fontCss(st, this.info.defaultFont, 1);
        const lines = st.wrap ? text.split("\n") : [text];
        const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
        widths.set(c, Math.max(widths.get(c) ?? 0, Math.ceil(w + 8)));
      }
      const list: [number, number][] = [];
      for (let c = c1; c <= Math.min(c2, c1 + 500); c++) {
        list.push([c, Math.min(1000, widths.get(c) ?? this.layout?.defaultColPx ?? 64)]);
      }
      await this.run(api.colWidths(this.id, this.sheet, list));
    } catch (e) {
      this.fail(e);
    }
  }

  async autoFitRows(r1 = this.range.r1, r2 = this.range.r2) {
    const last = Math.min(r2, Math.max(r1, this.layout?.maxRow ?? r1), r1 + 2000);
    try {
      const chunk = await api.cells(this.id, this.sheet, rect(r1, 1, last, Math.max(1, this.layout?.maxCol ?? 1)), false);
      const ctx = document.createElement("canvas").getContext("2d")!;
      const heights = new Map<number, number>();
      for (const [r, c, text, , s] of chunk.cells) {
        const st = chunk.styles[s];
        const fontPx = (st.size * 4) / 3;
        let lines = text ? text.split("\n").length : 1;
        if (st.wrap && text) {
          ctx.font = fontCss(st, this.info.defaultFont, 1);
          const width = Math.max(10, this.cols.size(c) / this.zoom - 6);
          lines = wrapLines(ctx, text, width).length;
        }
        const h = Math.ceil(lines * fontPx * 1.25 + 5);
        heights.set(r, Math.max(heights.get(r) ?? 20, h));
      }
      const list: [number, number][] = [];
      for (let r = r1; r <= last; r++) list.push([r, Math.max(20, heights.get(r) ?? 20)]);
      await this.run(api.rowHeights(this.id, this.sheet, list));
    } catch (e) {
      this.fail(e);
    }
  }

  // Freeze panes
  freezePanes() {
    const { r, c } = this.sel.active;
    const topRow = this.rowAt(this.originY + 1);
    const leftCol = this.colAt(this.originX + 1);
    void topRow;
    void leftCol;
    return this.run(api.freeze(this.id, this.sheet, Math.max(0, r - 1), Math.max(0, c - 1))).then(() => this.scrollTo(0, 0));
  }

  freezeTopRow() {
    return this.run(api.freeze(this.id, this.sheet, 1, 0)).then(() => this.scrollTo(0, 0));
  }

  freezeFirstCol() {
    return this.run(api.freeze(this.id, this.sheet, 0, 1)).then(() => this.scrollTo(0, 0));
  }

  unfreeze() {
    return this.run(api.freeze(this.id, this.sheet, 0, 0));
  }

  setGridLines(show: boolean) {
    return this.run(api.gridLines(this.id, this.sheet, show));
  }

  toggleShowFormulas() {
    this.showFormulas = !this.showFormulas;
    this.invalidate();
    this.emit();
  }

  // Sheets
  addSheet() {
    return this.run(api.addSheet(this.id, this.sheet));
  }

  async deleteSheet(index = this.sheet) {
    const answer = await this.ui?.ask(
      "Delete Sheet",
      `This sheet may contain data. To permanently delete "${this.info.sheets[index]?.name}", click Delete.`,
      [
        { label: "Delete", value: "delete", primary: true },
        { label: "Cancel", value: "cancel" },
      ],
    );
    if (answer !== "delete") return;
    await this.run(api.deleteSheet(this.id, index));
  }

  renameSheet(index: number, name: string) {
    return this.run(api.renameSheet(this.id, index, name));
  }

  moveSheet(from: number, to: number) {
    return this.run(api.moveSheet(this.id, from, to));
  }

  duplicateSheet(index = this.sheet) {
    return this.run(api.duplicateSheet(this.id, index));
  }

  setSheetHidden(index: number, hidden: boolean) {
    return this.run(api.setSheetHidden(this.id, index, hidden));
  }

  setSheetColor(index: number, color: string) {
    return this.run(api.setSheetColor(this.id, index, color));
  }

  nextSheet(dir: 1 | -1) {
    const sheets = this.info.sheets;
    let i = this.sheet;
    for (let n = 0; n < sheets.length; n++) {
      i = (i + dir + sheets.length) % sheets.length;
      if (!sheets[i].hidden) break;
    }
    if (i !== this.sheet) this.switchSheet(i);
  }

  // Clipboard
  async copy(cut = false) {
    try {
      const text = await api.copy(this.id, this.sheet, this.range, cut);
      this.clip = { sheet: this.sheet, rect: this.usedClamp(this.range), cut };
      this.emit();
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* clipboard permission may be denied; internal clipboard still works */
      }
    } catch (e) {
      this.fail(e);
    }
  }

  async paste(mode: "all" | "values" | "formats" | "formulas" = "all", text?: string | null) {
    let clipboardText = text ?? null;
    if (clipboardText === null || clipboardText === undefined) {
      try {
        clipboardText = await navigator.clipboard.readText();
      } catch {
        clipboardText = null;
      }
    }
    try {
      const res = await api.paste(this.id, this.sheet, this.range, mode, clipboardText);
      if (this.clip?.cut) this.clip = null;
      await this.setInfo(res.info);
      this.selectRange(res.rect, undefined, true);
    } catch (e) {
      this.fail(e);
    }
  }

  clearClip() {
    if (this.clip) {
      this.clip = null;
      this.emit();
    }
  }

  armPainter(sticky = false) {
    this.copy(false).then(() => {
      this.painter = { sticky };
      this.emit();
    });
  }

  async applyPainter() {
    if (!this.painter) return;
    const sticky = this.painter.sticky;
    await this.paste("formats");
    if (!sticky) {
      this.painter = null;
      this.clip = null;
      this.emit();
    }
  }

  // Fill
  async fill(target: Rect) {
    const source = this.range;
    if (sameRect(source, target)) return;
    const ok = await this.run(api.fill(this.id, this.sheet, source, target));
    if (ok) this.selectRange(target, this.sel.active, false);
  }

  async fillDirection(dir: "down" | "right" | "up" | "left") {
    const r = this.range;
    if (dir === "down") {
      if (r.r1 === r.r2) {
        if (r.r1 === 1) return;
        // Ctrl+D with one row copies from the row above
        return this.run(api.fill(this.id, this.sheet, rect(r.r1 - 1, r.c1, r.r1 - 1, r.c2), rect(r.r1 - 1, r.c1, r.r2, r.c2)));
      }
      return this.run(api.fill(this.id, this.sheet, rect(r.r1, r.c1, r.r1, r.c2), r));
    }
    if (dir === "right") {
      if (r.c1 === r.c2) {
        if (r.c1 === 1) return;
        return this.run(api.fill(this.id, this.sheet, rect(r.r1, r.c1 - 1, r.r2, r.c1 - 1), rect(r.r1, r.c1 - 1, r.r2, r.c2)));
      }
      return this.run(api.fill(this.id, this.sheet, rect(r.r1, r.c1, r.r2, r.c1), r));
    }
    if (dir === "up") return this.run(api.fill(this.id, this.sheet, rect(r.r2, r.c1, r.r2, r.c2), r));
    return this.run(api.fill(this.id, this.sheet, rect(r.r1, r.c2, r.r2, r.c2), r));
  }

  // Data
  async sort(ascending: boolean) {
    let target = this.range;
    const single = target.r1 === target.r2 && target.c1 === target.c2;
    if (single || isFullCols(target)) {
      target = await api.currentRegion(this.id, this.sheet, this.sel.active.r, this.sel.active.c);
    }
    target = this.usedClamp(target);
    const hasHeader = await this.guessHeader(target);
    await this.run(api.sort(this.id, this.sheet, target, [{ column: this.sel.active.c, ascending }], hasHeader));
  }

  /** Heuristic used by Excel: first row is text while the second has numbers. */
  async guessHeader(target: Rect): Promise<boolean> {
    if (target.r2 - target.r1 < 1) return false;
    try {
      const chunk = await api.cells(this.id, this.sheet, rect(target.r1, target.c1, target.r1 + 1, target.c2), false);
      const first = chunk.cells.filter((c) => c[0] === target.r1);
      const second = chunk.cells.filter((c) => c[0] === target.r1 + 1);
      const firstAllText = first.length > 0 && first.every((c) => (c[3] & 7) === Kind.TEXT);
      const secondHasNumber = second.some((c) => (c[3] & 7) === Kind.NUMBER);
      const firstBold = first.some((c) => chunk.styles[c[4]]?.bold);
      return (firstAllText && secondHasNumber) || firstBold;
    } catch {
      return false;
    }
  }

  async autoSum(fn = "SUM") {
    const range = this.range;
    const single = range.r1 === range.r2 && range.c1 === range.c2;
    if (!single && !isFullCols(range) && !isFullRows(range)) {
      // Multi-cell selection: put totals below each column
      const below = range.r2 + 1;
      const inputs: Promise<WorkbookInfo>[] = [];
      for (let c = range.c1; c <= range.c2; c++) {
        inputs.push(api.setCell(this.id, this.sheet, below, c, `=${fn}(${cellName(range.r1, c)}:${cellName(range.r2, c)})`));
      }
      try {
        const infos = await Promise.all(inputs);
        await this.setInfo(infos[infos.length - 1]);
      } catch (e) {
        this.fail(e);
      }
      return;
    }
    const { r, c } = this.sel.active;
    // Look up for numbers first, then left
    let ref = "";
    const isNum = (rr: number, cc: number) => {
      const e = this.cache.get(rr, cc);
      return !!e && (e.kind & 7) === Kind.NUMBER;
    };
    let top = r - 1;
    while (top >= 1 && isNum(top, c)) top--;
    if (top < r - 1) ref = `${cellName(top + 1, c)}:${cellName(r - 1, c)}`;
    else {
      let left = c - 1;
      while (left >= 1 && isNum(r, left)) left--;
      if (left < c - 1) ref = `${cellName(r, left + 1)}:${cellName(r, c - 1)}`;
    }
    this.startEdit("enter", `=${fn}(${ref})`);
    const e = this.edit as EditState | null;
    if (!e) return;
    if (ref) {
      const start = fn.length + 2;
      const end = start + ref.length;
      const pr = parseRange(ref)!;
      this.edit = { ...e, caret: end, caretEnd: end, point: { start, end, anchor: { r: pr.r1, c: pr.c1 }, cursor: { r: pr.r2, c: pr.c2 } }, sync: this.nextSync() };
    } else {
      const caret = e.text.length - 1;
      this.edit = { ...e, caret, caretEnd: caret, sync: this.nextSync() };
    }
    this.emit();
  }

  insertText(text: string) {
    if (this.edit) {
      const e = this.edit;
      const t = e.text.slice(0, e.caret) + text + e.text.slice(e.caretEnd);
      const caret = e.caret + text.length;
      this.updateEdit(t, caret, caret, true);
    } else {
      this.startEdit("enter", text);
    }
  }

  insertFunction(name: string) {
    if (this.edit) this.insertText(`${name}(`);
    else this.startEdit("enter", `=${name}(`);
  }

  insertDate() {
    if (this.edit) this.insertText(todayInput());
    else api.setCell(this.id, this.sheet, this.sel.active.r, this.sel.active.c, todayInput()).then((i) => this.setInfo(i), (e) => this.fail(e));
  }

  insertTime() {
    if (this.edit) this.insertText(nowTimeInput());
    else api.setCell(this.id, this.sheet, this.sel.active.r, this.sel.active.c, nowTimeInput()).then((i) => this.setInfo(i), (e) => this.fail(e));
  }

  recalculate() {
    return this.run(api.recalculate(this.id));
  }

  async save(): Promise<boolean> {
    if (this.edit) await this.commitEdit("none");
    if (!this.info.path) return (await this.ui?.saveAs()) ?? false;
    try {
      const info = await api.save(this.id);
      await this.setInfo(info);
      return true;
    } catch (e) {
      this.fail(e);
      return false;
    }
  }

  nameBoxText(): string {
    const e = this.edit;
    if (e?.point) {
      const p = e.point;
      return rectName(rect(p.anchor.r, p.anchor.c, p.cursor.r, p.cursor.c));
    }
    const r = this.sel.range;
    if (r.r1 === 1 && r.r2 === LAST_ROW && r.c1 === 1 && r.c2 === LAST_COL) return cellName(this.sel.active.r, this.sel.active.c);
    if (isFullCols(r) || isFullRows(r)) {
      const rows = r.r2 - r.r1 + 1;
      const cols = r.c2 - r.c1 + 1;
      if (this.dragging) return isFullCols(r) ? `${rows >= LAST_ROW ? "1048576" : rows}R x ${cols}C` : `${rows}R x ${cols}C`;
      return cellName(this.sel.active.r, this.sel.active.c);
    }
    if (this.dragging && !(r.r1 === r.r2 && r.c1 === r.c2)) return `${r.r2 - r.r1 + 1}R x ${r.c2 - r.c1 + 1}C`;
    return cellName(this.sel.active.r, this.sel.active.c);
  }

  dragging = false;

  colLabel(c: number) {
    return colName(c);
  }
}

function quoteSheet(name: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

export function fontCss(style: { font?: string; size: number; bold?: boolean; italic?: boolean }, defaultFont: string, zoom: number): string {
  const px = Math.max(1, (style.size * 4 * zoom) / 3);
  const family = style.font || defaultFont || "Aptos Narrow";
  return `${style.italic ? "italic " : ""}${style.bold ? "bold " : ""}${px.toFixed(2)}px "${family}", "Aptos Narrow", Aptos, Calibri, "Segoe UI", sans-serif`;
}

export function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/(\s+)/);
    let line = "";
    for (const w of words) {
      const test = line + w;
      if (ctx.measureText(test).width <= width || line === "") {
        if (ctx.measureText(test).width > width && line === "") {
          // Break long words
          let chunk = "";
          for (const ch of w) {
            if (ctx.measureText(chunk + ch).width > width && chunk) {
              out.push(chunk);
              chunk = ch;
            } else chunk += ch;
          }
          line = chunk;
        } else line = test;
      } else {
        out.push(line.trimEnd());
        line = w.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}
