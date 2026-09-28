// Dialogs for notes, links, charts, Text to Columns, PivotTable and the
// workbook health check.

import { useEffect, useMemo, useState } from "react";
import {
  api,
  type ChartKind,
  type HealthReport,
  type Issue,
  type PasteSpecialOptions,
  type PivotSpec,
  type RangeValue,
  type SeriesSpec,
  type SplitOptions,
} from "../../api";
import { Dialog } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { cellName, colName, parseRange, rectName } from "../../lib/a1";
import { CHART_TYPES } from "../charts/ChartLayer";
import type { WorkbookController } from "../controller";

// ----------------------------------------------------------------------
// Notes & links
// ----------------------------------------------------------------------

export function NoteDialog({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const { r, c } = ctl.sel.active;
  const existing = ctl.activeInfo?.row === r && ctl.activeInfo?.col === c ? ctl.activeInfo.note : undefined;
  const [text, setText] = useState(existing?.text ?? "");
  return (
    <Dialog
      title={existing ? `Edit Note (${cellName(r, c)})` : `New Note (${cellName(r, c)})`}
      onClose={onClose}
      width={380}
      onSubmit={() => {
        onClose();
        ctl.setNote(text, r, c);
      }}
      footer={
        <>
          {existing && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                onClose();
                ctl.setNote("", r, c);
              }}
            >
              Delete Note
            </button>
          )}
          <button type="submit" className="btn primary">
            OK
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      {existing?.author && <div className="muted small">Author: {existing.author}</div>}
      <textarea
        className="note-input"
        rows={6}
        value={text}
        placeholder="Type a note for this cell"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onClose();
            ctl.setNote(text, r, c);
          }
        }}
      />
    </Dialog>
  );
}

