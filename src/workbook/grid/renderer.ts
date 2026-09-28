// Canvas renderer for the sheet grid. Everything is drawn in device pixels so
// gridlines stay 1 physical pixel wide at any display scaling.

import { Kind, type BorderDto, type CfExtraDto, type Rect, type StyleDto } from "../../api/types";
import { colName, isFullCols, isFullRows, LAST_COL, LAST_ROW } from "../../lib/a1";
import { fontCss, wrapLines, type WorkbookController } from "../controller";
import type { CellEntry } from "./cache";

export interface GridTheme {
  headerBg: string;
  headerText: string;
  headerLine: string;
  headerSelBg: string;
  headerSelText: string;
  headerSelLine: string;
  headerFullBg: string;
  headerFullText: string;
  cornerTri: string;
  gridLine: string;
  cellBg: string;
  selFill: string;
  selBorder: string;
  frozenLine: string;
  uiFont: string;
}

export function readTheme(el: HTMLElement): GridTheme {
  const cs = getComputedStyle(el);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return {
    headerBg: v("--grid-header-bg", "#262626"),
    headerText: v("--grid-header-text", "#cfcfcf"),
    headerLine: v("--grid-header-line", "#3d3d3d"),
    headerSelBg: v("--grid-header-sel-bg", "#3b3b3b"),
    headerSelText: v("--grid-header-sel-text", "#7ed3a2"),
    headerSelLine: v("--grid-header-sel-line", "#4cae75"),
    headerFullBg: v("--grid-header-full-bg", "#4a4a4a"),
    headerFullText: v("--grid-header-full-text", "#9be3b9"),
    cornerTri: v("--grid-corner-tri", "#8f8f8f"),
    gridLine: v("--grid-line", "#D4D4D4"),
    cellBg: v("--grid-cell-bg", "#FFFFFF"),
    selFill: v("--grid-sel-fill", "rgba(20, 20, 20, 0.10)"),
    selBorder: v("--grid-sel-border", "#107C41"),
    frozenLine: v("--grid-frozen-line", "#9E9E9E"),
    uiFont: v("--grid-header-font", '"Segoe UI", system-ui, sans-serif'),
  };
}

const BORDER_WEIGHT: Record<string, number> = {
  thin: 1,
  hair: 1,
  dotted: 1,
  mediumdashed: 2,
  mediumdashdot: 2,
  mediumdashdotdot: 2,
  slantdashdot: 2,
  medium: 2,
  double: 3,
  thick: 3,
};

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style: string;
  color: string;
  weight: number;
}

const measureCache = new Map<string, number>();

function measure(ctx: CanvasRenderingContext2D, font: string, text: string): number {
  const key = font + "\u0001" + text;
  let w = measureCache.get(key);
  if (w === undefined) {
    w = ctx.measureText(text).width;
    if (measureCache.size > 20000) measureCache.clear();
    measureCache.set(key, w);
  }
  return w;
}

interface Pane {
  rows: [number, number];
  cols: [number, number];
  clip: { x: number; y: number; w: number; h: number };
}

