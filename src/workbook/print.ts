// Printing / Save as PDF: renders sheets as HTML tables (styles, merges,
// borders, charts) into a print-only layer and opens the system print dialog.

import { createElement, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { api, Kind, type BorderDto, type ChartSpec, type Rect, type SheetLayout, type StyleDto } from "../api";
import { colName } from "../lib/a1";
import { buildChartData, ChartSvg } from "./charts/ChartView";
import type { WorkbookController } from "./controller";

export interface PrintOptions {
  what: "sheet" | "selection" | "workbook";
  landscape: boolean;
  gridlines: boolean;
  headings: boolean;
  fitWidth: boolean;
}

const MAX_ROWS = 20_000;

/** Static markup of a React element (without bundling react-dom/server). */
function staticMarkup(el: ReactElement): string {
  const div = document.createElement("div");
  const root = createRoot(div);
  flushSync(() => root.render(el));
  const html = div.innerHTML;
  root.unmount();
  return html;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function borderCss(b: BorderDto | undefined): string | null {
  if (!b || b.style === "none") return null;
  const map: Record<string, string> = {
    thin: "1px solid",
    hair: "1px solid",
    medium: "2px solid",
    thick: "3px solid",
    dashed: "1px dashed",
    mediumDashed: "2px dashed",
    dotted: "1px dotted",
    double: "3px double",
  };
  return `${map[b.style] ?? "1px solid"} ${b.color || "#000"}`;
}

function cellCss(st: StyleDto, kind: number, defaultFont: string): string {
  const parts: string[] = [];
  if (st.font && st.font !== defaultFont) parts.push(`font-family:"${st.font}",sans-serif`);
  parts.push(`font-size:${st.size}pt`);
  if (st.bold) parts.push("font-weight:bold");
  if (st.italic) parts.push("font-style:italic");
  const deco = [st.underline ? "underline" : "", st.strike ? "line-through" : ""].filter(Boolean).join(" ");
  if (deco) parts.push(`text-decoration:${deco}`);
  if (st.color) parts.push(`color:${st.color}`);
  if (st.fill) parts.push(`background:${st.fill}`);
  const base = kind & 7;
  let align = st.hAlign;
  if (align === "general" || !align) align = base === Kind.NUMBER ? "right" : base === Kind.BOOLEAN || base === Kind.ERROR ? "center" : "left";
  if (align === "centerContinuous") align = "center";
  if (align === "fill" || align === "distributed") align = "left";
  parts.push(`text-align:${align}`);
  parts.push(`vertical-align:${st.vAlign === "top" ? "top" : st.vAlign === "center" ? "middle" : "bottom"}`);
  parts.push(st.wrap ? "white-space:pre-wrap" : "white-space:pre");
  for (const [side, b] of [
    ["top", st.borderTop],
    ["right", st.borderRight],
    ["bottom", st.borderBottom],
    ["left", st.borderLeft],
  ] as const) {
    const css = borderCss(b);
    if (css) parts.push(`border-${side}:${css}`);
  }
  return parts.join(";");
}

async function sheetHtml(ctl: WorkbookController, sheet: number, opts: PrintOptions): Promise<string> {
  const layout: SheetLayout = sheet === ctl.sheet && ctl.layout ? ctl.layout : await api.layout(ctl.id, sheet);
  let rect: Rect;
  if (opts.what === "selection" && sheet === ctl.sheet) rect = ctl.usedClamp(ctl.range);
  else {
    if (!layout.maxRow && !layout.charts.length) return "";
    let maxRow = Math.max(1, layout.maxRow);
    let maxCol = Math.max(1, layout.maxCol);
    for (const c of layout.charts) {
      maxRow = Math.max(maxRow, c.row + Math.ceil(c.height / layout.defaultRowPx));
      maxCol = Math.max(maxCol, c.col + Math.ceil(c.width / layout.defaultColPx));
    }
    rect = { r1: 1, c1: 1, r2: maxRow, c2: maxCol };
  }
  const truncated = rect.r2 - rect.r1 + 1 > MAX_ROWS;
  if (truncated) rect = { ...rect, r2: rect.r1 + MAX_ROWS - 1 };
  const chunk = await api.cells(ctl.id, sheet, rect, false);

  // Geometry
  const colPx = new Map<number, number>();
  for (const [a, b, px] of layout.cols) for (let c = Math.max(a, rect.c1); c <= Math.min(b, rect.c2); c++) colPx.set(c, px);
  const rowPx = new Map<number, number>(layout.rows);
  const cw = (c: number) => colPx.get(c) ?? layout.defaultColPx;
  const rh = (r: number) => rowPx.get(r) ?? layout.defaultRowPx;
  const cols: number[] = [];
  for (let c = rect.c1; c <= rect.c2; c++) if (cw(c) > 0) cols.push(c);

  const cells = new Map<string, [string, number, number]>();
  for (const [r, c, text, kind, s] of chunk.cells) cells.set(`${r}:${c}`, [text, kind, s]);
  const merges = layout.merges.filter(([r1, c1, r2, c2]) => r1 <= rect.r2 && r2 >= rect.r1 && c1 <= rect.c2 && c2 >= rect.c1);
  const covered = new Set<string>();
  const spans = new Map<string, [number, number]>();
  for (const [r1, c1, r2, c2] of merges) {
    let colspan = 0;
    for (let c = c1; c <= c2; c++) if (cw(c) > 0) colspan++;
    let rowspan = 0;
    for (let r = r1; r <= r2; r++) if (rh(r) > 0) rowspan++;
    spans.set(`${r1}:${c1}`, [rowspan, colspan]);
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) covered.add(`${r}:${c}`);
  }

  const headW = opts.headings ? 36 : 0;
  const tableW = headW + cols.reduce((a, c) => a + cw(c), 0);
  const grid = opts.gridlines ? "print-grid" : "";
  const out: string[] = [];
  out.push(`<table class="print-table ${grid}" style="width:${tableW}px">`);
  out.push("<colgroup>");
  if (opts.headings) out.push(`<col style="width:${headW}px">`);
  for (const c of cols) out.push(`<col style="width:${cw(c)}px">`);
  out.push("</colgroup>");
  if (opts.headings) {
    out.push(`<tr style="height:20px"><th></th>${cols.map((c) => `<th>${colName(c)}</th>`).join("")}</tr>`);
  }
  for (let r = rect.r1; r <= rect.r2; r++) {
    const h = rh(r);
    if (h === 0) continue;
    out.push(`<tr style="height:${h}px">`);
    if (opts.headings) out.push(`<th>${r}</th>`);
    for (const c of cols) {
      const key = `${r}:${c}`;
      if (covered.has(key)) continue;
      const entry = cells.get(key);
      const span = spans.get(key);
      const attrs = span ? `${span[0] > 1 ? ` rowspan="${span[0]}"` : ""}${span[1] > 1 ? ` colspan="${span[1]}"` : ""}` : "";
      if (!entry) {
        out.push(`<td${attrs}></td>`);
        continue;
      }
      const [text, kind, s] = entry;
      const st = chunk.styles[s];
      out.push(`<td${attrs} style="${esc(cellCss(st, kind, ctl.info.defaultFont))}">${esc(text)}</td>`);
    }
    out.push("</tr>");
  }
  out.push("</table>");

  // Charts positioned over the table
  const charts: string[] = [];
  for (const chart of layout.charts as ChartSpec[]) {
    if (chart.row < rect.r1 || chart.col < rect.c1 || chart.row > rect.r2 || chart.col > rect.c2) continue;
    let x = headW + chart.dx;
    for (const c of cols) if (c < chart.col) x += cw(c);
    let y = (opts.headings ? 20 : 0) + chart.dy;
    for (let r = rect.r1; r < chart.row; r++) y += rh(r);
    try {
      const values = (await api.rangeValues(ctl.id, sheet, chart.range))
        .filter((_, i) => rh(chart.range.r1 + i) > 0)
        .map((row) => row.filter((_, j) => cw(chart.range.c1 + j) > 0));
      const svg = staticMarkup(
        createElement(ChartSvg, {
          kind: chart.kind,
          title: chart.title,
          legend: chart.legend,
          data: buildChartData(values, chart.seriesInRows),
          width: chart.width,
          height: chart.height,
        }),
      );
      charts.push(`<div class="print-chart" style="left:${x}px;top:${y}px;width:${chart.width}px;height:${chart.height}px">${svg}</div>`);
    } catch {
      /* skip charts whose data cannot be read */
    }
  }

  const pageW = opts.landscape ? 960 : 700;
  const scale = opts.fitWidth && tableW > pageW ? pageW / tableW : 1;
  const name = esc(ctl.info.sheets[sheet]?.name ?? "");
  const note = truncated ? `<p class="print-note">Only the first ${MAX_ROWS.toLocaleString()} rows were printed.</p>` : "";
  return `<section class="print-sheet" data-sheet="${name}" style="zoom:${scale}"><div class="print-body">${out.join("")}${charts.join("")}</div>${note}</section>`;
}

function cleanup() {
  document.getElementById("print-root")?.remove();
  document.getElementById("print-page-style")?.remove();
}

export async function printBook(ctl: WorkbookController, opts: PrintOptions): Promise<void> {
  if (ctl.edit) await ctl.commitEdit("none");
  const sheets =
    opts.what === "workbook" ? ctl.info.sheets.filter((s) => !s.hidden).map((s) => s.index) : [ctl.sheet];
  const parts: string[] = [];
  for (const s of sheets) parts.push(await sheetHtml(ctl, s, opts));
  const html = parts.filter(Boolean).join("");
  if (!html) {
    ctl.ui?.error("There's nothing to print. The sheet is empty.");
    return;
  }
  cleanup();
  const root = document.createElement("div");
  root.id = "print-root";
  root.innerHTML = html;
  document.body.appendChild(root);
  const style = document.createElement("style");
  style.id = "print-page-style";
  style.textContent = `@page { size: ${opts.landscape ? "landscape" : "portrait"}; margin: 12mm; }`;
  document.head.appendChild(style);
  window.addEventListener("afterprint", cleanup, { once: true });
  // Give the layer a frame to lay out before the print snapshot
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  try {
    await Promise.resolve(window.print());
  } catch (e) {
    ctl.fail(e);
  }
}
