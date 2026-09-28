import { useEffect, useMemo, useState } from "react";
import { api, type ConditionalFormat, type DefinedName, type FindOptions, type FoundCell, type WorkbookStats } from "../../api";
import { Dialog } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { cellName, colName, rectName } from "../../lib/a1";
import { CATEGORIES, FUNCTIONS, MOST_USED } from "../../lib/functions";
import { CF_PRESETS } from "../../lib/galleries";
import type { WorkbookController } from "../controller";
import { addRule } from "../menus";
import {
  ChartDialog,
  HealthCheckDialog,
  LinkDialog,
  NoteDialog,
  PasteSpecialDialog,
  PivotDialog,
  SeriesDialog,
  SwitchWindowsDialog,
  TextToColumnsDialog,
} from "./FeatureDialogs";
import { CreateNamesDialog, PasteNameDialog, ShortcutsDialog } from "./Shortcuts";
import { FormatCellsDialog } from "./FormatCells";

export interface DialogState {
  name: string;
  props?: Record<string, unknown>;
}

// ----------------------------------------------------------------------

function FindReplace({ ctl, tab: initial, onClose }: { ctl: WorkbookController; tab: "find" | "replace"; onClose: () => void }) {
  const [tab, setTab] = useState(initial);
  const [query, setQuery] = useState(() => {
    try {
      return sessionStorage.getItem("sheets.find") ?? "";
    } catch {
      return "";
    }
  });
  const [replacement, setReplacement] = useState("");
  const [opts, setOpts] = useState<FindOptions>({ matchCase: false, wholeCell: false, inFormulas: true, allSheets: false });
  const [results, setResults] = useState<FoundCell[] | null>(null);
  const [cursor, setCursor] = useState(-1);
  const [message, setMessage] = useState("");
  const [showOptions, setShowOptions] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem("sheets.find", query);
    } catch {
      /* ignore */
    }
    setResults(null);
    setCursor(-1);
  }, [query, opts]);

  const search = async () => {
    ctl.lastFind = { query, options: opts };
    const found = await api.findAll(ctl.id, ctl.sheet, query, opts);
    setResults(found);
    if (!found.length) setMessage("We couldn't find what you were looking for.");
    else setMessage(`${found.length} cell(s) found`);
    return found;
  };

  const goto = (f: FoundCell) => {
    const go = () => ctl.select(f.row, f.col);
    if (f.sheet !== ctl.sheet) ctl.switchSheet(f.sheet).then(go);
    else go();
  };

  const findNext = async () => {
    const list = results ?? (await search());
    if (!list.length) return;
    // Start after the active cell like Excel
    let next = cursor + 1;
    if (cursor < 0) {
      const { r, c } = ctl.sel.active;
      const idx = list.findIndex((f) => f.sheet > ctl.sheet || (f.sheet === ctl.sheet && (f.row > r || (f.row === r && f.col > c))));
      next = idx < 0 ? 0 : idx;
    }
    next = next % list.length;
    setCursor(next);
    goto(list[next]);
  };

  const replaceOne = async () => {
    const list = results ?? (await search());
    if (!list.length) return;
    const cur = cursor >= 0 ? list[cursor] : null;
    const { r, c } = ctl.sel.active;
    if (cur && cur.row === r && cur.col === c && cur.sheet === ctl.sheet) {
      const [, info] = await api.replace(ctl.id, ctl.sheet, query, replacement, opts, [cur.sheet, cur.row, cur.col]);
      await ctl.setInfo(info);
      setResults(null);
    }
    await findNext();
  };

  const replaceAll = async () => {
    try {
      const [n, info] = await api.replace(ctl.id, ctl.sheet, query, replacement, opts, null);
      await ctl.setInfo(info);
      setResults(null);
      setMessage(n ? `All done. We made ${n} replacement${n === 1 ? "" : "s"}.` : "We couldn't find anything to replace.");
    } catch (e) {
      ctl.fail(e);
    }
  };

  return (
    <Dialog
      title="Find and Replace"
      onClose={onClose}
      width={520}
      onSubmit={findNext}
      footer={
        <>
          {tab === "replace" && (
            <>
              <button type="button" className="btn" onClick={replaceAll} disabled={!query}>
                Replace All
              </button>
              <button type="button" className="btn" onClick={replaceOne} disabled={!query}>
                Replace
              </button>
            </>
          )}
          <button type="button" className="btn" onClick={search} disabled={!query}>
            Find All
          </button>
          <button type="submit" className="btn primary" disabled={!query}>
            Find Next
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="tabs">
        <button type="button" className={`tab ${tab === "find" ? "active" : ""}`} onClick={() => setTab("find")}>
          Find
        </button>
        <button type="button" className={`tab ${tab === "replace" ? "active" : ""}`} onClick={() => setTab("replace")}>
          Replace
        </button>
      </div>
      <div className="tab-panel find-panel">
        <label className="fc-row">
          <span className="lbl">Find what:</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        </label>
        {tab === "replace" && (
          <label className="fc-row">
            <span className="lbl">Replace with:</span>
            <input value={replacement} onChange={(e) => setReplacement(e.target.value)} />
          </label>
        )}
        <button type="button" className="link-btn" onClick={() => setShowOptions(!showOptions)}>
          Options {showOptions ? "<<" : ">>"}
        </button>
        {showOptions && (
          <div className="find-options">
            <label className="fc-row">
              Within:
              <select value={opts.allSheets ? "wb" : "sheet"} onChange={(e) => setOpts({ ...opts, allSheets: e.target.value === "wb" })}>
                <option value="sheet">Sheet</option>
                <option value="wb">Workbook</option>
              </select>
            </label>
            <label className="fc-row">
              Look in:
              <select value={opts.inFormulas ? "formulas" : "values"} onChange={(e) => setOpts({ ...opts, inFormulas: e.target.value === "formulas" })} disabled={tab === "replace"}>
                <option value="formulas">Formulas</option>
                <option value="values">Values</option>
              </select>
            </label>
            <label className="fc-row check">
              <input type="checkbox" checked={opts.matchCase} onChange={(e) => setOpts({ ...opts, matchCase: e.target.checked })} /> Match case
            </label>
            <label className="fc-row check">
              <input type="checkbox" checked={opts.wholeCell} onChange={(e) => setOpts({ ...opts, wholeCell: e.target.checked })} /> Match entire cell contents
            </label>
          </div>
        )}
        {message && <div className="find-message">{message}</div>}
        {results && results.length > 0 && (
          <div className="find-results">
            <div className="fr-head">
              <span>Sheet</span>
              <span>Cell</span>
              <span>Value</span>
            </div>
            {results.slice(0, 500).map((f, i) => (
              <div
                key={`${f.sheet}-${f.row}-${f.col}`}
                className={`fr-row ${i === cursor ? "selected" : ""}`}
                onClick={() => {
                  setCursor(i);
                  goto(f);
                }}
              >
                <span>{ctl.info.sheets[f.sheet]?.name}</span>
                <span>${colName(f.col)}${f.row}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ----------------------------------------------------------------------

function GoTo({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const [ref, setRef] = useState("");
  const [names, setNames] = useState<DefinedName[]>([]);
  useEffect(() => {
    api.names(ctl.id).then(setNames).catch(() => {});
  }, [ctl.id]);
  const go = () => {
    const target = names.find((n) => n.name.toLowerCase() === ref.toLowerCase())?.formula.replace(/^=/, "") ?? ref;
    if (ctl.goTo(target)) onClose();
    else ctl.ui?.error("Reference isn't valid.");
  };
  return (
    <Dialog title="Go To" onClose={onClose} onSubmit={go} width={340}>
      <div className="fc-label">Go to:</div>
      <div className="listbox short">
        {names.map((n) => (
          <div key={n.name} className={`lb-item ${ref === n.name ? "selected" : ""}`} onClick={() => setRef(n.name)} onDoubleClick={go}>
            {n.name}
          </div>
        ))}
      </div>
      <label className="fc-row">
        <span className="lbl">Reference:</span>
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. B12 or Sheet2!A1:C5" />
      </label>
    </Dialog>
  );
}

// ----------------------------------------------------------------------

function InsertFunction({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("Most Recently Used");
  const [selected, setSelected] = useState("SUM");
  const list = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (q) return FUNCTIONS.filter((f) => f.name.includes(q) || f.description.toUpperCase().includes(q)).slice(0, 200);
    if (cat === "Most Recently Used") return MOST_USED.map((n) => FUNCTIONS.find((f) => f.name === n)!).filter(Boolean);
    if (cat === "All") return FUNCTIONS;
    return FUNCTIONS.filter((f) => f.category === cat);
  }, [query, cat]);
  const doc = FUNCTIONS.find((f) => f.name === selected);
  const insert = () => {
    onClose();
    ctl.insertFunction(selected);
  };
  return (
    <Dialog title="Insert Function" onClose={onClose} onSubmit={insert} width={480}>
      <label className="fc-row">
        <span className="lbl">Search for a function:</span>
      </label>
      <input className="wide" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a brief description of what you want to do" />
      <label className="fc-row">
        <span className="lbl">Or select a category:</span>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          {["Most Recently Used", "All", ...CATEGORIES].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <div className="fc-label">Select a function:</div>
      <div className="listbox fn-list">
        {list.map((f) => (
          <div key={f.name} className={`lb-item ${selected === f.name ? "selected" : ""}`} onClick={() => setSelected(f.name)} onDoubleClick={insert}>
            {f.name}
          </div>
        ))}
      </div>
      {doc && (
        <div className="fn-doc">
          <b>{doc.syntax}</b>
          <p>{doc.description}</p>
        </div>
      )}
    </Dialog>
  );
}

// ----------------------------------------------------------------------

function NameManager({ ctl, onClose, define }: { ctl: WorkbookController; onClose: () => void; define?: boolean }) {
  const [names, setNames] = useState<DefinedName[]>([]);
  const [editing, setEditing] = useState<{ original?: DefinedName; name: string; scope: number | null; formula: string } | null>(
    define
      ? {
          name: "",
          scope: null,
          formula: `=${quoteSheet(ctl.sheetName)}!${absRef(ctl)}`,
        }
      : null,
  );
  const [selected, setSelected] = useState<DefinedName | null>(null);
  const load = () => api.names(ctl.id).then(setNames).catch((e) => ctl.fail(e));
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!editing) return;
    const ok = editing.original
      ? await ctl.run(api.updateName(ctl.id, editing.original.name, editing.original.scope, editing.name, editing.scope, editing.formula))
      : await ctl.run(api.addName(ctl.id, editing.name, editing.scope, editing.formula));
    if (ok) {
      if (define) onClose();
      setEditing(null);
      load();
    }
  };

  if (editing) {
    return (
      <Dialog title={editing.original ? "Edit Name" : "New Name"} onClose={() => (define ? onClose() : setEditing(null))} onSubmit={save} width={400}>
        <label className="fc-row">
          <span className="lbl">Name:</span>
          <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
        </label>
        <label className="fc-row">
          <span className="lbl">Scope:</span>
          <select value={editing.scope ?? -1} onChange={(e) => setEditing({ ...editing, scope: Number(e.target.value) < 0 ? null : Number(e.target.value) })}>
            <option value={-1}>Workbook</option>
            {ctl.info.sheets.map((s) => (
              <option key={s.index} value={s.index}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="fc-row">
          <span className="lbl">Refers to:</span>
          <input value={editing.formula} onChange={(e) => setEditing({ ...editing, formula: e.target.value })} />
        </label>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Name Manager"
      onClose={onClose}
      width={600}
      footer={
        <button type="button" className="btn primary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="nm-actions">
        <button type="button" className="btn" onClick={() => setEditing({ name: "", scope: null, formula: `=${quoteSheet(ctl.sheetName)}!${absRef(ctl)}` })}>
          New...
        </button>
        <button type="button" className="btn" disabled={!selected} onClick={() => selected && setEditing({ original: selected, ...selected })}>
          Edit...
        </button>
        <button
          type="button"
          className="btn"
          disabled={!selected}
          onClick={async () => {
            if (selected && (await ctl.run(api.deleteName(ctl.id, selected.name, selected.scope)))) {
              setSelected(null);
              load();
            }
          }}
        >
          Delete
        </button>
      </div>
      <div className="table-list">
        <div className="tl-head">
          <span>Name</span>
          <span>Refers To</span>
          <span>Scope</span>
        </div>
        {names.length === 0 && <div className="tl-empty">No names defined. Click New... to create one.</div>}
        {names.map((n) => (
          <div
            key={`${n.name}-${n.scope}`}
            className={`tl-row ${selected === n ? "selected" : ""}`}
            onClick={() => setSelected(n)}
            onDoubleClick={() => setEditing({ original: n, ...n })}
          >
            <span>{n.name}</span>
            <span>{n.formula}</span>
            <span>{n.scope === null ? "Workbook" : ctl.info.sheets[n.scope]?.name}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function quoteSheet(name: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

function absRef(ctl: WorkbookController) {
  const r = ctl.usedClamp(ctl.range);
  const a = `$${colName(r.c1)}$${r.r1}`;
  return r.r1 === r.r2 && r.c1 === r.c2 ? a : `${a}:$${colName(r.c2)}$${r.r2}`;
}

// ----------------------------------------------------------------------

function SortDialog({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const [target, setTarget] = useState(ctl.usedClamp(ctl.range));
  const [hasHeader, setHasHeader] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [keys, setKeys] = useState([{ column: ctl.sel.active.c, ascending: true }]);
  useEffect(() => {
    (async () => {
      let t = ctl.usedClamp(ctl.range);
      if (t.r1 === t.r2 && t.c1 === t.c2) t = await api.currentRegion(ctl.id, ctl.sheet, t.r1, t.c1);
      setTarget(t);
      const guess = await ctl.guessHeader(t);
      setHasHeader(guess);
      const chunk = await api.cells(ctl.id, ctl.sheet, { r1: t.r1, c1: t.c1, r2: t.r1, c2: t.c2 }, false);
      const names: string[] = [];
      for (let c = t.c1; c <= t.c2; c++) names.push(chunk.cells.find((x) => x[1] === c)?.[2] ?? "");
      setHeaders(names);
    })();
  }, []);
  const label = (c: number) => (hasHeader && headers[c - target.c1] ? headers[c - target.c1] : `Column ${colName(c)}`);
  const cols: number[] = [];
  for (let c = target.c1; c <= target.c2; c++) cols.push(c);
  return (
    <Dialog
      title="Sort"
      onClose={onClose}
      width={560}
      onSubmit={async () => {
        onClose();
        ctl.selectRange(target);
        await ctl.run(api.sort(ctl.id, ctl.sheet, target, keys, hasHeader));
      }}
    >
      <div className="sort-top">
        <button type="button" className="btn" onClick={() => setKeys([...keys, { column: target.c1, ascending: true }])}>
          <Icon name="plus" /> Add Level
        </button>
        <button type="button" className="btn" disabled={keys.length <= 1} onClick={() => setKeys(keys.slice(0, -1))}>
          <Icon name="x" /> Delete Level
        </button>
        <label className="fc-row check right">
          <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> My data has headers
        </label>
      </div>
      <div className="sort-range">Range: {rectName(target)}</div>
      <div className="sort-levels">
        <div className="sl-head">
          <span>Column</span>
          <span>Order</span>
        </div>
        {keys.map((k, i) => (
          <div key={i} className="sl-row">
            <span className="sl-label">{i === 0 ? "Sort by" : "Then by"}</span>
            <select value={k.column} onChange={(e) => setKeys(keys.map((x, j) => (j === i ? { ...x, column: Number(e.target.value) } : x)))}>
              {cols.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </select>
            <select value={k.ascending ? "asc" : "desc"} onChange={(e) => setKeys(keys.map((x, j) => (j === i ? { ...x, ascending: e.target.value === "asc" } : x)))}>
              <option value="asc">A to Z / Smallest to Largest</option>
              <option value="desc">Z to A / Largest to Smallest</option>
            </select>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

function RemoveDuplicates({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const [target, setTarget] = useState(ctl.usedClamp(ctl.range));
  const [hasHeader, setHasHeader] = useState(false);
  const [checked, setChecked] = useState<number[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      let t = ctl.usedClamp(ctl.range);
      if (t.r1 === t.r2 && t.c1 === t.c2) t = await api.currentRegion(ctl.id, ctl.sheet, t.r1, t.c1);
      setTarget(t);
      setHasHeader(await ctl.guessHeader(t));
      const all: number[] = [];
      for (let c = t.c1; c <= t.c2; c++) all.push(c);
      setChecked(all);
      const chunk = await api.cells(ctl.id, ctl.sheet, { r1: t.r1, c1: t.c1, r2: t.r1, c2: t.c2 }, false);
      setHeaders(all.map((c) => chunk.cells.find((x) => x[1] === c)?.[2] ?? ""));
    })();
  }, []);
  const cols: number[] = [];
  for (let c = target.c1; c <= target.c2; c++) cols.push(c);
  return (
    <Dialog
      title="Remove Duplicates"
      onClose={onClose}
      width={420}
      onSubmit={async () => {
        onClose();
        try {
          const [removed, remaining, info] = await api.removeDuplicates(ctl.id, ctl.sheet, target, checked, hasHeader);
          await ctl.setInfo(info);
          await ctl.ui?.ask(
            "Remove Duplicates",
            removed ? `${removed} duplicate values found and removed; ${remaining} unique values remain.` : "No duplicate values found.",
            [{ label: "OK", value: "ok", primary: true }],
          );
        } catch (e) {
          ctl.fail(e);
        }
      }}
    >
      <p>To delete duplicate values, select one or more columns that contain duplicates.</p>
      <div className="nm-actions">
        <button type="button" className="btn" onClick={() => setChecked(cols)}>
          Select All
        </button>
        <button type="button" className="btn" onClick={() => setChecked([])}>
          Unselect All
        </button>
        <label className="fc-row check right">
          <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> My data has headers
        </label>
      </div>
      <div className="listbox">
        {cols.map((c, i) => (
          <label key={c} className="lb-item check">
            <input type="checkbox" checked={checked.includes(c)} onChange={(e) => setChecked(e.target.checked ? [...checked, c] : checked.filter((x) => x !== c))} />
            {hasHeader && headers[i] ? headers[i] : `Column ${colName(c)}`}
          </label>
        ))}
      </div>
    </Dialog>
  );
}

// ----------------------------------------------------------------------

const CF_TEXT: Record<string, { title: string; prompt: string; two?: boolean; noValue?: boolean }> = {
  greaterThan: { title: "Greater Than", prompt: "Format cells that are GREATER THAN:" },
  lessThan: { title: "Less Than", prompt: "Format cells that are LESS THAN:" },
  between: { title: "Between", prompt: "Format cells that are BETWEEN:", two: true },
  equalTo: { title: "Equal To", prompt: "Format cells that are EQUAL TO:" },
  textContains: { title: "Text That Contains", prompt: "Format cells that contain the text:" },
  dateOccurring: { title: "A Date Occurring", prompt: "Format cells that contain a date occurring:" },
  duplicate: { title: "Duplicate Values", prompt: "Format cells that contain:", noValue: true },
  top10: { title: "Top 10 Items", prompt: "Format cells that rank in the TOP:" },
  top10pct: { title: "Top 10%", prompt: "Format cells that rank in the TOP (%):" },
  bottom10: { title: "Bottom 10 Items", prompt: "Format cells that rank in the BOTTOM:" },
  bottom10pct: { title: "Bottom 10%", prompt: "Format cells that rank in the BOTTOM (%):" },
  aboveAverage: { title: "Above Average", prompt: "Format cells that are ABOVE AVERAGE:", noValue: true },
  belowAverage: { title: "Below Average", prompt: "Format cells that are BELOW AVERAGE:", noValue: true },
};

const PERIODS = ["Yesterday", "Today", "Tomorrow", "Last7Days", "LastWeek", "ThisWeek", "NextWeek", "LastMonth", "ThisMonth", "NextMonth"];

function CfRule({ ctl, kind, onClose }: { ctl: WorkbookController; kind: string; onClose: () => void }) {
  const meta = CF_TEXT[kind] ?? CF_TEXT.greaterThan;
  const isTop = kind.startsWith("top") || kind.startsWith("bottom");
  const [v1, setV1] = useState(isTop ? "10" : kind === "dateOccurring" ? "Today" : "");
  const [v2, setV2] = useState("");
  const [dup, setDup] = useState<"Duplicate" | "Unique">("Duplicate");
  const [preset, setPreset] = useState(CF_PRESETS[0].id);
  const format = CF_PRESETS.find((p) => p.id === preset)!.format;
  const value = (v: string) => {
    const t = v.trim().replace(/^=/, "");
    if (t === "" || /^-?\d+(\.\d+)?$/.test(t) || /^\$?[A-Za-z]{1,3}\$?\d+$/.test(t)) return t;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const submit = async () => {
    let rule: Record<string, unknown>;
    const base = { format, stop_if_true: false };
    switch (kind) {
      case "greaterThan":
        rule = { type: "CellIs", operator: "GreaterThan", formula: value(v1), formula2: null, ...base };
        break;
      case "lessThan":
        rule = { type: "CellIs", operator: "LessThan", formula: value(v1), formula2: null, ...base };
        break;
      case "between":
        rule = { type: "CellIs", operator: "Between", formula: value(v1), formula2: value(v2), ...base };
        break;
      case "equalTo":
        rule = { type: "CellIs", operator: "Equal", formula: value(v1), formula2: null, ...base };
        break;
      case "textContains":
        rule = { type: "Text", operator: "Contains", value: v1, ...base };
        break;
      case "dateOccurring":
        rule = { type: "TimePeriod", time_period: v1, date1: null, date2: null, ...base };
        break;
      case "duplicate":
        rule = { type: dup === "Duplicate" ? "DuplicateValues" : "UniqueValues", ...base };
        break;
      case "top10":
      case "top10pct":
        rule = { type: "Top10", rank: Math.max(1, Number(v1) || 10), percent: kind === "top10pct", ...base };
        break;
      case "bottom10":
      case "bottom10pct":
        rule = { type: "Bottom10", rank: Math.max(1, Number(v1) || 10), percent: kind === "bottom10pct", ...base };
        break;
      case "aboveAverage":
        rule = { type: "AboveAverage", ...base };
        break;
      default:
        rule = { type: "BelowAverage", ...base };
    }
    onClose();
    await addRule(ctl, rule);
  };
  return (
    <Dialog title={meta.title} onClose={onClose} onSubmit={submit} width={460}>
      <p>{meta.prompt}</p>
      <div className="cf-row">
        {kind === "duplicate" ? (
          <select value={dup} onChange={(e) => setDup(e.target.value as "Duplicate")}>
            <option>Duplicate</option>
            <option>Unique</option>
          </select>
        ) : kind === "dateOccurring" ? (
          <select value={v1} onChange={(e) => setV1(e.target.value)}>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {p.replace(/([a-z])([A-Z0-9])/g, "$1 $2")}
              </option>
            ))}
          </select>
        ) : meta.noValue ? null : (
          <>
            <input value={v1} onChange={(e) => setV1(e.target.value)} autoFocus style={{ width: isTop ? 70 : 150 }} />
            {meta.two && (
              <>
                <span>and</span>
                <input value={v2} onChange={(e) => setV2(e.target.value)} style={{ width: 150 }} />
              </>
            )}
          </>
        )}
        <span>{kind === "duplicate" ? "values with" : "with"}</span>
        <select value={preset} onChange={(e) => setPreset(e.target.value)}>
          {CF_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </Dialog>
  );
}

function CfManage({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const [rules, setRules] = useState<ConditionalFormat[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const load = () => api.cfList(ctl.id, ctl.sheet).then(setRules).catch((e) => ctl.fail(e));
  useEffect(() => {
    load();
  }, []);
  const describe = (r: ConditionalFormat) => {
    const rule = r.rule as Record<string, unknown>;
    switch (rule.type) {
      case "CellIs":
        return `Cell Value ${String(rule.operator).replace(/([A-Z])/g, " $1").trim().toLowerCase()} ${rule.formula}${rule.formula2 ? ` and ${rule.formula2}` : ""}`;
      case "Text":
        return `Cell Value ${String(rule.operator).toLowerCase()} "${rule.value}"`;
      default:
        return String(rule.type).replace(/([a-z])([A-Z0-9])/g, "$1 $2");
    }
  };
  return (
    <Dialog
      title="Conditional Formatting Rules Manager"
      onClose={onClose}
      width={620}
      footer={
        <button type="button" className="btn primary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="nm-actions">
        <span>Showing formatting rules for: this worksheet</span>
        <button
          type="button"
          className="btn"
          disabled={selected === null}
          onClick={async () => {
            if (selected === null) return;
            if (await ctl.run(api.cfDelete(ctl.id, ctl.sheet, selected))) {
              setSelected(null);
              load();
            }
          }}
        >
          <Icon name="x" /> Delete Rule
        </button>
      </div>
      <div className="table-list">
        <div className="tl-head">
          <span>Rule (applied in order shown)</span>
          <span>Applies to</span>
          <span>Priority</span>
        </div>
        {rules.length === 0 && <div className="tl-empty">No rules on this sheet.</div>}
        {rules.map((r) => (
          <div key={r.index} className={`tl-row ${selected === r.index ? "selected" : ""}`} onClick={() => setSelected(r.index)}>
            <span>{describe(r)}</span>
            <span>={r.range}</span>
            <span>{r.priority}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

// ----------------------------------------------------------------------

function Choice({
  title,
  options,
  initial,
  onOk,
  onClose,
}: {
  title: string;
  options: [string, string][];
  initial: string;
  onOk: (v: string) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <Dialog
      title={title}
      onClose={onClose}
      width={300}
      onSubmit={() => {
        onClose();
        onOk(v);
      }}
    >
      <fieldset>
        <legend>{title.replace("...", "")}</legend>
        {options.map(([value, label]) => (
          <label key={value} className="fc-row check">
            <input type="radio" name="choice" checked={v === value} onChange={() => setV(value)} /> {label}
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}

function NumberPrompt({
  title,
  label,
  initial,
  min,
  max,
  onOk,
  onClose,
  step = 0.01,
}: {
  title: string;
  label: string;
  initial: number;
  min: number;
  max: number;
  step?: number;
  onOk: (v: number) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState(String(Math.round(initial * 100) / 100));
  return (
    <Dialog
      title={title}
      onClose={onClose}
      width={280}
      onSubmit={() => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < min || n > max) {
          return;
        }
        onClose();
        onOk(n);
      }}
    >
      <label className="fc-row">
        <span className="lbl">{label}</span>
        <input type="number" value={v} min={min} max={max} step={step} onChange={(e) => setV(e.target.value)} autoFocus />
      </label>
    </Dialog>
  );
}

function TextPrompt({ title, label, initial, onOk, onClose }: { title: string; label: string; initial: string; onOk: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <Dialog
      title={title}
      onClose={onClose}
      width={320}
      onSubmit={() => {
        onClose();
        onOk(v);
      }}
    >
      <label className="fc-row">
        <span className="lbl">{label}</span>
        <input value={v} onChange={(e) => setV(e.target.value)} autoFocus />
      </label>
    </Dialog>
  );
}

function Stats({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const [s, setS] = useState<WorkbookStats | null>(null);
  useEffect(() => {
    api.stats(ctl.id).then(setS).catch((e) => ctl.fail(e));
  }, []);
  return (
    <Dialog title="Workbook Statistics" onClose={onClose} width={380} footer={<button type="submit" className="btn primary">OK</button>} onSubmit={onClose}>
      {s && (
        <div className="stats-list">
          <div className="stats-head">Current sheet: {ctl.sheetName}</div>
          <div>
            <span>End of sheet</span>
            <span>{s.usedRange || "A1"}</span>
          </div>
          <div>
            <span>Cells with data</span>
            <span>{s.activeSheetCells}</span>
          </div>
          <div>
            <span>Formulas</span>
            <span>{s.activeSheetFormulas}</span>
          </div>
          <div className="stats-head">Workbook</div>
          <div>
            <span>Sheets</span>
            <span>{s.sheets}</span>
          </div>
          <div>
            <span>Cells with data</span>
            <span>{s.cellsWithData}</span>
          </div>
          <div>
            <span>Formulas</span>
            <span>{s.formulas}</span>
          </div>
          <div>
            <span>Merged ranges</span>
            <span>{s.mergedRanges}</span>
          </div>
        </div>
      )}
    </Dialog>
  );
}


// ----------------------------------------------------------------------

const SYMBOLS = "₹$€£¥¢©®™°±×÷≈≠≤≥∞√∑∏πΩµαβγδθλσφψ←↑→↓↔✓✗★☆●○■□▲▼◆♠♣♥♦§¶†‡•…‰′″℃℉½¼¾²³¹№";

function SymbolDialog({ ctl, onClose }: { ctl: WorkbookController; onClose: () => void }) {
  const [sel, setSel] = useState("₹");
  return (
    <Dialog
      title="Symbol"
      onClose={onClose}
      width={460}
      onSubmit={() => {
        ctl.insertText(sel);
        onClose();
      }}
      footer={
        <>
          <button type="submit" className="btn primary">
            Insert
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="symbol-grid">
        {[...SYMBOLS].map((s) => (
          <button
            type="button"
            key={s}
            className={s === sel ? "selected" : ""}
            onClick={() => setSel(s)}
            onDoubleClick={() => {
              ctl.insertText(s);
              onClose();
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function Info({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <Dialog title={title} onClose={onClose} width={440} onSubmit={onClose} footer={<button type="submit" className="btn primary">OK</button>}>
      {children}
    </Dialog>
  );
}

// ----------------------------------------------------------------------

export function DialogHost({ ctl, state, onClose }: { ctl: WorkbookController; state: DialogState | null; onClose: () => void }) {
  if (!state) return null;
  const p = state.props ?? {};
  const r = ctl.range;
  switch (state.name) {
    case "formatCells":
      return <FormatCellsDialog ctl={ctl} tab={p.tab as "number"} onClose={onClose} />;
    case "find":
      return <FindReplace ctl={ctl} tab={(p.tab as "find") ?? "find"} onClose={onClose} />;
    case "goto":
      return <GoTo ctl={ctl} onClose={onClose} />;
    case "insertFunction":
      return <InsertFunction ctl={ctl} onClose={onClose} />;
    case "nameManager":
      return <NameManager ctl={ctl} onClose={onClose} />;
    case "defineName":
      return <NameManager ctl={ctl} onClose={onClose} define />;
    case "sort":
      return <SortDialog ctl={ctl} onClose={onClose} />;
    case "removeDuplicates":
      return <RemoveDuplicates ctl={ctl} onClose={onClose} />;
    case "cfRule":
      return <CfRule ctl={ctl} kind={String(p.kind ?? "greaterThan")} onClose={onClose} />;
    case "cfManage":
      return <CfManage ctl={ctl} onClose={onClose} />;
    case "note":
      return <NoteDialog ctl={ctl} onClose={onClose} />;
    case "link":
      return <LinkDialog ctl={ctl} onClose={onClose} />;
    case "chart":
      return <ChartDialog ctl={ctl} id={String(p.id ?? "")} onClose={onClose} />;
    case "textToColumns":
      return <TextToColumnsDialog ctl={ctl} onClose={onClose} />;
    case "pivot":
      return <PivotDialog ctl={ctl} onClose={onClose} />;
    case "healthCheck":
      return <HealthCheckDialog ctl={ctl} onClose={onClose} />;
    case "switchWindows":
      return <SwitchWindowsDialog ctl={ctl} onClose={onClose} />;
    case "series":
      return <SeriesDialog ctl={ctl} onClose={onClose} />;
    case "pasteSpecial":
      return <PasteSpecialDialog ctl={ctl} onClose={onClose} />;
    case "insertCells":
      return (
        <Choice
          title="Insert"
          initial="down"
          options={[
            ["right", "Shift cells right"],
            ["down", "Shift cells down"],
            ["row", "Entire row"],
            ["col", "Entire column"],
          ]}
          onOk={(v) => ctl.insertCells(v as "down")}
          onClose={onClose}
        />
      );
    case "deleteCells":
      return (
        <Choice
          title="Delete"
          initial="up"
          options={[
            ["left", "Shift cells left"],
            ["up", "Shift cells up"],
            ["row", "Entire row"],
            ["col", "Entire column"],
          ]}
          onOk={(v) => ctl.deleteCells(v as "up")}
          onClose={onClose}
        />
      );
    case "rowHeight":
      return (
        <NumberPrompt
          title="Row Height"
          label="Row height:"
          initial={(ctl.rows.size(r.r1) / ctl.zoom) * 0.75}
          min={0}
          max={409}
          step={0.75}
          onOk={(pt) => ctl.setRowHeight(Math.round(pt / 0.75))}
          onClose={onClose}
        />
      );
    case "colWidth":
      return (
        <NumberPrompt
          title={p.all ? "Standard Width" : "Column Width"}
          label={p.all ? "Standard column width:" : "Column width:"}
          initial={Math.max(0, (ctl.cols.size(r.c1) / ctl.zoom - 5) / 7)}
          min={0}
          max={255}
          onOk={(chars) => {
            const px = chars <= 0 ? 0 : Math.round(chars * 7 + 5);
            if (p.all) ctl.setColWidth(px, 1, Math.max(1, ctl.layout?.maxCol ?? 1) + 50);
            else ctl.setColWidth(px);
          }}
          onClose={onClose}
        />
      );
    case "renameSheet":
      return <TextPrompt title="Rename Sheet" label="Name:" initial={ctl.sheetName} onOk={(v) => ctl.renameSheet(ctl.sheet, v)} onClose={onClose} />;
    case "zoom":
      return (
        <Choice
          title="Zoom"
          initial={String(Math.round(ctl.zoom * 100))}
          options={[
            ["200", "200%"],
            ["150", "150%"],
            ["100", "100%"],
            ["75", "75%"],
            ["50", "50%"],
            ["25", "25%"],
          ]}
          onOk={(v) => ctl.setZoom(Number(v) / 100)}
          onClose={onClose}
        />
      );
    case "unhideSheet": {
      const hidden = ctl.info.sheets.filter((s) => s.hidden);
      return (
        <Choice
          title="Unhide"
          initial={String(hidden[0]?.index ?? "")}
          options={hidden.map((s) => [String(s.index), s.name])}
          onOk={(v) => v !== "" && ctl.setSheetHidden(Number(v), false)}
          onClose={onClose}
        />
      );
    }
    case "moveSheet": {
      const index = (p.index as number) ?? ctl.sheet;
      return <MoveSheet ctl={ctl} index={index} onClose={onClose} />;
    }
    case "stats":
      return <Stats ctl={ctl} onClose={onClose} />;
    case "symbol":
      return <SymbolDialog ctl={ctl} onClose={onClose} />;
    case "shortcuts":
      return <ShortcutsDialog onClose={onClose} />;
    case "pasteName":
      return <PasteNameDialog ctl={ctl} onClose={onClose} />;
    case "createNames":
      return <CreateNamesDialog ctl={ctl} onClose={onClose} />;
    case "about":
      return (
        <Info title="About Sheets" onClose={onClose}>
          <div className="about">
            <Icon name="logo" size={40} />
            <div>
              <b>Sheets</b>
              <p>A free, lightweight spreadsheet that opens and saves Microsoft Excel .xlsx files, built with Rust (Tauri) and the IronCalc engine.</p>
              <p className="muted small">github.com/Dipendra-creator/sheets-desktop</p>
            </div>
          </div>
        </Info>
      );
    case "addins":
      return (
        <Info title="Add-ins" onClose={onClose}>
          <p>Add-ins are not available in this version.</p>
        </Info>
      );
    case "feedback":
      return (
        <Info title="Feedback" onClose={onClose}>
          <p>Thanks for trying Sheets! Report bugs and ideas on GitHub: github.com/Dipendra-creator/sheets-desktop/issues</p>
        </Info>
      );
    case "print":
      return (
        <Info title="Print" onClose={onClose}>
          <p>Printing is not available in this version. Save as .xlsx and print from Excel, or export to CSV.</p>
        </Info>
      );
    default:
      return null;
  }
}

function MoveSheet({ ctl, index, onClose }: { ctl: WorkbookController; index: number; onClose: () => void }) {
  const [before, setBefore] = useState(index);
  const [copy, setCopy] = useState(false);
  const sheets = ctl.info.sheets;
  return (
    <Dialog
      title="Move or Copy"
      onClose={onClose}
      width={340}
      onSubmit={async () => {
        onClose();
        if (copy) {
          await ctl.duplicateSheet(index);
          return;
        }
        const to = before >= sheets.length ? sheets.length - 1 : before > index ? before - 1 : before;
        await ctl.moveSheet(index, to);
      }}
    >
      <p>
        Move selected sheet <b>{sheets[index]?.name}</b>
      </p>
      <div className="fc-label">Before sheet:</div>
      <div className="listbox short">
        {sheets.map((s) => (
          <div key={s.index} className={`lb-item ${before === s.index ? "selected" : ""}`} onClick={() => setBefore(s.index)}>
            {s.name}
          </div>
        ))}
        <div className={`lb-item ${before === sheets.length ? "selected" : ""}`} onClick={() => setBefore(sheets.length)}>
          (move to end)
        </div>
      </div>
      <label className="fc-row check">
        <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} /> Create a copy
      </label>
    </Dialog>
  );
}

export { cellName };