export class GridRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private theme: GridTheme;
  antsOffset = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private ctl: WorkbookController,
    theme: GridTheme,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.theme = theme;
  }

  setTheme(theme: GridTheme) {
    this.theme = theme;
  }

  resize(width: number, height: number, dpr: number) {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  /** css px -> device px */
  private d(v: number) {
    return Math.round(v * this.dpr);
  }

  draw() {
    const ctl = this.ctl;
    const ctx = this.ctx;
    const t = this.theme;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = t.cellBg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!ctl.layout) return;

    const vis = ctl.visibleRanges();
    const W = ctl.viewport.width;
    const H = ctl.viewport.height;
    const hw = ctl.headerW;
    const hh = ctl.headerH;
    const ox = ctl.originX;
    const oy = ctl.originY;
    const panes: Pane[] = [
      { rows: [vis.main.r1, vis.main.r2], cols: [vis.main.c1, vis.main.c2], clip: { x: ox, y: oy, w: W - ox, h: H - oy } },
    ];
    if (vis.top) panes.push({ rows: [vis.top.r1, vis.top.r2], cols: [vis.main.c1, vis.main.c2], clip: { x: ox, y: hh, w: W - ox, h: oy - hh } });
    if (vis.left) panes.push({ rows: [vis.main.r1, vis.main.r2], cols: [vis.left.c1, vis.left.c2], clip: { x: hw, y: oy, w: ox - hw, h: H - oy } });
    if (vis.corner) panes.push({ rows: [1, vis.corner.r2], cols: [1, vis.corner.c2], clip: { x: hw, y: hh, w: ox - hw, h: oy - hh } });

    for (const pane of panes) this.drawPane(pane);
    for (const pane of panes) this.drawOverlays(pane);

    // Frozen pane dividers
    if (ctl.frozenRows > 0) {
      ctx.fillStyle = t.frozenLine;
      ctx.fillRect(this.d(hw), this.d(oy) - 1, this.d(W - hw), 1);
    }
    if (ctl.frozenCols > 0) {
      ctx.fillStyle = t.frozenLine;
      ctx.fillRect(this.d(ox) - 1, this.d(hh), 1, this.d(H - hh));
    }
    if (ctl.showHeadings) this.drawHeaders(panes);
  }

  private drawPane(p: Pane) {
    const ctl = this.ctl;
    const ctx = this.ctx;
    const t = this.theme;
    const cache = ctl.cache;
    const [r1, r2] = p.rows;
    const [c1, c2] = p.cols;
    const clip = p.clip;
    if (clip.w <= 0 || clip.h <= 0) return;
    const d = (v: number) => this.d(v);
    ctx.save();
    ctx.beginPath();
    ctx.rect(d(clip.x), d(clip.y), d(clip.x + clip.w) - d(clip.x), d(clip.y + clip.h) - d(clip.y));
    ctx.clip();

    const X = (c: number) => ctl.colX(c);
    const Y = (r: number) => ctl.rowY(r);
    const cw = (c: number) => ctl.cols.size(c);
    const rh = (r: number) => ctl.rows.size(r);
    const merges = ctl.merges().filter((m) => m.r1 <= r2 && m.r2 >= r1 && m.c1 <= c2 && m.c2 >= c1);
    const inMergeNonAnchor = (r: number, c: number) =>
      merges.some((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2 && (r !== m.r1 || c !== m.c1));
    const mergeOf = (r: number, c: number) => merges.find((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);

    // 1. Column/row level fills (formats applied to whole columns or rows)
    const xL = X(c1);
    const xR = X(c2) + cw(c2);
    const yT = Y(r1);
    const yB = Y(r2) + rh(r2);
    for (const [a, b, style] of cache.colStyles) {
      if (!style.fill || b < c1 || a > c2) continue;
      ctx.fillStyle = style.fill;
      const x1 = X(Math.max(a, c1));
      const x2 = X(Math.min(b, c2)) + cw(Math.min(b, c2));
      ctx.fillRect(d(x1), d(yT), d(x2) - d(x1), d(yB) - d(yT));
    }
    for (const [r, style] of cache.rowStyles) {
      if (r < r1 || r > r2) continue;
      ctx.fillStyle = style.fill || t.cellBg;
      if (!style.fill && cache.colStyles.every(([, , s]) => !s.fill)) continue;
      ctx.fillRect(d(xL), d(Y(r)), d(xR) - d(xL), d(Y(r) + rh(r)) - d(Y(r)));
    }

    // 2. Gridlines
    if (ctl.layout?.showGridLines !== false) {
      ctx.fillStyle = t.gridLine;
      for (let c = c1; c <= c2; c++) {
        const w = cw(c);
        if (w === 0) continue;
        ctx.fillRect(d(X(c) + w) - 1, d(yT), 1, d(yB) - d(yT));
      }
      for (let r = r1; r <= r2; r++) {
        const h = rh(r);
        if (h === 0) continue;
        ctx.fillRect(d(xL), d(Y(r) + h) - 1, d(xR) - d(xL), 1);
      }
    }

    // 3. Cell fills (and white-out merged areas)
    const fillRect = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(d(x) - 1, d(y) - 1, d(x + w) - d(x) + 1, d(y + h) - d(y) + 1);
    };
    cache.forEach((r, c, e) => {
      if (r < r1 || r > r2 || c < c1 || c > c2) return;
      if (!e.style.fill) return;
      if (inMergeNonAnchor(r, c)) return;
      if (mergeOf(r, c)) return;
      fillRect(X(c), Y(r), cw(c), rh(r), e.style.fill);
    });
    for (const m of merges) {
      const st = cache.styleAt(m.r1, m.c1);
      const box = ctl.rangeBox(m);
      ctx.fillStyle = st.fill || t.cellBg;
      ctx.fillRect(d(box.x), d(box.y), d(box.x + box.w) - d(box.x) - 1, d(box.y + box.h) - d(box.y) - 1);
      if (st.fill) fillRect(box.x, box.y, box.w, box.h, st.fill);
    }

    // 4. Conditional formatting data bars (under the text)
    cache.forEach((r, c, e) => {
      if (!e.extra?.dataBar || r < r1 || r > r2 || c < c1 || c > c2) return;
      this.drawDataBar(e.extra, X(c), Y(r), cw(c), rh(r));
    });

    // 5. Text
    for (let r = r1; r <= r2; r++) {
      if (rh(r) === 0) continue;
      const cols = cache.rowCells(r);
      if (!cols.length) continue;
      // Cells just outside the pane may overflow into it
      let first = cols.findIndex((c) => c >= c1);
      if (first < 0) first = cols.length;
      const from = Math.max(0, first - 1);
      for (let i = from; i < cols.length; i++) {
        const c = cols[i];
        if (c > c2 + 1 && i > from) {
          // one cell beyond the right edge can overflow leftwards
          if (cols[i - 1] > c2) break;
        }
        if (inMergeNonAnchor(r, c)) continue;
        const e = cache.get(r, c);
        if (!e || !e.text) continue;
        const m = mergeOf(r, c);
        this.drawText(r, c, e, m ?? null, p);
      }
    }
    // Merged cells whose anchor lies outside the pane
    for (const m of merges) {
      if (m.r1 >= r1 && m.c1 >= c1) continue;
      const e = cache.get(m.r1, m.c1);
      if (e?.text) this.drawText(m.r1, m.c1, e, m, p);
    }

    // 6. Borders
    const segs: Segment[] = [];
    const push = (x1: number, y1: number, x2: number, y2: number, b: BorderDto | undefined) => {
      if (!b || b.style === "none") return;
      segs.push({ x1, y1, x2, y2, style: b.style, color: b.color || "#000000", weight: BORDER_WEIGHT[b.style] ?? 1 });
    };
    cache.forEach((r, c, e) => {
      const s = e.style;
      if (!s.borderTop && !s.borderBottom && !s.borderLeft && !s.borderRight) return;
      if (r < r1 - 1 || r > r2 + 1 || c < c1 - 1 || c > c2 + 1) return;
      if (rh(r) === 0 || cw(c) === 0) return;
      const m = mergeOf(r, c);
      if (m && (r !== m.r1 || c !== m.c1)) {
        // Edge cells of merges keep their outer borders
        const x = X(c);
        const y = Y(r);
        if (r === m.r2) push(x - 1, y + rh(r) - 1, x + cw(c) - 1, y + rh(r) - 1, s.borderBottom);
        if (c === m.c2) push(x + cw(c) - 1, y - 1, x + cw(c) - 1, y + rh(r) - 1, s.borderRight);
        if (r === m.r1) push(x - 1, y - 1, x + cw(c) - 1, y - 1, s.borderTop);
        if (c === m.c1) push(x - 1, y - 1, x - 1, y + rh(r) - 1, s.borderLeft);
        return;
      }
      const box = m ? ctl.rangeBox(m) : { x: X(c), y: Y(r), w: cw(c), h: rh(r) };
      const x = box.x - 1;
      const y = box.y - 1;
      const xr = box.x + box.w - 1;
      const yb = box.y + box.h - 1;
      if (m) {
        // Anchor of a merge: top and left borders span the merge
        push(x, y, xr, y, s.borderTop);
        push(x, y, x, yb, s.borderLeft);
        if (m.r1 === m.r2) push(x, yb, xr, yb, s.borderBottom);
        if (m.c1 === m.c2) push(xr, y, xr, yb, s.borderRight);
        return;
      }
      push(x, y, xr, y, s.borderTop);
      push(x, yb, xr, yb, s.borderBottom);
      push(x, y, x, yb, s.borderLeft);
      push(xr, y, xr, yb, s.borderRight);
    });
    segs.sort((a, b) => a.weight - b.weight);
    for (const s of segs) this.drawSegment(s);

    ctx.restore();
  }

  private drawSegment(s: Segment) {
    const ctx = this.ctx;
    const d = (v: number) => this.d(v);
    const horizontal = s.y1 === s.y2;
    const px = Math.max(1, Math.round(this.dpr));
    ctx.fillStyle = s.color;
    const line = (off: number, thick: number, dash?: number[]) => {
      const t = thick * px;
      if (horizontal) {
        const y = d(s.y1 + 1) - Math.ceil(t / 2) + off * px;
        const x1 = d(s.x1 + 1) - px;
        const x2 = d(s.x2 + 1);
        if (!dash) ctx.fillRect(x1, y, x2 - x1 + (thick > 1 ? px : 0), t);
        else dashed(x1, x2, (a, b) => ctx.fillRect(a, y, b - a, t), dash.map((v) => v * px));
      } else {
        const x = d(s.x1 + 1) - Math.ceil(t / 2) + off * px;
        const y1 = d(s.y1 + 1) - px;
        const y2 = d(s.y2 + 1);
        if (!dash) ctx.fillRect(x, y1, t, y2 - y1 + (thick > 1 ? px : 0));
        else dashed(y1, y2, (a, b) => ctx.fillRect(x, a, t, b - a), dash.map((v) => v * px));
      }
    };
    switch (s.style) {
      case "medium":
        line(0, 2);
        break;
      case "thick":
        line(0, 3);
        break;
      case "double":
        line(-1, 1);
        line(1, 1);
        break;
      case "dotted":
      case "hair":
        line(0, 1, [1, 1]);
        break;
      case "mediumdashed":
        line(0, 2, [6, 2]);
        break;
      case "mediumdashdot":
      case "slantdashdot":
        line(0, 2, [6, 2, 2, 2]);
        break;
      case "mediumdashdotdot":
        line(0, 2, [6, 2, 2, 2, 2, 2]);
        break;
      default:
        line(0, 1);
    }
  }

  private drawDataBar(extra: CfExtraDto, x: number, y: number, w: number, h: number) {
    const bar = extra.dataBar!;
    const ctx = this.ctx;
    const d = (v: number) => this.d(v);
    const pad = 2;
    const inner = w - pad * 2;
    const axis = x + pad + inner * Math.max(0, Math.min(1, bar.axis));
    const len = inner * Math.max(-1, Math.min(1, bar.value));
    const bx = len >= 0 ? axis : axis + len;
    const bw = Math.abs(len);
    if (bw < 0.5) return;
    const color = bar.value >= 0 ? bar.positiveColor : bar.negativeColor;
    if (bar.gradient) {
      const g = ctx.createLinearGradient(d(bx), 0, d(bx + bw), 0);
      if (len >= 0) {
        g.addColorStop(0, color);
        g.addColorStop(1, "#FFFFFF");
      } else {
        g.addColorStop(0, "#FFFFFF");
        g.addColorStop(1, color);
      }
      ctx.fillStyle = g;
    } else ctx.fillStyle = color;
    ctx.fillRect(d(bx), d(y + 2), d(bx + bw) - d(bx), d(y + h - 2) - d(y + 2));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(d(bx) + 0.5, d(y + 2) + 0.5, d(bx + bw) - d(bx) - 1, d(y + h - 2) - d(y + 2) - 1);
  }

  private drawIcon(name: string, color: string, x: number, y: number, size: number, filled = true) {
    const ctx = this.ctx;
    const d = (v: number) => this.d(v);
    const cx = d(x + size / 2);
    const cy = d(y + size / 2);
    const s = d(size) / 2 - 1;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, this.dpr * 1.5);
    ctx.beginPath();
    switch (name) {
      case "ArrowUp":
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s, cy);
        ctx.lineTo(cx + s * 0.4, cy);
        ctx.lineTo(cx + s * 0.4, cy + s);
        ctx.lineTo(cx - s * 0.4, cy + s);
        ctx.lineTo(cx - s * 0.4, cy);
        ctx.lineTo(cx - s, cy);
        break;
      case "ArrowDown":
        ctx.moveTo(cx, cy + s);
        ctx.lineTo(cx + s, cy);
        ctx.lineTo(cx + s * 0.4, cy);
        ctx.lineTo(cx + s * 0.4, cy - s);
        ctx.lineTo(cx - s * 0.4, cy - s);
        ctx.lineTo(cx - s * 0.4, cy);
        ctx.lineTo(cx - s, cy);
        break;
      case "ArrowRight":
      case "ArrowAngleUp":
      case "ArrowAngleDown":
        ctx.moveTo(cx + s, cy);
        ctx.lineTo(cx, cy - s);
        ctx.lineTo(cx, cy - s * 0.4);
        ctx.lineTo(cx - s, cy - s * 0.4);
        ctx.lineTo(cx - s, cy + s * 0.4);
        ctx.lineTo(cx, cy + s * 0.4);
        ctx.lineTo(cx, cy + s);
        break;
      case "TriangleUp":
      case "TriangleUpFilled":
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s, cy + s * 0.8);
        ctx.lineTo(cx - s, cy + s * 0.8);
        break;
      case "TriangleDown":
      case "TriangleDownFilled":
        ctx.moveTo(cx, cy + s);
        ctx.lineTo(cx + s, cy - s * 0.8);
        ctx.lineTo(cx - s, cy - s * 0.8);
        break;
      case "FlatRectangle":
        ctx.rect(cx - s, cy - s * 0.35, s * 2, s * 0.7);
        break;
      case "Rhombus":
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s, cy);
        ctx.lineTo(cx, cy + s);
        ctx.lineTo(cx - s, cy);
        break;
      case "Flag":
        ctx.rect(cx - s * 0.7, cy - s, s * 0.2, s * 2);
        ctx.moveTo(cx - s * 0.5, cy - s);
        ctx.lineTo(cx + s, cy - s * 0.5);
        ctx.lineTo(cx - s * 0.5, cy);
        break;
      case "Check":
        ctx.moveTo(cx - s, cy);
        ctx.lineTo(cx - s * 0.3, cy + s * 0.7);
        ctx.lineTo(cx + s, cy - s * 0.7);
        ctx.stroke();
        return;
      case "Cross":
        ctx.moveTo(cx - s * 0.8, cy - s * 0.8);
        ctx.lineTo(cx + s * 0.8, cy + s * 0.8);
        ctx.moveTo(cx + s * 0.8, cy - s * 0.8);
        ctx.lineTo(cx - s * 0.8, cy + s * 0.8);
        ctx.stroke();
        return;
      case "Exclamation":
        ctx.rect(cx - s * 0.15, cy - s, s * 0.3, s * 1.3);
        ctx.rect(cx - s * 0.15, cy + s * 0.55, s * 0.3, s * 0.35);
        break;
      case "Star": {
        for (let i = 0; i < 10; i++) {
          const a = (Math.PI / 5) * i - Math.PI / 2;
          const rad = i % 2 === 0 ? s : s * 0.45;
          const px = cx + Math.cos(a) * rad;
          const py = cy + Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        break;
      }
      default:
        ctx.arc(cx, cy, s, 0, Math.PI * 2);
    }
    ctx.closePath();
    if (filled) ctx.fill();
    else ctx.stroke();
  }

  private drawText(r: number, c: number, e: CellEntry, merge: Rect | null, pane: Pane) {
    const ctl = this.ctl;
    const ctx = this.ctx;
    const d = (v: number) => this.d(v);
    const zoom = ctl.zoom;
    const style: StyleDto = e.style;
    const kind = e.kind & 7;
    const box = merge ? ctl.rangeBox(merge) : { x: ctl.colX(c), y: ctl.rowY(r), w: ctl.cols.size(c), h: ctl.rows.size(r) };
    if (box.w <= 0 || box.h <= 0) return;
    let text = e.text;
    const extra = e.extra;
    if (extra?.dataBar && !extra.dataBar.showValue) return;

    const font = fontCss(style, ctl.info.defaultFont, zoom * this.dpr);
    ctx.font = font;
    const pad = 2 * zoom;
    let iconSpace = 0;
    if (extra?.icon) {
      const size = Math.min(16 * zoom, box.h - 2);
      this.drawIcon(extra.icon.icon, extra.icon.color, box.x + 2, box.y + (box.h - size) / 2, size);
      iconSpace = size + 2;
      if (!extra.icon.showValue) return;
    }
    if (extra?.rating) {
      const size = Math.min(12 * zoom, box.h - 2);
      for (let i = 0; i < extra.rating.max; i++) {
        this.drawIcon(extra.rating.icon, extra.rating.color, box.x + 2 + i * (size + 1), box.y + (box.h - size) / 2, size, i < extra.rating.count);
      }
      iconSpace = extra.rating.max * (size + 1) + 2;
      if (!extra.rating.showValue) return;
    }

    let align = style.hAlign;
    if (align === "general" || align === "fill" || align === "justify" || align === "distributed") {
      if (ctl.showFormulas && e.kind & Kind.FORMULA) align = "left";
      else if (kind === Kind.NUMBER) align = "right";
      else if (kind === Kind.BOOLEAN || kind === Kind.ERROR) align = "center";
      else align = "left";
    } else if (align === "centerContinuous") align = "center";

    const fontPx = (style.size * 4 * zoom) / 3;
    const color = style.color || "#000000";
    const availW = box.w - pad * 2 - iconSpace;
    const x0 = box.x + iconSpace;

    if (style.wrap && !ctl.showFormulas) {
      const lines = wrapLines(ctx, text, Math.max(1, availW * this.dpr));
      const lh = fontPx * 1.2;
      const blockH = lines.length * lh;
      let top: number;
      if (style.vAlign === "top") top = box.y + 1;
      else if (style.vAlign === "center") top = box.y + (box.h - blockH) / 2;
      else top = box.y + box.h - blockH - 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(d(box.x), d(box.y), d(box.x + box.w) - d(box.x) - 1, d(box.y + box.h) - d(box.y) - 1);
      ctx.clip();
      ctx.fillStyle = color;
      ctx.textBaseline = "alphabetic";
      lines.forEach((line, i) => {
        const w = measure(ctx, font, line) / this.dpr;
        let tx = x0 + pad;
        if (align === "right") tx = x0 + box.w - iconSpace - pad - w;
        else if (align === "center") tx = x0 + (box.w - iconSpace - w) / 2;
        const baseline = top + i * lh + fontPx * 0.95;
        ctx.fillText(line, d(tx), d(baseline));
        this.decorate(style, tx, baseline, w, fontPx, color);
      });
      ctx.restore();
      return;
    }

    let w = measure(ctx, font, text) / this.dpr;
    // Numbers that do not fit show ####
    if (kind === Kind.NUMBER && !(e.kind & Kind.FORMULA && ctl.showFormulas) && w > availW) {
      const hashW = measure(ctx, font, "#") / this.dpr;
      text = "#".repeat(Math.max(1, Math.floor(availW / Math.max(1, hashW))));
      w = measure(ctx, font, text) / this.dpr;
      align = "left";
    }
    // Overflow area for text
    let clipL = box.x;
    let clipR = box.x + box.w;
    if (!merge && kind !== Kind.NUMBER && w > availW) {
      const cache = ctl.cache;
      const paneRight = pane.clip.x + pane.clip.w;
      const paneLeft = pane.clip.x;
      if (align === "left" || align === "center") {
        const need = align === "left" ? x0 + pad + w : box.x + box.w / 2 + w / 2 + pad;
        const next = cache.nextFilled(r, c);
        let cc = c;
        while (clipR < need && clipR < paneRight + 200) {
          cc++;
          if (cc >= next || cc > LAST_COL || ctl.mergeAt(r, cc)) break;
          clipR = ctl.colX(cc) + ctl.cols.size(cc);
        }
      }
      if (align === "right" || align === "center") {
        const need = align === "right" ? box.x + box.w - pad - w : box.x + box.w / 2 - w / 2 - pad;
        const prev = cache.prevFilled(r, c);
        let cc = c;
        while (clipL > need && clipL > paneLeft - 200) {
          cc--;
          if (cc <= prev || cc < 1 || ctl.mergeAt(r, cc)) break;
          clipL = ctl.colX(cc);
        }
      }
    }
    let tx: number;
    if (align === "right") tx = box.x + box.w - pad - w;
    else if (align === "center") tx = box.x + (box.w + iconSpace) / 2 - w / 2;
    else tx = x0 + pad;
    let baseline: number;
    if (style.vAlign === "top") baseline = box.y + 2 * zoom + fontPx * 0.9;
    else if (style.vAlign === "center" || style.vAlign === "justify" || style.vAlign === "distributed")
      baseline = box.y + box.h / 2 + fontPx * 0.33;
    else baseline = box.y + box.h - Math.max(2, fontPx * 0.24) - 1;

    ctx.save();
    ctx.beginPath();
    ctx.rect(d(clipL), d(box.y), d(clipR) - d(clipL) - 1, d(box.y + box.h) - d(box.y) - 1);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.textBaseline = "alphabetic";
    // Multi-line text (Alt+Enter) without wrap shows the first lines stacked
    if (text.includes("\n")) {
      const lines = text.split("\n");
      const lh = fontPx * 1.2;
      const blockH = lines.length * lh;
      const top = style.vAlign === "top" ? box.y + 1 : style.vAlign === "center" ? box.y + (box.h - blockH) / 2 : box.y + box.h - blockH - 2;
      lines.forEach((line, i) => {
        const lw = measure(ctx, font, line) / this.dpr;
        let lx = x0 + pad;
        if (align === "right") lx = box.x + box.w - pad - lw;
        else if (align === "center") lx = box.x + box.w / 2 - lw / 2;
        ctx.fillText(line, d(lx), d(top + i * lh + fontPx * 0.95));
      });
    } else {
      ctx.fillText(text, d(tx), d(baseline));
      this.decorate(style, tx, baseline, w, fontPx, color);
    }
    ctx.restore();
  }

  private decorate(style: StyleDto, x: number, baseline: number, w: number, fontPx: number, color: string) {
    if (!style.underline && !style.strike) return;
    const ctx = this.ctx;
    const d = (v: number) => this.d(v);
    const t = Math.max(1, Math.round((fontPx / 14) * this.dpr));
    ctx.fillStyle = color;
    if (style.underline) ctx.fillRect(d(x), d(baseline + Math.max(1, fontPx * 0.1)), d(x + w) - d(x), t);
    if (style.strike) ctx.fillRect(d(x), d(baseline - fontPx * 0.3), d(x + w) - d(x), t);
  }

  private drawOverlays(p: Pane) {
    const ctl = this.ctl;
    const ctx = this.ctx;
    const t = this.theme;
    const d = (v: number) => this.d(v);
    const clip = p.clip;
    if (clip.w <= 0 || clip.h <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(d(clip.x), d(clip.y), d(clip.x + clip.w) - d(clip.x), d(clip.y + clip.h) - d(clip.y));
    ctx.clip();

    const paneRect: Rect = { r1: p.rows[0], c1: p.cols[0], r2: p.rows[1], c2: p.cols[1] };
    const clampToPane = (r: Rect): Rect | null => {
      const out = {
        r1: Math.max(r.r1, paneRect.r1 - 1),
        c1: Math.max(r.c1, paneRect.c1 - 1),
        r2: Math.min(r.r2, paneRect.r2 + 1),
        c2: Math.min(r.c2, paneRect.c2 + 1),
      };
      if (out.r1 > out.r2 || out.c1 > out.c2) return null;
      return out;
    };
    const boxOf = (r: Rect) => {
      // Use the real edges when the range extends beyond the pane
      const b = ctl.rangeBox(r);
      return b;
    };

    // Selection
    const sel = ctl.sel.range;
    const vis = clampToPane(sel);
    const editingPoint = !!ctl.edit;
    if (vis) {
      const box = boxOf(vis);
      const single = sel.r1 === sel.r2 && sel.c1 === sel.c2;
      const merged = ctl.mergeAt(sel.r1, sel.c1);
      const isSingleMerge = merged && merged.r1 === sel.r1 && merged.c1 === sel.c1 && merged.r2 === sel.r2 && merged.c2 === sel.c2;
      if (!single && !isSingleMerge) {
        ctx.fillStyle = t.selFill;
        ctx.fillRect(d(box.x), d(box.y), d(box.x + box.w) - d(box.x) - 1, d(box.y + box.h) - d(box.y) - 1);
        // Active cell stays white
        const a = ctl.sel.active;
        const am = ctl.mergeAt(a.r, a.c) ?? { r1: a.r, c1: a.c, r2: a.r, c2: a.c };
        const ab = ctl.rangeBox(am);
        const st = ctl.cache.styleAt(am.r1, am.c1);
        ctx.fillStyle = st.fill || t.cellBg;
        ctx.fillRect(d(ab.x), d(ab.y), d(ab.x + ab.w) - d(ab.x) - 1, d(ab.y + ab.h) - d(ab.y) - 1);
        // Re-draw active cell text on top of the white-out
        const e = ctl.cache.get(am.r1, am.c1);
        if (e?.text) this.drawText(am.r1, am.c1, e, ctl.mergeAt(am.r1, am.c1), p);
      }
      if (!editingPoint || true) {
        const full = sel;
        const fb = ctl.rangeBox(full);
        // Border drawn at the true edges (may be outside the pane: clipped)
        this.strokeBox(fb.x, fb.y, fb.w, fb.h, t.selBorder, 2);
        if (!ctl.edit && !isFullCols(sel) && !isFullRows(sel)) {
          // Fill handle
          const hx = d(fb.x + fb.w) - 1;
          const hy = d(fb.y + fb.h) - 1;
          const hs = Math.round(6 * this.dpr);
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(hx - hs / 2 - 1, hy - hs / 2 - 1, hs + 2, hs + 2);
          ctx.fillStyle = t.selBorder;
          ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        }
      }
    }

    // Formula reference highlights
    for (const ref of ctl.editRefs()) {
      const rr = clampToPane(ref.rect);
      if (!rr) continue;
      const b = ctl.rangeBox(ref.rect);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = ref.color;
      ctx.fillRect(d(b.x), d(b.y), d(b.x + b.w) - d(b.x), d(b.y + b.h) - d(b.y));
      ctx.globalAlpha = 1;
      this.strokeBox(b.x, b.y, b.w, b.h, ref.color, 2);
      const hs = Math.round(5 * this.dpr);
      ctx.fillStyle = ref.color;
      for (const [cx, cy] of [
        [b.x, b.y],
        [b.x + b.w, b.y],
        [b.x, b.y + b.h],
        [b.x + b.w, b.y + b.h],
      ]) {
        ctx.fillRect(d(cx) - hs / 2 - 1, d(cy) - hs / 2 - 1, hs, hs);
      }
    }

    // Point-mode range (dashed while pointing)
    const pt = ctl.edit?.point;
    if (pt) {
      const r = { r1: Math.min(pt.anchor.r, pt.cursor.r), c1: Math.min(pt.anchor.c, pt.cursor.c), r2: Math.max(pt.anchor.r, pt.cursor.r), c2: Math.max(pt.anchor.c, pt.cursor.c) };
      const b = ctl.rangeBox(r);
      this.dashedBox(b.x, b.y, b.w, b.h, ctl.editRefs().find((x) => x.start === pt.start)?.color ?? t.selBorder, 2, this.antsOffset);
    }

    // Copy / cut marching ants
    if (ctl.clip && ctl.clip.sheet === ctl.sheet) {
      const b = ctl.rangeBox(ctl.clip.rect);
      this.dashedBox(b.x, b.y, b.w, b.h, t.selBorder, 2, this.antsOffset);
    }

    // Fill handle drag preview
    if (ctl.fillPreview) {
      const b = ctl.rangeBox(ctl.fillPreview);
      this.dashedBox(b.x, b.y, b.w, b.h, "#7A7A7A", 1, 0);
    }
    ctx.restore();

    // Resize guide
    if (ctl.resizeGuide) {
      ctx.fillStyle = "#505050";
      const g = ctl.resizeGuide;
      if (g.axis === "col") {
        for (let y = 0; y < this.canvas.height; y += 4) ctx.fillRect(d(g.pos) - 1, y, 1, 2);
      } else {
        for (let x = 0; x < this.canvas.width; x += 4) ctx.fillRect(x, d(g.pos) - 1, 2, 1);
      }
    }
  }

  private strokeBox(x: number, y: number, w: number, h: number, color: string, width: number) {
    const ctx = this.ctx;
    const d = (v: number) => this.d(v);
    const t = Math.max(1, Math.round(width * this.dpr));
    const x1 = d(x) - 1 - Math.floor(t / 2);
    const y1 = d(y) - 1 - Math.floor(t / 2);
    const x2 = d(x + w) - 1 - Math.floor(t / 2);
    const y2 = d(y + h) - 1 - Math.floor(t / 2);
    ctx.fillStyle = color;
    ctx.fillRect(x1, y1, x2 - x1 + t, t);
    ctx.fillRect(x1, y2, x2 - x1 + t, t);
    ctx.fillRect(x1, y1, t, y2 - y1 + t);
    ctx.fillRect(x2, y1, t, y2 - y1 + t);
  }

  private dashedBox(x: number, y: number, w: number, h: number, color: string, width: number, offset: number) {
    const ctx = this.ctx;
    const d = (v: number) => this.d(v);
    ctx.save();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = Math.max(1, width * this.dpr);
    const rx = d(x) - 1;
    const ry = d(y) - 1;
    const rw = d(x + w) - d(x);
    const rh = d(y + h) - d(y);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.strokeStyle = color;
    ctx.setLineDash([4 * this.dpr, 3 * this.dpr]);
    ctx.lineDashOffset = -offset * this.dpr;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();
  }

  private drawHeaders(panes: Pane[]) {
    const ctl = this.ctl;
    const ctx = this.ctx;
    const t = this.theme;
    const d = (v: number) => this.d(v);
    const W = ctl.viewport.width;
    const H = ctl.viewport.height;
    const hw = ctl.headerW;
    const hh = ctl.headerH;
    const sel = ctl.sel.range;
    const fullCols = isFullCols(sel);
    const fullRows = isFullRows(sel);
    const fontPx = Math.round(11 * ctl.zoom * this.dpr + 0.5 * this.dpr);
    ctx.font = `${fontPx}px ${t.uiFont}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    // Column header strip
    ctx.fillStyle = t.headerBg;
    ctx.fillRect(d(hw), 0, d(W) - d(hw), d(hh));
    ctx.fillRect(0, d(hh), d(hw), d(H) - d(hh));

    const colPanes = panes.filter((p) => p.clip.y === ctl.originY || (p.clip.y === hh && p.rows[0] === 1 && !panes.some((q) => q !== p && q.cols === p.cols && q.clip.y > p.clip.y)));
    const drawnCols = new Set<string>();
    for (const p of panes) {
      const key = `${p.cols[0]}-${p.cols[1]}-${p.clip.x}`;
      if (drawnCols.has(key)) continue;
      drawnCols.add(key);
      ctx.save();
      ctx.beginPath();
      ctx.rect(d(p.clip.x), 0, d(p.clip.x + p.clip.w) - d(p.clip.x), d(hh));
      ctx.clip();
      for (let c = p.cols[0]; c <= p.cols[1]; c++) {
        const w = ctl.cols.size(c);
        if (w === 0) continue;
        const x = ctl.colX(c);
        const inSel = c >= sel.c1 && c <= sel.c2;
        if (inSel) {
          ctx.fillStyle = fullCols ? t.headerFullBg : t.headerSelBg;
          ctx.fillRect(d(x), 0, d(x + w) - d(x), d(hh));
          ctx.fillStyle = t.headerSelLine;
          ctx.fillRect(d(x) - 1, d(hh) - Math.round(2 * this.dpr), d(x + w) - d(x) + 1, Math.round(2 * this.dpr));
        }
        ctx.fillStyle = t.headerLine;
        ctx.fillRect(d(x + w) - 1, 0, 1, d(hh));
        if (ctl.cols.hiddenBetween(c, ctl.cols.next(c))) ctx.fillRect(d(x + w) - 2, 0, 2, d(hh));
        ctx.fillStyle = inSel ? (fullCols ? t.headerFullText : t.headerSelText) : t.headerText;
        if (w > 8 * ctl.zoom) ctx.fillText(colName(c), d(x + w / 2), d(hh / 2) + 1);
      }
      ctx.restore();
    }
    void colPanes;

    // Row header strip
    const drawnRows = new Set<string>();
    for (const p of panes) {
      const key = `${p.rows[0]}-${p.rows[1]}-${p.clip.y}`;
      if (drawnRows.has(key)) continue;
      drawnRows.add(key);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, d(p.clip.y), d(hw), d(p.clip.y + p.clip.h) - d(p.clip.y));
      ctx.clip();
      for (let r = p.rows[0]; r <= p.rows[1]; r++) {
        const h = ctl.rows.size(r);
        if (h === 0) continue;
        const y = ctl.rowY(r);
        const inSel = r >= sel.r1 && r <= sel.r2;
        if (inSel) {
          ctx.fillStyle = fullRows ? t.headerFullBg : t.headerSelBg;
          ctx.fillRect(0, d(y), d(hw), d(y + h) - d(y));
          ctx.fillStyle = t.headerSelLine;
          ctx.fillRect(d(hw) - Math.round(2 * this.dpr), d(y) - 1, Math.round(2 * this.dpr), d(y + h) - d(y) + 1);
        }
        ctx.fillStyle = t.headerLine;
        ctx.fillRect(0, d(y + h) - 1, d(hw), 1);
        if (ctl.rows.hiddenBetween(r, ctl.rows.next(r))) ctx.fillRect(0, d(y + h) - 2, d(hw), 2);
        ctx.fillStyle = inSel ? (fullRows ? t.headerFullText : t.headerSelText) : t.headerText;
        if (h > 8 * ctl.zoom) ctx.fillText(String(r), d(hw / 2), d(y + h / 2) + 1);
      }
      ctx.restore();
    }

    // Header separators
    ctx.fillStyle = t.headerLine;
    ctx.fillRect(0, d(hh) - 1, d(W), 1);
    ctx.fillRect(d(hw) - 1, 0, 1, d(H));

    // Select-all corner
    ctx.fillStyle = t.headerBg;
    ctx.fillRect(0, 0, d(hw) - 1, d(hh) - 1);
    const all = sel.r1 === 1 && sel.c1 === 1 && sel.r2 === LAST_ROW && sel.c2 === LAST_COL;
    ctx.fillStyle = all ? t.headerSelLine : t.cornerTri;
    const s = Math.round(Math.min(hw, hh) * 0.55 * this.dpr);
    const cx = d(hw) - Math.round(3 * this.dpr);
    const cy = d(hh) - Math.round(3 * this.dpr);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - s, cy);
    ctx.lineTo(cx, cy - s);
    ctx.closePath();
    ctx.fill();
    ctx.textAlign = "start";
  }
}

function dashed(a: number, b: number, draw: (a: number, b: number) => void, pattern: number[]) {
  let pos = a;
  let i = 0;
  let on = true;
  while (pos < b) {
    const len = pattern[i % pattern.length];
    const end = Math.min(b, pos + len);
    if (on) draw(pos, end);
    pos = end;
    on = !on;
    i++;
  }
}
