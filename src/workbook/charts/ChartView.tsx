// Chart rendering as plain SVG (no charting library: keeps the app small).

import type { ChartKind, RangeValue } from "../../api";

export const PALETTE = ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47", "#264478", "#9E480E", "#636363", "#997300"];

export interface Series {
  name: string;
  values: (number | null)[];
}

export interface ChartData {
  categories: string[];
  series: Series[];
  /** Numeric X values (scatter). */
  x: (number | null)[];
}

const NUMERIC_TEXT = /^[-+]?[\d,]*\.?\d+(e[-+]?\d+)?$/i;

function isLabel(cell: RangeValue | undefined): boolean {
  if (!cell) return true;
  const [n, text] = cell;
  if (n === null) return text.trim() !== "";
  // Dates and other formatted numbers act as labels in the first column
  return !NUMERIC_TEXT.test(text.trim().replace(/%$/, ""));
}

/** Interprets a range like Excel: header row, label column, one series per column (or row). */
export function buildChartData(values: RangeValue[][], seriesInRows: boolean): ChartData {
  let grid = values;
  if (seriesInRows && grid.length) {
    grid = grid[0].map((_, c) => grid.map((row) => row[c]));
  }
  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  if (!rows || !cols) return { categories: [], series: [], x: [] };
  const topLeftEmpty = !grid[0][0][1].trim();
  const hasHeader =
    rows > 1 && (grid[0].some((cell, c) => c > 0 && cell[0] === null && cell[1].trim() !== "") || (cols === 1 && grid[0][0][0] === null && grid[0][0][1] !== ""));
  const body = hasHeader ? grid.slice(1) : grid;
  const labelCol = cols > 1 && ((hasHeader && topLeftEmpty) || body.every((row) => isLabel(row[0]) || !row[0][1].trim()));
  const firstSeries = labelCol ? 1 : 0;
  const categories = body.map((row, i) => (labelCol ? row[0][1] : String(i + 1)));
  const series: Series[] = [];
  for (let c = firstSeries; c < cols; c++) {
    series.push({
      name: hasHeader ? grid[0][c][1] || `Series${series.length + 1}` : `Series${series.length + 1}`,
      values: body.map((row) => row[c][0]),
    });
  }
  const x = body.map((row) => row[0][0]);
  return { categories, series, x };
}

interface Scale {
  lo: number;
  hi: number;
  step: number;
}

function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range));
  const f = range / 10 ** exp;
  let nf: number;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

export function niceScale(min: number, max: number, ticks = 5): Scale {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1, step: 0.2 };
  if (min === max) {
    if (min === 0) return { lo: 0, hi: 1, step: 0.2 };
    const pad = Math.abs(min) * 0.1;
    min -= pad;
    max += pad;
  }
  const range = niceNum(max - min, false);
  const step = niceNum(range / (ticks - 1), true);
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}

