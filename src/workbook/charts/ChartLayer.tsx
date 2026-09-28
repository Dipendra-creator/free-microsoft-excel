// Charts floating over the grid: positioned from their anchor cell, refreshed
// when cell data changes, selectable, movable and resizable like Excel.

import { useEffect, useState } from "react";
import { api, type ChartKind, type ChartSpec, type RangeValue } from "../../api";
import { Icon } from "../../components/Icon";
import { Menu, type MenuItem } from "../../components/Menu";
import type { WorkbookController } from "../controller";
import { useCtl } from "../hooks";
import { buildChartData, ChartSvg } from "./ChartView";

export const CHART_TYPES: { kind: ChartKind; label: string; icon: string }[] = [
  { kind: "column", label: "Column", icon: "chartColumn" },
  { kind: "bar", label: "Bar", icon: "chartBar" },
  { kind: "line", label: "Line", icon: "chartLine" },
  { kind: "area", label: "Area", icon: "chartArea" },
  { kind: "pie", label: "Pie", icon: "chartPie" },
  { kind: "doughnut", label: "Doughnut", icon: "chartDoughnut" },
  { kind: "scatter", label: "Scatter", icon: "chartScatter" },
];

export function chartMenu(ctl: WorkbookController, chart: ChartSpec): MenuItem[] {
  return [
    {
      label: "Change Chart Type",
      icon: "charts",
      submenu: CHART_TYPES.map((t) => ({
        label: t.label,
        icon: t.icon,
        checked: t.kind === chart.kind,
        onClick: () => ctl.saveChart({ ...chart, kind: t.kind }),
      })),
    },
    { label: "Edit Chart...", icon: "formatCells", onClick: () => ctl.ui?.dialog("chart", { id: chart.id }) },
    { label: "Switch Row/Column", icon: "transpose", onClick: () => ctl.saveChart({ ...chart, seriesInRows: !chart.seriesInRows }) },
    { label: chart.legend ? "Hide Legend" : "Show Legend", icon: "list", onClick: () => ctl.saveChart({ ...chart, legend: !chart.legend }) },
    { label: "Select Data Range", icon: "goto", onClick: () => ctl.selectRange(chart.range) },
    { separator: true },
    { label: "Delete Chart", icon: "delete", shortcut: "Del", onClick: () => ctl.deleteChart(chart.id) },
  ];
}

type Drag = { mode: "move" | "resize"; handle?: string; dx: number; dy: number; dw: number; dh: number };

