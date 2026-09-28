import { useEffect, useState } from "react";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { Menu } from "../components/Menu";
import { formatNumber } from "../lib/formats";
import type { WorkbookController } from "./controller";
import { useCtl } from "./hooks";

function zoomToPos(z: number) {
  return z <= 1 ? ((z - 0.1) / 0.9) * 0.5 : 0.5 + ((z - 1) / 3) * 0.5;
}

function posToZoom(p: number) {
  const z = p <= 0.5 ? 0.1 + (p / 0.5) * 0.9 : 1 + ((p - 0.5) / 0.5) * 3;
  // Snap to 100% near the middle, like Excel
  return Math.abs(z - 1) < 0.04 ? 1 : Math.round(z * 100) / 100;
}

const STAT_KEYS = ["average", "count", "numericCount", "min", "max", "sum"] as const;
type StatKey = (typeof STAT_KEYS)[number];
const STAT_LABEL: Record<StatKey, string> = {
  average: "Average",
  count: "Count",
  numericCount: "Numerical Count",
  min: "Minimum",
  max: "Maximum",
  sum: "Sum",
};

export function StatusBar({ ctl }: { ctl: WorkbookController }) {
  const s = useCtl(ctl, (c) => ({ mode: c.mode, stats: c.stats, zoom: c.zoom, painter: !!c.painter, clip: c.clip, note: c.statusNote, extend: c.extendMode, end: c.endMode }));
  const [shown, setShown] = useState<Record<StatKey, boolean>>(() => {
    try {
      const saved = localStorage.getItem("sheets.statusStats");
      if (saved) return JSON.parse(saved);
    } catch {
      /* ignore */
    }
    return { average: true, count: true, numericCount: false, min: false, max: false, sum: true };
  });
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const st = s.stats;
  const numFmt = useCtl(ctl, (c) => c.activeInfo?.style.numFmt ?? "general");
  // Excel formats Average/Sum/Min/Max with the active cell's number format
  const [formatted, setFormatted] = useState<Partial<Record<StatKey, string>>>({});
  useEffect(() => {
    if (!st || st.numericCount === 0 || numFmt.toLowerCase() === "general" || numFmt === "@") {
      setFormatted({});
      return;
    }
    const nums: [StatKey, number | null][] = [
      ["average", st.sum / st.numericCount],
      ["sum", st.sum],
      ["min", st.min],
      ["max", st.max],
    ];
    let alive = true;
    Promise.all(nums.map(([k, v]) => (v === null ? Promise.resolve([k, ""] as const) : api.formatPreview(v, numFmt).then((t) => [k, t.trim()] as const))))
      .then((pairs) => alive && setFormatted(Object.fromEntries(pairs.filter(([, t]) => t))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [st, numFmt]);
  const values: Partial<Record<StatKey, string>> = {};
  if (st && st.count > 1) {
    values.count = String(st.count);
    if (st.numericCount > 0) {
      values.average = formatted.average ?? formatNumber(st.sum / st.numericCount);
      values.sum = formatted.sum ?? formatNumber(st.sum);
      values.numericCount = String(st.numericCount);
      if (st.min !== null) values.min = formatted.min ?? formatNumber(st.min);
      if (st.max !== null) values.max = formatted.max ?? formatNumber(st.max);
    }
  }
  let mode: string = s.mode;
  if (s.clip && mode === "Ready") mode = "Select destination and press ENTER or choose Paste";
  if (s.painter) mode = "Click to apply formatting";
  else if (s.extend && mode === "Ready") mode = "Extend Selection";
  else if (s.end && mode === "Ready") mode = "End Mode";
  else if (s.note && mode === "Ready") mode = s.note;

  return (
    <div
      className="status-bar"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <span className="status-mode">{mode}</span>
      <span className="status-item">
        <Icon name="accessibility" size={14} />
        Accessibility: Good to go
      </span>
      <div className="status-spacer" />
      {STAT_KEYS.filter((k) => shown[k] && values[k] !== undefined).map((k) => (
        <span key={k} className="status-stat">
          {STAT_LABEL[k]}: {values[k]}
        </span>
      ))}
      <div className="status-views">
        <button className="active" title="Normal">
          <Icon name="normalView" size={16} />
        </button>
        <button title="Page Layout" disabled>
          <Icon name="pageLayoutView" size={16} />
        </button>
        <button title="Page Break Preview" disabled>
          <Icon name="pageBreakView" size={16} />
        </button>
      </div>
      <div className="zoom-control">
        <button title="Zoom Out" onClick={() => ctl.setZoom(Math.max(0.1, Math.round((s.zoom - 0.1) * 10) / 10))}>
          <Icon name="minus" size={12} />
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(zoomToPos(s.zoom) * 1000)}
          onChange={(e) => ctl.setZoom(posToZoom(Number(e.target.value) / 1000))}
          title="Zoom"
        />
        <button title="Zoom In" onClick={() => ctl.setZoom(Math.min(4, Math.round((s.zoom + 0.1) * 10) / 10))}>
          <Icon name="plus" size={12} />
        </button>
        <button className="zoom-pct" onClick={() => ctl.ui?.dialog("zoom")} title="Zoom level">
          {Math.round(s.zoom * 100)}%
        </button>
      </div>
      {menu && (
        <Menu
          anchor={{ x: menu.x, y: menu.y }}
          onClose={() => setMenu(null)}
          items={[
            { header: "Customize Status Bar" },
            ...STAT_KEYS.map((k) => ({
              label: STAT_LABEL[k],
              checked: shown[k],
              onClick: () => {
                const next = { ...shown, [k]: !shown[k] };
                setShown(next);
                try {
                  localStorage.setItem("sheets.statusStats", JSON.stringify(next));
                } catch {
                  /* ignore */
                }
              },
            })),
          ]}
        />
      )}
    </div>
  );
}