export function formatTick(v: number, step: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${+(v / 1e3).toFixed(1)}K`;
  const decimals = step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step)));
  return v.toFixed(decimals);
}

function truncate(text: string, maxChars: number): string {
  if (maxChars < 2) return "";
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text;
}

const AXIS = "#595959";
const GRID = "#D9D9D9";
const FONT = 'Aptos, "Segoe UI", Calibri, system-ui, sans-serif';

export function ChartSvg({
  kind,
  title,
  legend,
  data,
  width,
  height,
}: {
  kind: ChartKind;
  title: string;
  legend: boolean;
  data: ChartData;
  width: number;
  height: number;
}) {
  const pad = 12;
  const shownTitle = title || (data.series.length === 1 ? data.series[0].name : "");
  const titleH = shownTitle ? 30 : 6;
  const pie = kind === "pie" || kind === "doughnut";
  const legendItems = pie ? data.categories : data.series.map((s) => s.name);
  const showLegend = legend && (pie ? legendItems.length > 0 : data.series.length > 1);
  const legendH = showLegend ? 24 : 0;
  const plot = { x: pad, y: titleH, w: width - pad * 2, h: height - titleH - legendH - pad };
  const empty = !data.series.length || data.series.every((s) => s.values.every((v) => v === null));

  let body: React.ReactNode = null;
  if (empty) {
    body = (
      <text x={width / 2} y={height / 2} textAnchor="middle" fill={AXIS} fontSize={12}>
        No numeric data in the selected range
      </text>
    );
  } else if (pie) {
    body = <PieBody data={data} plot={plot} doughnut={kind === "doughnut"} />;
  } else {
    body = <AxisBody kind={kind} data={data} plot={plot} />;
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fontFamily={FONT} style={{ display: "block" }}>
      <rect x={0} y={0} width={width} height={height} fill="#FFFFFF" />
      {shownTitle && (
        <text x={width / 2} y={21} textAnchor="middle" fontSize={15} fill="#404040">
          {truncate(shownTitle, Math.floor(width / 8))}
        </text>
      )}
      {body}
      {showLegend && <Legend items={legendItems} y={height - legendH - 2} width={width} />}
    </svg>
  );
}

function Legend({ items, y, width }: { items: string[]; y: number; width: number }) {
  const maxItems = Math.max(1, Math.floor(width / 70));
  const shown = items.slice(0, maxItems);
  const each = Math.min(140, (width - 20) / shown.length);
  const total = each * shown.length;
  const x0 = (width - total) / 2;
  return (
    <g fontSize={11} fill={AXIS}>
      {shown.map((name, i) => (
        <g key={i} transform={`translate(${x0 + i * each}, ${y + 8})`}>
          <rect x={0} y={0} width={9} height={9} fill={PALETTE[i % PALETTE.length]} />
          <text x={13} y={8.5}>
            {truncate(name, Math.floor((each - 16) / 6))}
          </text>
        </g>
      ))}
    </g>
  );
}

function PieBody({ data, plot, doughnut }: { data: ChartData; plot: { x: number; y: number; w: number; h: number }; doughnut: boolean }) {
  const values = data.series[0].values.map((v) => (v !== null && v > 0 ? v : 0));
  const total = values.reduce((a, b) => a + b, 0);
  const r = Math.max(10, Math.min(plot.w, plot.h) / 2 - 4);
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const inner = doughnut ? r * 0.55 : 0;
  if (total <= 0) return null;
  let angle = -Math.PI / 2;
  const slices: React.ReactNode[] = [];
  values.forEach((v, i) => {
    if (v <= 0) return;
    const a = (v / total) * Math.PI * 2;
    const end = angle + a;
    const color = PALETTE[i % PALETTE.length];
    const large = a > Math.PI ? 1 : 0;
    const p = (rad: number, ang: number) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
    let d: string;
    if (a >= Math.PI * 2 - 1e-9) {
      d = `M${p(r, 0)}A${r},${r} 0 1 1 ${p(r, Math.PI)}A${r},${r} 0 1 1 ${p(r, 0)}Z`;
      if (inner) d += `M${p(inner, 0)}A${inner},${inner} 0 1 0 ${p(inner, Math.PI)}A${inner},${inner} 0 1 0 ${p(inner, 0)}Z`;
    } else if (inner) {
      d = `M${p(r, angle)}A${r},${r} 0 ${large} 1 ${p(r, end)}L${p(inner, end)}A${inner},${inner} 0 ${large} 0 ${p(inner, angle)}Z`;
    } else {
      d = `M${cx},${cy}L${p(r, angle)}A${r},${r} 0 ${large} 1 ${p(r, end)}Z`;
    }
    const mid = angle + a / 2;
    const lr = inner ? (r + inner) / 2 : r * 0.62;
    slices.push(
      <g key={i}>
        <path d={d} fill={color} stroke="#FFFFFF" strokeWidth={1.5} fillRule="evenodd" />
        {a > 0.35 && (
          <text x={cx + lr * Math.cos(mid)} y={cy + lr * Math.sin(mid) + 4} textAnchor="middle" fontSize={11} fill="#FFFFFF">
            {`${Math.round((v / total) * 100)}%`}
          </text>
        )}
      </g>,
    );
    angle = end;
  });
  return <g>{slices}</g>;
}

function AxisBody({ kind, data: input, plot }: { kind: ChartKind; data: ChartData; plot: { x: number; y: number; w: number; h: number } }) {
  const horizontal = kind === "bar";
  const scatter = kind === "scatter";
  let data = input;
  if (scatter) {
    // First numeric column = X values; otherwise plot against 1..n
    const firstIsX = data.series.length > 1 && data.series[0].values.every((v, i) => v === data.x[i]);
    data = firstIsX ? { ...data, series: data.series.slice(1) } : { ...data, x: data.categories.map((_, i) => i + 1) };
  }
  const all = data.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const vmin = Math.min(0, ...all);
  const vmax = Math.max(0, ...all);
  const vs = niceScale(scatter ? Math.min(...all) : vmin, scatter ? Math.max(...all) : vmax);
  const ticks: number[] = [];
  for (let t = vs.lo; t <= vs.hi + vs.step / 2; t += vs.step) ticks.push(+t.toPrecision(12));
  const tickLabels = ticks.map((t) => formatTick(t, vs.step));
  const n = data.categories.length;

  // X scale for scatter
  const xs = data.x.filter((v): v is number => v !== null);
  const xScale = scatter ? niceScale(Math.min(...xs), Math.max(...xs)) : null;

  const labelW = horizontal
    ? Math.min(plot.w * 0.35, Math.max(...data.categories.map((c) => c.length), 1) * 6.2 + 8)
    : Math.max(...tickLabels.map((t) => t.length)) * 6.5 + 8;
  const bottomH = 18;
  const area = { x: plot.x + labelW, y: plot.y + 4, w: Math.max(10, plot.w - labelW - 4), h: Math.max(10, plot.h - bottomH - 4) };

  const vPos = (v: number) =>
    horizontal ? area.x + ((v - vs.lo) / (vs.hi - vs.lo)) * area.w : area.y + area.h - ((v - vs.lo) / (vs.hi - vs.lo)) * area.h;
  const band = (horizontal ? area.h : area.w) / Math.max(1, n);
  const catCenter = (i: number) => (horizontal ? area.y + band * i + band / 2 : area.x + band * i + band / 2);
  const xPos = (v: number) => (xScale ? area.x + ((v - xScale.lo) / (xScale.hi - xScale.lo)) * area.w : 0);

  const out: React.ReactNode[] = [];
  // Gridlines and value labels
  ticks.forEach((t, i) => {
    const p = vPos(t);
    if (horizontal) {
      out.push(<line key={`g${i}`} x1={p} x2={p} y1={area.y} y2={area.y + area.h} stroke={GRID} strokeWidth={1} />);
      out.push(
        <text key={`t${i}`} x={p} y={area.y + area.h + 13} textAnchor="middle" fontSize={10.5} fill={AXIS}>
          {tickLabels[i]}
        </text>,
      );
    } else {
      out.push(<line key={`g${i}`} x1={area.x} x2={area.x + area.w} y1={p} y2={p} stroke={GRID} strokeWidth={1} />);
      out.push(
        <text key={`t${i}`} x={area.x - 5} y={p + 3.5} textAnchor="end" fontSize={10.5} fill={AXIS}>
          {tickLabels[i]}
        </text>,
      );
    }
  });
  // Category labels (or scatter X ticks)
  if (scatter && xScale) {
    for (let t = xScale.lo, i = 0; t <= xScale.hi + xScale.step / 2; t += xScale.step, i++) {
      out.push(
        <text key={`x${i}`} x={xPos(t)} y={area.y + area.h + 13} textAnchor="middle" fontSize={10.5} fill={AXIS}>
          {formatTick(+t.toPrecision(12), xScale.step)}
        </text>,
      );
    }
  } else {
    const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((horizontal ? area.h / 14 : area.w / 48)))));
    data.categories.forEach((c, i) => {
      if (i % every) return;
      out.push(
        horizontal ? (
          <text key={`c${i}`} x={area.x - 5} y={catCenter(i) + 3.5} textAnchor="end" fontSize={10.5} fill={AXIS}>
            {truncate(c, Math.floor(labelW / 6.2))}
          </text>
        ) : (
          <text key={`c${i}`} x={catCenter(i)} y={area.y + area.h + 13} textAnchor="middle" fontSize={10.5} fill={AXIS}>
            {truncate(c, Math.floor((band * every) / 6.2))}
          </text>
        ),
      );
    });
  }
  // Zero / base axis line
  const zero = vPos(Math.max(vs.lo, Math.min(0, vs.hi)));
  out.push(
    horizontal ? (
      <line key="axis" x1={zero} x2={zero} y1={area.y} y2={area.y + area.h} stroke="#BFBFBF" />
    ) : (
      <line key="axis" x1={area.x} x2={area.x + area.w} y1={zero} y2={zero} stroke="#BFBFBF" />
    ),
  );

  const m = data.series.length;
  data.series.forEach((s, si) => {
    const color = PALETTE[si % PALETTE.length];
    if (kind === "column" || kind === "bar") {
      const group = band * 0.72;
      const bw = group / m;
      s.values.forEach((v, i) => {
        if (v === null) return;
        const start = catCenter(i) - group / 2 + bw * si;
        const a = vPos(0 < vs.lo ? vs.lo : 0);
        const b = vPos(v);
        out.push(
          horizontal ? (
            <rect key={`b${si}-${i}`} x={Math.min(a, b)} y={start} width={Math.max(0.5, Math.abs(b - a))} height={Math.max(0.5, bw - 1)} fill={color} />
          ) : (
            <rect key={`b${si}-${i}`} x={start} y={Math.min(a, b)} width={Math.max(0.5, bw - 1)} height={Math.max(0.5, Math.abs(b - a))} fill={color} />
          ),
        );
      });
      return;
    }
    const pts: [number, number][] = [];
    const segments: [number, number][][] = [];
    s.values.forEach((v, i) => {
      const xv = scatter ? data.x[i] : null;
      if (v === null || (scatter && xv === null)) {
        if (pts.length) segments.push(pts.splice(0));
        return;
      }
      pts.push([scatter ? xPos(xv as number) : catCenter(i), vPos(v)]);
    });
    if (pts.length) segments.push(pts.splice(0));
    segments.forEach((seg, k) => {
      const d = seg.map(([x, y], j) => `${j ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
      if (kind === "area" && seg.length > 1) {
        const base = vPos(Math.max(vs.lo, Math.min(0, vs.hi)));
        out.push(
          <path key={`a${si}-${k}`} d={`${d}L${seg[seg.length - 1][0]},${base}L${seg[0][0]},${base}Z`} fill={color} fillOpacity={0.45} stroke={color} strokeWidth={1.5} />,
        );
      } else if (kind === "line") {
        out.push(<path key={`l${si}-${k}`} d={d} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />);
      }
      if (kind === "line" || kind === "scatter") {
        seg.forEach(([x, y], j) => out.push(<circle key={`p${si}-${k}-${j}`} cx={x} cy={y} r={scatter ? 3.5 : 2.5} fill={color} />));
      }
    });
  });
  return <g>{out}</g>;
}

/** Suggests a chart type for a range (Recommended Charts). */
export function recommendChart(data: ChartData): ChartKind {
  const n = data.categories.length;
  if (!data.series.length) return "column";
  const noLabels = data.categories.every((c, i) => c === String(i + 1));
  // Two numeric columns without labels: X/Y pairs
  if (noLabels && data.series.length === 2 && data.series[0].values.every((v, i) => v === data.x[i] && v !== null)) return "scatter";
  // Many points read better as a trend
  if (n > 12) return "line";
  return "column";
}
