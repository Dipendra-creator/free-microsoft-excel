// AutoFilter dropdown: sort, clear, search and a checklist of the column's values.

import { useEffect, useMemo, useState } from "react";
import { api, type FilterValue } from "../api";
import { Icon } from "../components/Icon";
import { Popup } from "../components/Popup";
import type { WorkbookController } from "./controller";

const SHOWN = 1000;

export function FilterMenu({
  ctl,
  col,
  anchor,
  onClose,
}: {
  ctl: WorkbookController;
  col: number;
  anchor: DOMRect;
  onClose: () => void;
}) {
  const [values, setValues] = useState<FilterValue[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const f = ctl.filter;
  const header = f ? ctl.cache.get(f.r1, col)?.text || `Column ${ctl.colLabel(col)}` : "";
  const active = !!f?.active.includes(col);

  useEffect(() => {
    api
      .filterValues(ctl.id, ctl.sheet, col)
      .then((v) => {
        setValues(v);
        setChecked(new Set(v.filter((x) => x.checked).map((x) => x.text)));
      })
      .catch((e) => {
        ctl.fail(e);
        onClose();
      });
  }, [ctl, col]);

  const numeric = useMemo(() => (values ?? []).filter((v) => v.text).every((v) => !Number.isNaN(Number(v.text.replace(/[,$%€£]/g, "")))), [values]);
  const query = q.trim().toLowerCase();
  const visible = (values ?? []).filter((v) => !query || (v.text || "(blanks)").toLowerCase().includes(query));
  const allVisibleChecked = visible.length > 0 && visible.every((v) => checked.has(v.text));

  const toggleAll = () => {
    const next = new Set(checked);
    for (const v of visible) {
      if (allVisibleChecked) next.delete(v.text);
      else next.add(v.text);
    }
    setChecked(next);
  };

  const apply = () => {
    if (!values) return;
    // With a search, only the checked search results stay visible (like Excel)
    const allowed = query ? visible.filter((v) => checked.has(v.text)).map((v) => v.text) : [...checked];
    onClose();
    if (!query && allowed.length === values.length) ctl.setFilter(col, null);
    else ctl.setFilter(col, allowed);
  };

  const item = (icon: string, label: string, run: () => void, disabled = false) => (
    <button
      type="button"
      className="fm-item"
      disabled={disabled}
      onClick={() => {
        onClose();
        run();
      }}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );

  return (
    <Popup anchor={anchor} onClose={onClose} placement="bottom-start">
      <div className="menu filter-menu" onMouseDown={(e) => e.stopPropagation()}>
        {item("sortAZ", numeric ? "Sort Smallest to Largest" : "Sort A to Z", () => ctl.filterSort(col, true))}
        {item("sortZA", numeric ? "Sort Largest to Smallest" : "Sort Z to A", () => ctl.filterSort(col, false))}
        <div className="menu-separator" />
        {item("clear", `Clear Filter From "${header}"`, () => ctl.setFilter(col, null), !active)}
        <div className="fm-search">
          <Icon name="search" size={14} />
          <input
            autoFocus
            placeholder="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") apply();
              if (e.key === "Escape") onClose();
            }}
          />
        </div>
        <div className="fm-list">
          {!values && <div className="fm-loading">Loading…</div>}
          {values && (
            <label className="fm-check all">
              <input type="checkbox" checked={allVisibleChecked} onChange={toggleAll} />
              <span>{query ? "(Select All Search Results)" : "(Select All)"}</span>
            </label>
          )}
          {visible.slice(0, SHOWN).map((v) => (
            <label key={v.text} className="fm-check">
              <input
                type="checkbox"
                checked={checked.has(v.text)}
                onChange={() => {
                  const next = new Set(checked);
                  if (next.has(v.text)) next.delete(v.text);
                  else next.add(v.text);
                  setChecked(next);
                }}
              />
              <span className="fm-text">{v.text || "(Blanks)"}</span>
              <span className="fm-count">{v.count}</span>
            </label>
          ))}
          {visible.length > SHOWN && <div className="fm-more">Showing the first {SHOWN} of {visible.length} values. Search to narrow the list.</div>}
        </div>
        <div className="fm-buttons">
          <button type="button" className="btn primary" onClick={apply} disabled={!values}>
            OK
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Popup>
  );
}