function ChartBox({ ctl, chart, stamp, zoom }: { ctl: WorkbookController; chart: ChartSpec; stamp: number; zoom: number }) {
  const [values, setValues] = useState<RangeValue[][] | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const selected = useCtl(ctl, (c) => c.selectedChart === chart.id);
  const r = chart.range;

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      api
        .rangeValues(ctl.id, ctl.sheet, r)
        .then((v) => !cancelled && setValues(v))
        .catch(() => !cancelled && setValues([]));
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [ctl, r.r1, r.c1, r.r2, r.c2, stamp]);

  const baseX = ctl.colX(chart.col) + chart.dx * zoom - ctl.headerW;
  const baseY = ctl.rowY(chart.row) + chart.dy * zoom - ctl.headerH;
  const w = chart.width * zoom;
  const h = chart.height * zoom;
  const x = baseX + (drag?.dx ?? 0);
  const y = baseY + (drag?.dy ?? 0);
  const ww = Math.max(80 * zoom, w + (drag?.dw ?? 0));
  const hh = Math.max(60 * zoom, h + (drag?.dh ?? 0));

  // Commit a move/resize: new anchor cell + offset inside it
  const commit = (nx: number, ny: number, nw: number, nh: number) => {
    const gx = nx + ctl.headerW;
    const gy = ny + ctl.headerH;
    const col = Math.max(1, ctl.colAt(Math.max(ctl.headerW, gx)));
    const row = Math.max(1, ctl.rowAt(Math.max(ctl.headerH, gy)));
    ctl.saveChart({
      ...chart,
      col,
      row,
      dx: Math.max(0, (gx - ctl.colX(col)) / zoom),
      dy: Math.max(0, (gy - ctl.rowY(row)) / zoom),
      width: Math.round(nw / zoom),
      height: Math.round(nh / zoom),
    });
  };

  const start = (e: React.MouseEvent, mode: "move" | "resize", handle?: string) => {
    // Never let the grid underneath react (it would select cells / open its menu)
    e.stopPropagation();
    if (e.button !== 0) return;
    e.preventDefault();
    if (ctl.edit) ctl.commitEdit("none");
    ctl.selectChart(chart.id);
    ctl.ui?.focusGrid();
    const sx = e.clientX;
    const sy = e.clientY;
    let last: Drag = { mode, handle, dx: 0, dy: 0, dw: 0, dh: 0 };
    const move = (ev: MouseEvent) => {
      const mx = ev.clientX - sx;
      const my = ev.clientY - sy;
      if (mode === "move") last = { mode, dx: mx, dy: my, dw: 0, dh: 0 };
      else {
        const hd = handle ?? "se";
        last = {
          mode,
          handle,
          dx: hd.includes("w") ? Math.min(mx, w - 80 * zoom) : 0,
          dy: hd.includes("n") ? Math.min(my, h - 60 * zoom) : 0,
          dw: hd.includes("e") ? mx : hd.includes("w") ? -Math.min(mx, w - 80 * zoom) : 0,
          dh: hd.includes("s") ? my : hd.includes("n") ? -Math.min(my, h - 60 * zoom) : 0,
        };
      }
      setDrag(last);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setDrag(null);
      if (Math.abs(last.dx) + Math.abs(last.dy) + Math.abs(last.dw) + Math.abs(last.dh) > 2) {
        commit(baseX + last.dx, baseY + last.dy, Math.max(80 * zoom, w + last.dw), Math.max(60 * zoom, h + last.dh));
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Cull charts that are far outside the view
  if (x > ctl.viewport.width + 50 || y > ctl.viewport.height + 50 || x + ww < -50 || y + hh < -50) return null;

  // Like Excel, rows and columns hidden (e.g. by a filter) are left out
  const shown = values
    ?.filter((_, i) => ctl.rows.size(r.r1 + i) > 0)
    .map((row) => row.filter((_, j) => ctl.cols.size(r.c1 + j) > 0));
  const data = shown ? buildChartData(shown, chart.seriesInRows) : null;
  return (
    <div
      className={`chart-box ${selected ? "selected" : ""}`}
      style={{ left: x, top: y, width: ww, height: hh }}
      onMouseDown={(e) => start(e, "move")}
      onDoubleClick={(e) => {
        e.stopPropagation();
        ctl.ui?.dialog("chart", { id: chart.id });
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctl.selectChart(chart.id);
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="chart-inner" style={{ transform: `scale(${zoom})`, width: ww / zoom, height: hh / zoom }}>
        {data ? (
          <ChartSvg kind={chart.kind} title={chart.title} legend={chart.legend} data={data} width={ww / zoom} height={hh / zoom} />
        ) : (
          <div className="chart-loading" />
        )}
      </div>
      {selected && (
        <>
          {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((hd) => (
            <span key={hd} className={`chart-handle h-${hd}`} onMouseDown={(e) => start(e, "resize", hd)} />
          ))}
          <button
            className="chart-menu-btn"
            title="Chart options"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              const b = e.currentTarget.getBoundingClientRect();
              setMenu({ x: b.left, y: b.bottom + 2 });
            }}
          >
            <Icon name="dotsH" />
          </button>
        </>
      )}
      {menu && (
        // The menu is portaled, but React events still bubble to the chart box
        <div onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <Menu anchor={menu} items={chartMenu(ctl, chart)} onClose={() => setMenu(null)} />
        </div>
      )}
    </div>
  );
}

export function ChartLayer({ ctl }: { ctl: WorkbookController }) {
  const s = useCtl(ctl, (c) => ({
    charts: c.charts,
    stamp: c.dataStamp,
    zoom: c.zoom,
    sx: c.scroll.x,
    sy: c.scroll.y,
    hw: c.headerW,
    hh: c.headerH,
    vw: c.viewport.width,
    vh: c.viewport.height,
    rows: c.rows,
    cols: c.cols,
  }));
  if (!s.charts.length) return null;
  return (
    <div className="chart-layer" style={{ left: s.hw, top: s.hh, width: Math.max(0, s.vw - s.hw), height: Math.max(0, s.vh - s.hh) }}>
      {s.charts.map((c) => (
        <ChartBox key={c.id} ctl={ctl} chart={c} stamp={s.stamp} zoom={s.zoom} />
      ))}
    </div>
  );
}