export function LinkDialog({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const current = ctl.activeInfo?.formatted ?? "";
  const [url, setUrl] = useState(/^(https?:|mailto:|www\.)/i.test(current) ? current : "https://");
  const valid = /^((https?:\/\/|mailto:)\S+|www\.\S+\.\S+)$/i.test(url.trim());
  return (
    <Dialog
      title="Insert Link"
      onClose={onClose}
      width={440}
      onSubmit={() => {
        if (!valid) return;
        onClose();
        const { r, c } = ctl.sel.active;
        api.setCell(ctl.id, ctl.sheet, r, c, url.trim()).then((i) => ctl.setInfo(i), (e) => ctl.fail(e));
      }}
    >
      <label className="fc-row">
        <span className="lbl">Address:</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
      </label>
      <p className="muted small">The address is written into the selected cell. Ctrl+click (⌘+click on Mac) the cell to open it.</p>
    </Dialog>
  );
}

// ----------------------------------------------------------------------
// Charts
// ----------------------------------------------------------------------

export function ChartDialog({ ctl, id, onClose }: { ctl: WorkbookController; id: string; onClose: () => void }) {
  const chart = ctl.charts.find((c) => c.id === id);
  const [title, setTitle] = useState(chart?.title ?? "");
  const [kind, setKind] = useState<ChartKind>(chart?.kind ?? "column");
  const [range, setRange] = useState(chart ? rectName(chart.range) : "");
  const [rows, setRows] = useState(chart?.seriesInRows ?? false);
  const [legend, setLegend] = useState(chart?.legend ?? true);
  if (!chart) return null;
  return (
    <Dialog
      title="Edit Chart"
      onClose={onClose}
      width={420}
      onSubmit={() => {
        const r = parseRange(range.replace(/^=/, "").split("!").pop() ?? "");
        if (!r) {
          ctl.ui?.error("The data range isn't valid. Use a reference such as A1:D12.");
          return;
        }
        onClose();
        ctl.saveChart({ ...chart, title, kind, range: r, seriesInRows: rows, legend });
      }}
    >
      <label className="fc-row">
        <span className="lbl">Chart title:</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="(automatic)" />
      </label>
      <label className="fc-row">
        <span className="lbl">Chart type:</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as ChartKind)}>
          {CHART_TYPES.map((t) => (
            <option key={t.kind} value={t.kind}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="fc-row">
        <span className="lbl">Chart data range:</span>
        <input value={range} onChange={(e) => setRange(e.target.value)} />
      </label>
      <label className="fc-row">
        <span className="lbl">Series in:</span>
        <select value={rows ? "rows" : "cols"} onChange={(e) => setRows(e.target.value === "rows")}>
          <option value="cols">Columns</option>
          <option value="rows">Rows</option>
        </select>
      </label>
      <label className="fc-row check">
        <input type="checkbox" checked={legend} onChange={(e) => setLegend(e.target.checked)} />
        Show legend
      </label>
    </Dialog>
  );
}

// ----------------------------------------------------------------------
// Text to Columns
// ----------------------------------------------------------------------

/** Same rules as the engine's splitter (for the live preview). */
export function splitLine(text: string, o: SplitOptions): string[] {
  const out: string[] = [];
  let field = "";
  let atStart = true;
  let lastDelim = false;
  const q = o.qualifier;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (atStart && q && ch === q) {
      i++;
      while (i < text.length) {
        if (text[i] === q) {
          if (text[i + 1] === q) {
            field += q;
            i += 2;
            continue;
          }
          break;
        }
        field += text[i++];
      }
      atStart = false;
      lastDelim = false;
      continue;
    }
    if (o.delimiters.includes(ch)) {
      if (o.consecutive && lastDelim) continue;
      out.push(field);
      field = "";
      atStart = true;
      lastDelim = true;
      continue;
    }
    field += ch;
    atStart = false;
    lastDelim = false;
  }
  out.push(field);
  return out;
}

export function TextToColumnsDialog({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const range = ctl.usedClamp(ctl.range);
  const [tab, setTab] = useState(false);
  const [semicolon, setSemicolon] = useState(false);
  const [comma, setComma] = useState(true);
  const [space, setSpace] = useState(false);
  const [other, setOther] = useState("");
  const [consecutive, setConsecutive] = useState(false);
  const [qualifier, setQualifier] = useState('"');
  const [sample, setSample] = useState<string[]>([]);

  useEffect(() => {
    api
      .rangeValues(ctl.id, ctl.sheet, { r1: range.r1, c1: range.c1, r2: Math.min(range.r2, range.r1 + 9), c2: range.c1 })
      .then((v: RangeValue[][]) => {
        const lines = v.map((row) => row[0]?.[1] ?? "");
        setSample(lines);
        // Guess the delimiter from the sample
        const joined = lines.join("\n");
        if (joined.includes("\t")) {
          setTab(true);
          setComma(false);
        } else if ((joined.match(/;/g) ?? []).length > (joined.match(/,/g) ?? []).length) {
          setSemicolon(true);
          setComma(false);
        }
      })
      .catch(() => {});
  }, []);

  const opts: SplitOptions = {
    delimiters: `${tab ? "\t" : ""}${semicolon ? ";" : ""}${comma ? "," : ""}${space ? " " : ""}${other.slice(0, 1)}`,
    consecutive,
    qualifier,
  };
  const preview = sample.map((l) => (opts.delimiters ? splitLine(l, opts) : [l]));
  const width = Math.max(1, ...preview.map((p) => p.length));

  return (
    <Dialog
      title="Convert Text to Columns"
      onClose={onClose}
      width={560}
      onSubmit={async () => {
        if (range.c1 !== range.c2) {
          ctl.ui?.error("Text to Columns can convert only one column at a time. Select a single column and try again.");
          return;
        }
        if (width > 1) {
          const answer = await ctl.ui?.ask("Convert Text to Columns", "Do you want to replace the contents of the destination cells?", [
            { label: "OK", value: "ok", primary: true },
            { label: "Cancel", value: "cancel" },
          ]);
          if (answer !== "ok") return;
        }
        onClose();
        try {
          const [written, info] = await api.textToColumns(ctl.id, ctl.sheet, range, opts);
          await ctl.setInfo(info);
          ctl.selectRange(written);
        } catch (e) {
          ctl.fail(e);
        }
      }}
    >
      <p className="muted small">
        Splitting {rectName(range)}. Values keep their leading zeros and long digit strings exactly as written.
      </p>
      <div className="ttc-options">
        <fieldset>
          <legend>Delimiters</legend>
          <label className="fc-row check">
            <input type="checkbox" checked={tab} onChange={(e) => setTab(e.target.checked)} /> Tab
          </label>
          <label className="fc-row check">
            <input type="checkbox" checked={semicolon} onChange={(e) => setSemicolon(e.target.checked)} /> Semicolon
          </label>
          <label className="fc-row check">
            <input type="checkbox" checked={comma} onChange={(e) => setComma(e.target.checked)} /> Comma
          </label>
          <label className="fc-row check">
            <input type="checkbox" checked={space} onChange={(e) => setSpace(e.target.checked)} /> Space
          </label>
          <label className="fc-row check">
            Other: <input className="tiny" maxLength={1} value={other} onChange={(e) => setOther(e.target.value)} />
          </label>
        </fieldset>
        <fieldset>
          <legend>Options</legend>
          <label className="fc-row check">
            <input type="checkbox" checked={consecutive} onChange={(e) => setConsecutive(e.target.checked)} /> Treat consecutive delimiters as one
          </label>
          <label className="fc-row">
            <span className="lbl">Text qualifier:</span>
            <select value={qualifier} onChange={(e) => setQualifier(e.target.value)}>
              <option value={'"'}>"</option>
              <option value="'">'</option>
              <option value="">{"{none}"}</option>
            </select>
          </label>
        </fieldset>
      </div>
      <div className="fc-label">Data preview</div>
      <div className="ttc-preview">
        <table>
          <tbody>
            {preview.map((parts, i) => (
              <tr key={i}>
                {Array.from({ length: width }, (_, j) => (
                  <td key={j}>{parts[j] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

// ----------------------------------------------------------------------
// Paste Special (Ctrl+Alt+V)
// ----------------------------------------------------------------------

const PASTE_WHAT: [PasteSpecialOptions["what"], string][] = [
  ["all", "All"],
  ["formulas", "Formulas"],
  ["values", "Values"],
  ["formats", "Formats"],
  ["allExceptBorders", "All except borders"],
  ["columnWidths", "Column widths"],
  ["formulasAndNumberFormats", "Formulas and number formats"],
  ["valuesAndNumberFormats", "Values and number formats"],
];

const PASTE_OPS: [PasteSpecialOptions["operation"], string][] = [
  ["none", "None"],
  ["add", "Add"],
  ["subtract", "Subtract"],
  ["multiply", "Multiply"],
  ["divide", "Divide"],
];

export function PasteSpecialDialog({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const [what, setWhat] = useState<PasteSpecialOptions["what"]>("all");
  const [operation, setOperation] = useState<PasteSpecialOptions["operation"]>("none");
  const [skipBlanks, setSkipBlanks] = useState(false);
  const [transpose, setTranspose] = useState(false);
  const run = (options: PasteSpecialOptions) => {
    onClose();
    ctl.pasteSpecial(options);
  };
  const widths = what === "columnWidths";
  return (
    <Dialog
      title="Paste Special"
      onClose={onClose}
      width={460}
      onSubmit={() => run({ what, operation: widths ? "none" : operation, skipBlanks, transpose: widths ? false : transpose })}
      footer={
        <>
          <button type="button" className="btn" onClick={() => run({ what: "link", operation: "none", skipBlanks: false, transpose: false })}>
            Paste Link
          </button>
          <span className="spacer" />
          <button type="submit" className="btn primary">
            OK
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      {!ctl.clip && (
        <p className="muted small">The clipboard holds text from another program: only its values can be pasted (Transpose works too).</p>
      )}
      <fieldset>
        <legend>Paste</legend>
        <div className="ps-grid">
          {PASTE_WHAT.map(([v, label]) => (
            <label key={v} className="fc-row check">
              <input type="radio" name="ps-what" checked={what === v} onChange={() => setWhat(v)} /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={widths ? "disabled" : ""}>
        <legend>Operation</legend>
        <div className="ps-grid">
          {PASTE_OPS.map(([v, label]) => (
            <label key={v} className="fc-row check">
              <input type="radio" name="ps-op" disabled={widths} checked={operation === v} onChange={() => setOperation(v)} /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="ps-grid">
        <label className="fc-row check">
          <input type="checkbox" checked={skipBlanks} disabled={widths} onChange={(e) => setSkipBlanks(e.target.checked)} /> Skip blanks
        </label>
        <label className="fc-row check">
          <input type="checkbox" checked={transpose} disabled={widths} onChange={(e) => setTranspose(e.target.checked)} /> Transpose
        </label>
      </div>
    </Dialog>
  );
}

// ----------------------------------------------------------------------
// Home → Fill → Series
// ----------------------------------------------------------------------

export function SeriesDialog({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const r = ctl.range;
  const [inRows, setInRows] = useState(r.c2 - r.c1 > r.r2 - r.r1);
  const [kind, setKind] = useState<SeriesSpec["kind"]>(() => {
    const fmt = ctl.activeInfo?.style.numFmt ?? "";
    return /[dy]/i.test(fmt.replace(/"[^"]*"|\[[^\]]*\]/g, "")) ? "date" : "linear";
  });
  const [unit, setUnit] = useState<SeriesSpec["unit"]>("day");
  const [trend, setTrend] = useState(false);
  const [step, setStep] = useState("1");
  const [stop, setStop] = useState("");
  const stepValue = Number(step);
  const stopValue = stop.trim() === "" ? null : Number(stop);
  const invalid = (!trend && kind !== "autofill" && !Number.isFinite(stepValue)) || (stopValue !== null && !Number.isFinite(stopValue));
  const radio = <T extends string>(value: T, current: T, set: (v: T) => void, label: string, disabled = false) => (
    <label className={`fc-row check${disabled ? " disabled" : ""}`}>
      <input type="radio" checked={current === value} disabled={disabled} onChange={() => set(value)} /> {label}
    </label>
  );
  return (
    <Dialog
      title="Series"
      onClose={onClose}
      width={420}
      onSubmit={() => {
        if (invalid) return;
        onClose();
        ctl.fillSeries({ inRows, kind, unit, step: Number.isFinite(stepValue) ? stepValue : 1, stop: stopValue, trend });
      }}
      footer={
        <>
          <button type="submit" className="btn primary" disabled={invalid}>
            OK
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="series-grid">
        <fieldset>
          <legend>Series in</legend>
          {radio("rows", inRows ? "rows" : "cols", () => setInRows(true), "Rows")}
          {radio("cols", inRows ? "rows" : "cols", () => setInRows(false), "Columns")}
        </fieldset>
        <fieldset>
          <legend>Type</legend>
          {radio("linear", kind, setKind, "Linear")}
          {radio("growth", kind, setKind, "Growth")}
          {radio("date", kind, setKind, "Date")}
          {radio("autofill", kind, setKind, "AutoFill")}
        </fieldset>
        <fieldset>
          <legend>Date unit</legend>
          {radio("day", unit, setUnit, "Day", kind !== "date")}
          {radio("weekday", unit, setUnit, "Weekday", kind !== "date")}
          {radio("month", unit, setUnit, "Month", kind !== "date")}
          {radio("year", unit, setUnit, "Year", kind !== "date")}
        </fieldset>
      </div>
      <label className="fc-row check">
        <input type="checkbox" checked={trend} disabled={kind === "date" || kind === "autofill"} onChange={(e) => setTrend(e.target.checked)} /> Trend
      </label>
      <div className="series-values">
        <label className="fc-row">
          <span className="lbl">Step value:</span>
          <input value={step} disabled={kind === "autofill"} onChange={(e) => setStep(e.target.value)} autoFocus />
        </label>
        <label className="fc-row">
          <span className="lbl">Stop value:</span>
          <input value={stop} disabled={kind === "autofill"} onChange={(e) => setStop(e.target.value)} />
        </label>
      </div>
      <p className="muted small">
        The first cell of each {inRows ? "row" : "column"} in {rectName(r)} starts the series
        {r.r1 === r.r2 && r.c1 === r.c2 ? "; with one cell selected, it continues up to the stop value." : "."}
      </p>
    </Dialog>
  );
}

// ----------------------------------------------------------------------
// PivotTable
// ----------------------------------------------------------------------

export function PivotDialog({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const [source, setSource] = useState<string>("");
  const [headers, setHeaders] = useState<{ col: number; name: string; numeric: boolean }[]>([]);
  const [rowsCol, setRowsCol] = useState<number>(0);
  const [colsCol, setColsCol] = useState<number>(0);
  const [valueCol, setValueCol] = useState<number>(0);
  const [func, setFunc] = useState<PivotSpec["func"]>("sum");

  const load = async (rectText?: string) => {
    const r = rectText ? parseRange(rectText) : await ctl.dataRange();
    if (!r) return;
    setSource(rectName(r));
    const v = await api.rangeValues(ctl.id, ctl.sheet, { r1: r.r1, c1: r.c1, r2: Math.min(r.r2, r.r1 + 1), c2: r.c2 });
    const hs = (v[0] ?? []).map((cell, i) => ({
      col: r.c1 + i,
      name: cell[1] || `Column ${colName(r.c1 + i)}`,
      numeric: v[1]?.[i]?.[0] !== null && v[1]?.[i]?.[0] !== undefined,
    }));
    setHeaders(hs);
    const firstText = hs.find((h) => !h.numeric) ?? hs[0];
    const firstNum = hs.find((h) => h.numeric && h.col !== firstText?.col);
    setRowsCol(firstText?.col ?? 0);
    setValueCol(firstNum?.col ?? 0);
    setColsCol(0);
    setFunc(firstNum ? "sum" : "count");
  };

  useEffect(() => {
    load().catch((e) => ctl.fail(e));
  }, []);

  return (
    <Dialog
      title="Create PivotTable"
      onClose={onClose}
      width={460}
      onSubmit={async () => {
        const r = parseRange(source);
        if (!r || !rowsCol) {
          ctl.ui?.error("Choose a source range with headers and a field for the rows.");
          return;
        }
        onClose();
        const spec: PivotSpec = { source: r, rowsCol, colsCol: colsCol || null, valueCol: valueCol || null, func };
        await ctl.run(api.createPivot(ctl.id, ctl.sheet, spec));
      }}
    >
      <p className="muted small">
        Creates a summary on a new sheet. The totals are formulas (SUMIFS, COUNTIFS…), so they update when the source data changes.
      </p>
      <label className="fc-row">
        <span className="lbl">Table/Range:</span>
        <input value={source} onChange={(e) => setSource(e.target.value)} onBlur={() => load(source).catch(() => {})} />
      </label>
      <label className="fc-row">
        <span className="lbl">Rows:</span>
        <select value={rowsCol} onChange={(e) => setRowsCol(Number(e.target.value))}>
          {headers.map((h) => (
            <option key={h.col} value={h.col}>
              {h.name}
            </option>
          ))}
        </select>
      </label>
      <label className="fc-row">
        <span className="lbl">Columns:</span>
        <select value={colsCol} onChange={(e) => setColsCol(Number(e.target.value))}>
          <option value={0}>(none)</option>
          {headers
            .filter((h) => h.col !== rowsCol)
            .map((h) => (
              <option key={h.col} value={h.col}>
                {h.name}
              </option>
            ))}
        </select>
      </label>
      <label className="fc-row">
        <span className="lbl">Values:</span>
        <select value={valueCol} onChange={(e) => setValueCol(Number(e.target.value))}>
          <option value={0}>(count rows)</option>
          {headers.map((h) => (
            <option key={h.col} value={h.col}>
              {h.name}
            </option>
          ))}
        </select>
      </label>
      <label className="fc-row">
        <span className="lbl">Summarize by:</span>
        <select value={func} onChange={(e) => setFunc(e.target.value as PivotSpec["func"])}>
          <option value="sum">Sum</option>
          <option value="count">Count</option>
          <option value="average">Average</option>
          <option value="min">Min</option>
          <option value="max">Max</option>
        </select>
      </label>
    </Dialog>
  );
}

// ----------------------------------------------------------------------
// Workbook health check
// ----------------------------------------------------------------------

const KIND_TITLE: Record<string, string> = {
  error: "Formula errors",
  omitsAdjacent: "Totals that skip adjacent numbers",
  inconsistent: "Inconsistent formulas",
  numberAsText: "Numbers stored as text",
  volatile: "Volatile functions",
  hiddenSheet: "Hidden sheets",
  hiddenCells: "Hidden rows and columns",
};

export function HealthCheckDialog({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [filter, setFilter] = useState<"all" | "error" | "warning" | "info">("all");
  const run = () => {
    setReport(null);
    api
      .healthCheck(ctl.id)
      .then(setReport)
      .catch((e) => {
        ctl.fail(e);
        onClose();
      });
  };
  useEffect(run, []);
  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0 };
    for (const i of report?.issues ?? []) c[i.severity]++;
    return c;
  }, [report]);
  const list = (report?.issues ?? []).filter((i) => filter === "all" || i.severity === filter);
  const groups = new Map<string, Issue[]>();
  for (const i of list) groups.set(i.kind, [...(groups.get(i.kind) ?? []), i]);
  const go = (i: Issue) => {
    if (i.row < 1) return;
    const sel = () => ctl.select(i.row, i.col);
    if (i.sheet !== ctl.sheet) ctl.switchSheet(i.sheet).then(sel);
    else sel();
  };
  const sheetName = (i: number) => ctl.info.sheets[i]?.name ?? "";
  return (
    <Dialog
      title="Check Workbook"
      onClose={onClose}
      width={620}
      className="health-dialog"
      footer={
        <>
          <button type="button" className="btn" onClick={run}>
            Check Again
          </button>
          <button type="button" className="btn primary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {!report && <div className="health-loading">Checking every sheet…</div>}
      {report && (
        <>
          <div className="health-summary">
            <div className={`hs-card ${report.issues.length === 0 ? "ok" : ""}`}>
              <Icon name={report.issues.length === 0 ? "check" : "stats"} size={20} />
              <div>
                <b>{report.issues.length === 0 ? "No problems found" : `${report.issues.length}${report.truncated ? "+" : ""} findings`}</b>
                <div className="muted small">
                  {report.cells.toLocaleString()} cells · {report.formulas.toLocaleString()} formulas checked
                </div>
              </div>
            </div>
            {(["error", "warning", "info"] as const).map((sev) => (
              <button key={sev} type="button" className={`hs-chip ${sev} ${filter === sev ? "active" : ""}`} onClick={() => setFilter(filter === sev ? "all" : sev)}>
                <span className="hs-dot" />
                {counts[sev]} {sev === "error" ? "errors" : sev === "warning" ? "warnings" : "notes"}
              </button>
            ))}
          </div>
          <div className="health-list">
            {[...groups.entries()].map(([kind, items]) => (
              <div key={kind} className="hl-group">
                <div className="hl-title">
                  {KIND_TITLE[kind] ?? kind} <span className="muted">({items.length})</span>
                </div>
                {items.slice(0, 200).map((i, n) => (
                  <button key={n} type="button" className={`hl-item ${i.severity}`} onClick={() => go(i)} disabled={i.row < 1}>
                    <span className="hs-dot" />
                    <span className="hl-ref">{i.row > 0 ? `${sheetName(i.sheet)}!${cellName(i.row, i.col)}` : sheetName(i.sheet)}</span>
                    <span className="hl-msg">{i.message}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </Dialog>
  );
}

// ----------------------------------------------------------------------
// Switch Windows
// ----------------------------------------------------------------------

export function SwitchWindowsDialog({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const [list, setList] = useState<{ book: string; title: string; dirty: boolean }[] | null>(null);
  useEffect(() => {
    api.bookWindows().then(setList).catch(() => setList([]));
  }, []);
  return (
    <Dialog title="Switch Windows" onClose={onClose} width={360}>
      <div className="listbox">
        {(list ?? []).map((w) => (
          <div
            key={w.book}
            className={`lb-item ${w.book === ctl.id ? "selected" : ""}`}
            onClick={() => {
              onClose();
              if (w.book !== ctl.id) api.focusBook(w.book).catch(() => {});
            }}
          >
            {w.title}
            {w.dirty ? " •" : ""}
          </div>
        ))}
        {list && !list.length && <div className="lb-item disabled">No other workbooks are open.</div>}
      </div>
    </Dialog>
  );
}
