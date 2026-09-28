import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, type DefinedName } from "../api";
import { Icon } from "../components/Icon";
import { Popup } from "../components/Popup";
import type { WorkbookController } from "./controller";
import { EditorAssist, Highlighted } from "./grid/Grid";
import { useCtl } from "./hooks";
import { handleEditorKey } from "./keys";

function NameBox({ ctl }: { ctl: WorkbookController }) {
  const text = useCtl(ctl, (c) => c.nameBoxText());
  const [value, setValue] = useState(text);
  const [focused, setFocused] = useState(false);
  const [names, setNames] = useState<DefinedName[] | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focused) setValue(text);
  }, [text, focused]);

  const submit = async () => {
    const v = value.trim();
    if (!v) return;
    if (ctl.goTo(v)) {
      ctl.ui?.focusGrid();
      return;
    }
    // A defined name?
    const list = names ?? (await api.names(ctl.id));
    const hit = list.find((n) => n.name.toLowerCase() === v.toLowerCase());
    if (hit) {
      ctl.goTo(hit.formula.replace(/^=/, ""));
      ctl.ui?.focusGrid();
      return;
    }
    // Excel: typing a new valid name defines it for the selection
    if (/^[A-Za-z_\\][A-Za-z0-9_.]*$/.test(v)) {
      const r = ctl.range;
      const ref = `${quote(ctl.sheetName)}!$${ctl.colLabel(r.c1)}$${r.r1}${r.r1 === r.r2 && r.c1 === r.c2 ? "" : `:$${ctl.colLabel(r.c2)}$${r.r2}`}`;
      if (await ctl.run(api.addName(ctl.id, v, null, ref))) ctl.ui?.focusGrid();
      return;
    }
    ctl.ui?.error("Reference isn't valid.");
  };

  return (
    <div className="name-box" ref={wrap}>
      <input
        value={value}
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setValue(text);
            ctl.ui?.focusGrid();
          }
        }}
      />
      <button
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={async () => {
          setNames(await api.names(ctl.id));
          setAnchor(wrap.current!.getBoundingClientRect());
        }}
      >
        <Icon name="chevronDown" size={10} />
      </button>
      {anchor && names && (
        <Popup anchor={anchor} onClose={() => setAnchor(null)}>
          <div className="combo-list" style={{ minWidth: 180 }}>
            {names.length === 0 && <div className="combo-item muted">No defined names</div>}
            {names.map((n) => (
              <div
                key={`${n.name}-${n.scope}`}
                className="combo-item"
                onClick={() => {
                  setAnchor(null);
                  ctl.goTo(n.formula.replace(/^=/, ""));
                  ctl.ui?.focusGrid();
                }}
              >
                {n.name}
              </div>
            ))}
          </div>
        </Popup>
      )}
    </div>
  );
}

function quote(name: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

export function FormulaBar({ ctl }: { ctl: WorkbookController }) {
  const s = useCtl(ctl, (c) => ({
    edit: c.edit,
    content: c.activeInfo && c.activeInfo.row === c.sel.active.r && c.activeInfo.col === c.sel.active.c ? c.activeInfo.content : "",
    expanded: c.formulaBarExpanded,
    visible: c.showFormulaBar,
  }));
  const ref = useRef<HTMLTextAreaElement>(null);
  const applied = useRef(-1);
  const editingHere = s.edit?.source === "bar";
  const value = s.edit ? s.edit.text : s.content;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!editingHere || !s.edit) {
      applied.current = -1;
      if (el.value !== value) el.value = value;
      return;
    }
    if (s.edit.sync !== applied.current) {
      applied.current = s.edit.sync;
      if (el.value !== s.edit.text) el.value = s.edit.text;
      if (document.activeElement === el) el.setSelectionRange(s.edit.caret, s.edit.caretEnd);
    }
  });

  if (!s.visible) return null;
  const isFormula = value.startsWith("=");
  const box = ref.current?.getBoundingClientRect();

  return (
    <div className={`formula-bar ${s.expanded ? "expanded" : ""}`}>
      <NameBox ctl={ctl} />
      <div className="fb-grip">
        <Icon name="dotsV" size={12} />
      </div>
      <div className="fb-buttons">
        <button title="Cancel" disabled={!s.edit} onMouseDown={(e) => e.preventDefault()} onClick={() => ctl.cancelEdit()}>
          <Icon name="x" />
        </button>
        <button title="Enter" disabled={!s.edit} onMouseDown={(e) => e.preventDefault()} onClick={() => ctl.commitEdit("none")}>
          <Icon name="check" />
        </button>
        <button title="Insert Function" onMouseDown={(e) => e.preventDefault()} onClick={() => ctl.ui?.dialog("insertFunction")}>
          <Icon name="fx" />
        </button>
      </div>
      <div className="fb-input">
        {isFormula && (
          <div className="fb-highlight" aria-hidden>
            <Highlighted text={value} />
          </div>
        )}
        <textarea
          ref={ref}
          className={isFormula ? "formula" : ""}
          spellCheck={false}
          defaultValue={value}
          onFocus={() => {
            if (!ctl.edit) ctl.startEdit("edit", undefined, "bar");
            else if (ctl.edit.source !== "bar") {
              ctl.edit = { ...ctl.edit, source: "bar", mode: "edit", point: null };
              ctl.emit();
            }
          }}
          onInput={(e) => {
            const el = e.currentTarget;
            if (!ctl.edit) ctl.startEdit("edit", el.value, "bar");
            else ctl.updateEdit(el.value, el.selectionStart, el.selectionEnd);
          }}
          onSelect={(e) => {
            if (ctl.edit?.source === "bar") ctl.setEditCaret(e.currentTarget.selectionStart, e.currentTarget.selectionEnd);
          }}
          onKeyDown={(e) => {
            if (!ctl.edit) return;
            if (handleEditorKey(ctl, e.nativeEvent)) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        />
        {editingHere && box && <EditorAssist ctl={ctl} x={box.left} y={box.top + Math.min(box.height, 24) + 2} fixed />}
      </div>
      <button
        className="fb-expand"
        title={s.expanded ? "Collapse Formula Bar (Ctrl+Shift+U)" : "Expand Formula Bar (Ctrl+Shift+U)"}
        onClick={() => {
          ctl.formulaBarExpanded = !s.expanded;
          ctl.emit();
        }}
      >
        <Icon name={s.expanded ? "chevronUp" : "chevronDown"} size={12} />
      </button>
    </div>
  );
}
