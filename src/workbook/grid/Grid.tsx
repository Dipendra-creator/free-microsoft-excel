import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { rect } from "../../lib/a1";
import { enclosingCall, tokenize } from "../../lib/formula";
import { functionDoc, syntaxParts } from "../../lib/functions";
import { fontCss, type HitResult, type WorkbookController } from "../controller";
import { useCtl } from "../hooks";
import { handleEditorKey, handleGridKey } from "../keys";
import { ChartLayer } from "../charts/ChartLayer";
import { Menu } from "../../components/Menu";
import { FillOptionsButton } from "../FillOptions";
import { FilterMenu } from "../FilterMenu";
import { NotesLayer } from "../NotesLayer";
import { filterButtonBox, GridRenderer, readTheme } from "./renderer";
import { Scrollbar } from "./Scrollbar";

const LINK = /^((https?:\/\/|mailto:)\S+|www\.\S+\.\S+)$/i;

export interface GridContextMenu {
  x: number;
  y: number;
  kind: "cell" | "colHeader" | "rowHeader";
}

export function Grid({
  ctl,
  onContextMenu,
  editorRef,
}: {
  ctl: WorkbookController;
  onContextMenu: (m: GridContextMenu) => void;
  editorRef: React.MutableRefObject<HTMLTextAreaElement | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GridRenderer | null>(null);
  const [cursor, setCursor] = useState("cell");
  const [filterMenu, setFilterMenu] = useState<{ col: number; anchor: DOMRect } | null>(null);
  const [hoverNote, setHoverNote] = useState<{ r: number; c: number } | null>(null);

  // Renderer lifecycle
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const renderer = new GridRenderer(canvas, ctl, readTheme(wrap));
    rendererRef.current = renderer;
    const unsub = ctl.onPaint(() => renderer.draw());
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      renderer.resize(w, h, window.devicePixelRatio || 1);
      ctl.setViewport(w, h);
      renderer.draw();
    });
    ro.observe(wrap);
    const mo = new MutationObserver(() => {
      renderer.setTheme(readTheme(wrap));
      ctl.paint();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const onDpr = () => {
      renderer.resize(wrap.clientWidth, wrap.clientHeight, window.devicePixelRatio || 1);
      ctl.paint();
    };
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener?.("change", onDpr);
    return () => {
      unsub();
      ro.disconnect();
      mo.disconnect();
      mq.removeEventListener?.("change", onDpr);
    };
  }, [ctl]);

  // Marching ants animation
  const animating = useCtl(ctl, (c) => !!c.clip || !!c.edit?.point);
  useEffect(() => {
    if (!animating) return;
    const id = window.setInterval(() => {
      if (rendererRef.current) {
        rendererRef.current.antsOffset = (rendererRef.current.antsOffset + 1) % 14;
        ctl.paint();
      }
    }, 90);
    return () => window.clearInterval(id);
  }, [animating, ctl]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const focusEditor = () => {
    const ed = editorRef.current;
    if (ed && document.activeElement !== ed) ed.focus({ preventScroll: true });
  };

  /** Auto-scroll while dragging near the edges. */
  const autoScroll = (x: number, y: number) => {
    let dx = 0;
    let dy = 0;
    const w = ctl.viewport.width;
    const h = ctl.viewport.height;
    if (x > w - 10) dx = Math.min(60, (x - w + 10) / 2 + 8);
    else if (x < ctl.originX && ctl.scroll.x > 0) dx = -Math.min(60, (ctl.originX - x) / 2 + 8);
    if (y > h - 10) dy = Math.min(60, (y - h + 10) / 2 + 8);
    else if (y < ctl.originY && ctl.scroll.y > 0) dy = -Math.min(60, (ctl.originY - y) / 2 + 8);
    if (dx || dy) ctl.scrollBy(dx, dy);
  };

  const drag = (onMove: (x: number, y: number) => void, onUp: (x: number, y: number, ev: MouseEvent) => void) => {
    let last = { x: 0, y: 0 };
    let timer: number | undefined;
    const move = (ev: MouseEvent) => {
      last = local(ev);
      onMove(last.x, last.y);
      window.clearInterval(timer);
      const outside = last.x < ctl.originX || last.y < ctl.originY || last.x > ctl.viewport.width - 10 || last.y > ctl.viewport.height - 10;
      if (outside) {
        timer = window.setInterval(() => {
          autoScroll(last.x, last.y);
          onMove(last.x, last.y);
        }, 40);
      }
    };
    const up = (ev: MouseEvent) => {
      window.clearInterval(timer);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      ctl.dragging = false;
      const p = local(ev);
      onUp(p.x, p.y, ev);
      ctl.emit();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const clampCell = (x: number, y: number) => {
    const r = ctl.rowAt(Math.max(ctl.headerH + 1, Math.min(y, ctl.viewport.height - 1)));
    const c = ctl.colAt(Math.max(ctl.headerW + 1, Math.min(x, ctl.viewport.width - 1)));
    return { r, c };
  };

  /** Filter dropdown button under (x, y), if any. */
  const filterButtonHit = (hit: HitResult, x: number, y: number): DOMRect | null => {
    if (hit.kind !== "cell" || !ctl.filterButtonAt(hit.r, hit.c)) return null;
    const b = filterButtonBox(ctl, hit.r, hit.c);
    if (!b || x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) return null;
    const cr = canvasRef.current!.getBoundingClientRect();
    return new DOMRect(cr.left + b.x, cr.top + b.y, b.w, b.h);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const { x, y } = local(e);
    const hit: HitResult = ctl.hitTest(x, y);
    if (hit.kind === "none") return;
    e.preventDefault();
    if (ctl.selectedChart) ctl.selectChart(null);

    // AutoFilter dropdown
    if (e.button === 0 && !ctl.edit) {
      const button = filterButtonHit(hit, x, y);
      if (button) {
        focusEditor();
        setFilterMenu({ col: hit.c, anchor: button });
        return;
      }
    }

    // Ctrl/Cmd+click opens a link typed in the cell
    if (e.button === 0 && (e.ctrlKey || e.metaKey) && hit.kind === "cell" && !ctl.edit) {
      const text = (ctl.cache.get(hit.r, hit.c)?.text ?? "").trim();
      if (LINK.test(text)) {
        ctl.openLink(hit.r, hit.c);
        return;
      }
    }

    // Right click: keep the selection if clicked inside it
    if (e.button === 2) {
      focusEditor();
      if (ctl.edit) ctl.commitEdit("none");
      const inside =
        hit.kind === "cell"
          ? hit.r >= ctl.sel.range.r1 && hit.r <= ctl.sel.range.r2 && hit.c >= ctl.sel.range.c1 && hit.c <= ctl.sel.range.c2
          : hit.kind === "colHeader"
            ? hit.c >= ctl.sel.range.c1 && hit.c <= ctl.sel.range.c2 && ctl.sel.range.r1 === 1 && ctl.sel.range.r2 >= 1_048_576
            : hit.kind === "rowHeader"
              ? hit.r >= ctl.sel.range.r1 && hit.r <= ctl.sel.range.r2 && ctl.sel.range.c1 === 1 && ctl.sel.range.c2 >= 16_384
              : true;
      if (!inside) {
        if (hit.kind === "cell") ctl.select(hit.r, hit.c);
        else if (hit.kind === "colHeader") ctl.selectColumns(hit.c, hit.c);
        else if (hit.kind === "rowHeader") ctl.selectRows(hit.r, hit.r);
      }
      if (hit.kind !== "corner") onContextMenu({ x: e.clientX, y: e.clientY, kind: hit.kind });
      return;
    }
    if (e.button !== 0) return;

    // Formula point mode
    if (ctl.edit && hit.kind === "cell" && ctl.canPointWithMouse()) {
      const anchor = { r: hit.r, c: hit.c };
      ctl.pointTo(rect(hit.r, hit.c), anchor, anchor);
      ctl.dragging = true;
      drag(
        (mx, my) => {
          const p = clampCell(mx, my);
          ctl.pointTo(rect(anchor.r, anchor.c, p.r, p.c), anchor, p);
        },
        () => {
          const ed = editorRef.current;
          if (ctl.edit?.source === "cell") ed?.focus({ preventScroll: true });
        },
      );
      return;
    }
    if (ctl.edit) {
      ctl.commitEdit("none");
    }
    focusEditor();

    if (hit.resize) {
      const axis = hit.resize;
      const index = hit.index!;
      const startSize = axis === "col" ? ctl.cols.size(index) : ctl.rows.size(index);
      const start = axis === "col" ? ctl.colX(index) : ctl.rowY(index);
      ctl.resizeGuide = { axis, pos: start + startSize };
      ctl.paint();
      drag(
        (mx, my) => {
          const pos = Math.max(start, axis === "col" ? mx : my);
          ctl.resizeGuide = { axis, pos };
          ctl.paint();
        },
        (mx, my) => {
          ctl.resizeGuide = null;
          const pos = Math.max(start, axis === "col" ? mx : my);
          const size = Math.round((pos - start) / ctl.zoom);
          ctl.paint();
          if (Math.abs(pos - (start + startSize)) < 1) return;
          const sel = ctl.sel.range;
          if (axis === "col") {
            const multi = sel.r1 === 1 && sel.r2 >= 1_048_576 && index >= sel.c1 && index <= sel.c2;
            ctl.setColWidth(size, multi ? sel.c1 : index, multi ? sel.c2 : index);
          } else {
            const multi = sel.c1 === 1 && sel.c2 >= 16_384 && index >= sel.r1 && index <= sel.r2;
            ctl.setRowHeight(size, multi ? sel.r1 : index, multi ? sel.r2 : index);
          }
        },
      );
      return;
    }

    if (hit.kind === "corner") {
      ctl.selectAll();
      return;
    }

    if (hit.kind === "colHeader") {
      const from = e.shiftKey ? ctl.sel.anchor.c : hit.c;
      ctl.selectColumns(from, hit.c, from);
      ctl.dragging = true;
      drag(
        (mx) => {
          const c = ctl.colAt(Math.max(ctl.headerW + 1, mx));
          ctl.selectColumns(from, c, from);
        },
        () => {},
      );
      return;
    }

    if (hit.kind === "rowHeader") {
      const from = e.shiftKey ? ctl.sel.anchor.r : hit.r;
      ctl.selectRows(from, hit.r, from);
      ctl.dragging = true;
      drag(
        (_mx, my) => {
          const r = ctl.rowAt(Math.max(ctl.headerH + 1, my));
          ctl.selectRows(from, r, from);
        },
        () => {},
      );
      return;
    }

    // Fill handle drag
    if (hit.fillHandle) {
      const src = ctl.sel.range;
      drag(
        (mx, my) => {
          const p = clampCell(mx, my);
          let target = src;
          const downBy = p.r - src.r2;
          const upBy = src.r1 - p.r;
          const rightBy = p.c - src.c2;
          const leftBy = src.c1 - p.c;
          const vertical = Math.max(downBy, upBy) >= Math.max(rightBy, leftBy);
          if (vertical && downBy > 0) target = { ...src, r2: p.r };
          else if (vertical && upBy > 0) target = { ...src, r1: p.r };
          else if (!vertical && rightBy > 0) target = { ...src, c2: p.c };
          else if (!vertical && leftBy > 0) target = { ...src, c1: p.c };
          ctl.fillPreview = target;
          ctl.paint();
        },
        (_x, _y, ev) => {
          const target = ctl.fillPreview;
          ctl.fillPreview = null;
          ctl.paint();
          // Ctrl (Option on the Mac) while releasing switches copy and series, like Excel
          if (target) ctl.fill(target, ev.ctrlKey || ev.altKey ? "toggle" : "auto");
        },
      );
      return;
    }

    // Cell selection
    ctl.select(hit.r, hit.c, e.shiftKey);
    ctl.dragging = true;
    drag(
      (mx, my) => {
        const p = clampCell(mx, my);
        ctl.select(p.r, p.c, true);
      },
      () => {
        if (ctl.painter) ctl.applyPainter();
      },
    );
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const { x, y } = local(e);
    const hit = ctl.hitTest(x, y);
    let c = "cell";
    if (hit.resize === "col") c = "col-resize";
    else if (hit.resize === "row") c = "row-resize";
    else if (hit.kind === "colHeader") c = "col-select";
    else if (hit.kind === "rowHeader") c = "row-select";
    else if (hit.fillHandle) c = "crosshair";
    else if (hit.kind === "corner") c = "default";
    else if (filterButtonHit(hit, x, y)) c = "default";
    else if (ctl.painter) c = "painter";
    else if ((e.ctrlKey || e.metaKey) && hit.kind === "cell" && LINK.test((ctl.cache.get(hit.r, hit.c)?.text ?? "").trim())) c = "pointer";
    if (c !== cursor) setCursor(c);
    const note = hit.kind === "cell" && ctl.hasNote(hit.r, hit.c) ? { r: hit.r, c: hit.c } : null;
    if (note?.r !== hoverNote?.r || note?.c !== hoverNote?.c) setHoverNote(note);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const { x, y } = local(e);
    const hit = ctl.hitTest(x, y);
    if (hit.resize === "col") {
      const sel = ctl.sel.range;
      const multi = sel.r1 === 1 && sel.r2 >= 1_048_576 && hit.index! >= sel.c1 && hit.index! <= sel.c2;
      ctl.autoFitCols(multi ? sel.c1 : hit.index!, multi ? sel.c2 : hit.index!);
      return;
    }
    if (hit.resize === "row") {
      ctl.autoFitRows(hit.index!, hit.index!);
      return;
    }
    if (hit.fillHandle) {
      ctl.fillToExtent();
      return;
    }
    if (hit.kind === "cell" && !ctl.edit) {
      ctl.startEdit("edit");
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      ctl.setZoom(ctl.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
      return;
    }
    const unit = e.deltaMode === 1 ? ctl.rows.def : e.deltaMode === 2 ? ctl.mainH : 1;
    let dx = e.deltaX * unit;
    let dy = e.deltaY * unit;
    if (e.shiftKey && !dx) {
      dx = dy;
      dy = 0;
    }
    ctl.scrollBy(dx, dy);
  };

  return (
    <div className="grid-row">
      <div
        ref={wrapRef}
        className={`grid-canvas-wrap cursor-${cursor}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onMouseLeave={() => hoverNote && setHoverNote(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvasRef} className="grid-canvas" />
        <ChartLayer ctl={ctl} />
        <NotesLayer ctl={ctl} hover={hoverNote} />
        <FillOptionsButton ctl={ctl} />
        <PickList ctl={ctl} canvasRef={canvasRef} />
        <CellEditor ctl={ctl} editorRef={editorRef} />
        {filterMenu && (
          <FilterMenu
            ctl={ctl}
            col={filterMenu.col}
            anchor={filterMenu.anchor}
            onClose={() => {
              setFilterMenu(null);
              focusEditor();
            }}
          />
        )}
      </div>
      <Scrollbar ctl={ctl} orientation="vertical" />
    </div>
  );
}

/** Alt+Down: the text entries of the column, to pick one for the active cell. */
function PickList({ ctl, canvasRef }: { ctl: WorkbookController; canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const items = useCtl(ctl, (c) => c.pickList);
  const canvas = canvasRef.current;
  if (!items || !canvas) return null;
  const { r, c } = ctl.sel.active;
  const cr = canvas.getBoundingClientRect();
  const anchor = new DOMRect(cr.left + ctl.colX(c), cr.top + ctl.rowY(r), Math.max(ctl.cols.size(c), 120), ctl.rows.size(r));
  return (
    <Menu
      anchor={anchor}
      items={items.map((text) => ({ label: text, onClick: () => ctl.pick(text) }))}
      onClose={() => ctl.closePickList()}
    />
  );
}

// ----------------------------------------------------------------------
// Cell editor: always-mounted textarea that also acts as the keyboard sink.
// ----------------------------------------------------------------------

const measureCanvas = document.createElement("canvas").getContext("2d")!;

/** Formula text with references coloured like Excel. */
export function Highlighted({ text }: { text: string }) {
  if (!text.startsWith("=")) return <>{text + "​"}</>;
  const { tokens } = tokenize(text);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  tokens.forEach((t, i) => {
    if (t.kind !== "ref") return;
    if (t.start > pos) parts.push(text.slice(pos, t.start));
    parts.push(
      <span key={i} style={{ color: t.color }}>
        {text.slice(t.start, t.end)}
      </span>,
    );
    pos = t.end;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return (
    <>
      {parts}
      {"​"}
    </>
  );
}

function CellEditor({ ctl, editorRef }: { ctl: WorkbookController; editorRef: React.MutableRefObject<HTMLTextAreaElement | null> }) {
  const state = useCtl(ctl, (c) => ({
    edit: c.edit,
    active: c.sel.active,
    scrollX: c.scroll.x,
    scrollY: c.scroll.y,
    zoom: c.zoom,
    vw: c.viewport.width,
    vh: c.viewport.height,
    info: c.activeInfo,
    layout: c.layout,
  }));
  const edit = state.edit;
  const ref = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const applied = useRef(-1);

  useEffect(() => {
    editorRef.current = ref.current;
  }, [editorRef]);

  const inCell = !!edit && edit.source === "cell" && edit.sheet === ctl.sheet;

  // Keep the textarea in sync with controller edits (pointing, autocomplete, F4)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!edit || edit.source !== "cell") {
      applied.current = -1;
      if (el.value !== "" && !composing.current) el.value = "";
      return;
    }
    // Only mirror programmatic changes; typed text already lives in the textarea
    if (edit.sync !== applied.current) {
      applied.current = edit.sync;
      if (el.value !== edit.text) el.value = edit.text;
      if (document.activeElement !== el) el.focus({ preventScroll: true });
      el.setSelectionRange(edit.caret, edit.caretEnd);
    } else if (inCell && document.activeElement !== el) {
      el.focus({ preventScroll: true });
    }
  });

  // Geometry of the edited cell
  const r = edit ? edit.row : state.active.r;
  const c = edit ? edit.col : state.active.c;
  const merge = ctl.mergeAt(r, c);
  const box = merge ? ctl.rangeBox(merge) : { x: ctl.colX(c), y: ctl.rowY(r), w: ctl.cols.size(c), h: ctl.rows.size(r) };
  const style = ctl.cache.styleAt(r, c);
  const font = fontCss(style, ctl.info.defaultFont, ctl.zoom);
  const showBox = !!edit && edit.sheet === ctl.sheet;
  let width = box.w + 1;
  let height = box.h + 1;
  if (showBox) {
    measureCanvas.font = font;
    const lines = edit!.text.split("\n");
    const textW = Math.max(...lines.map((l) => measureCanvas.measureText(l).width)) + 12 * ctl.zoom;
    const lineH = (style.size * 4 * ctl.zoom) / 3 * 1.25;
    if (style.wrap) {
      const approxLines = Math.ceil(textW / Math.max(20, box.w)) + lines.length - 1;
      height = Math.max(box.h + 1, approxLines * lineH + 6);
    } else {
      width = Math.min(Math.max(box.w + 1, textW), Math.max(box.w + 1, state.vw - box.x - 2));
      height = Math.max(box.h + 1, lines.length * lineH + 4);
    }
  }
  const align = style.hAlign === "right" ? "right" : style.hAlign === "center" ? "center" : "left";
  const common: CSSProperties = {
    left: box.x - 1,
    top: box.y - 1,
    width,
    height,
    font,
    color: style.color || "#000",
    textAlign: showBox ? (align as CSSProperties["textAlign"]) : "left",
    padding: `${Math.max(0, height - (style.size * 4 * ctl.zoom) / 3 * 1.25 - 4)}px ${3 * ctl.zoom}px 2px`,
  };
  if (showBox && (style.wrap || edit!.text.includes("\n"))) common.padding = `2px ${3 * ctl.zoom}px`;
  if (style.vAlign === "top" || style.vAlign === "center") common.padding = `2px ${3 * ctl.zoom}px`;

  const isFormula = showBox && edit!.text.startsWith("=");

  return (
    <>
      {showBox && (
        <div
          className="cell-editor-bg"
          style={{ ...common, background: style.fill || "#fff", color: common.color }}
          aria-hidden
        >
          {isFormula ? <Highlighted text={edit!.text} /> : inCell ? null : edit!.text}
        </div>
      )}
      <textarea
        ref={ref}
        className={`cell-editor ${inCell ? "visible" : "sink"} ${isFormula ? "formula" : ""}`}
        style={inCell ? { ...common, color: isFormula ? "transparent" : common.color } : { left: box.x, top: box.y }}
        spellCheck={false}
        autoComplete="off"
        wrap={inCell && style.wrap ? "soft" : "off"}
        onKeyDown={(e) => {
          if (composing.current) return;
          const native = e.nativeEvent;
          const handled = ctl.edit ? handleEditorKey(ctl, native) : handleGridKey(ctl, native);
          if (handled) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onInput={(e) => {
          const el = e.currentTarget;
          if (!ctl.edit) {
            if (composing.current) return;
            ctl.startTyping(el.value);
            return;
          }
          if (ctl.edit.source !== "cell") return;
          const inserted = (e.nativeEvent as InputEvent).inputType?.startsWith("insert") ?? false;
          ctl.updateEdit(el.value, el.selectionStart, el.selectionEnd, false, inserted);
        }}
        onSelect={(e) => {
          const el = e.currentTarget;
          if (ctl.edit?.source === "cell") ctl.setEditCaret(el.selectionStart, el.selectionEnd);
        }}
        onCompositionStart={() => {
          composing.current = true;
          if (!ctl.edit) ctl.startEdit("enter", "");
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          const el = e.currentTarget;
          if (ctl.edit) ctl.updateEdit(el.value, el.selectionStart, el.selectionEnd);
        }}
        onCopy={(e) => {
          if (ctl.edit) return;
          e.preventDefault();
          ctl.copy(false);
        }}
        onCut={(e) => {
          if (ctl.edit) return;
          e.preventDefault();
          ctl.copy(true);
        }}
        onPaste={(e) => {
          if (ctl.edit) return;
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          ctl.paste("all", text);
        }}
      />
      {inCell && <EditorAssist ctl={ctl} x={box.x - 1} y={box.y + height} />}
    </>
  );
}

/** Autocomplete list and function argument hint under the editor. */
export function EditorAssist({ ctl, x, y, fixed }: { ctl: WorkbookController; x: number; y: number; fixed?: boolean }) {
  const edit = useCtl(ctl, (c) => c.edit);
  if (!edit) return null;
  const style: CSSProperties = { left: x, top: y, position: fixed ? "fixed" : "absolute" };
  if (edit.suggest) {
    const current = edit.suggest.items[edit.suggest.index];
    return (
      <div className="autocomplete" style={style} onMouseDown={(e) => e.preventDefault()}>
        {edit.suggest.items.map((f, i) => (
          <div
            key={f.name}
            className={`ac-item ${i === edit.suggest!.index ? "active" : ""}`}
            onMouseEnter={() => {
              if (ctl.edit?.suggest) {
                ctl.edit = { ...ctl.edit, suggest: { ...ctl.edit.suggest, index: i } };
                ctl.emit();
              }
            }}
            onDoubleClick={() => ctl.acceptSuggestion(i)}
            onClick={() => ctl.acceptSuggestion(i)}
          >
            <span className="ac-fx">fx</span>
            {f.name}
          </div>
        ))}
        {current && <div className="ac-desc">{current.description}</div>}
      </div>
    );
  }
  const call = enclosingCall(edit.text, edit.caret);
  const doc = call ? functionDoc(call.name) : undefined;
  if (!call || !doc) return null;
  const { name, args } = syntaxParts(doc.syntax);
  const active = Math.min(call.arg, Math.max(0, args.length - 1));
  const repeating = args.length && args[args.length - 1] === "...";
  return (
    <div className="fn-hint" style={style} onMouseDown={(e) => e.preventDefault()}>
      <span className="fn-name">{name}</span>(
      {args.map((a, i) => (
        <span key={i}>
          {i > 0 && ", "}
          <span className={i === active || (repeating && call.arg >= args.length - 1 && i === args.length - 2) ? "fn-arg-active" : ""}>{a}</span>
        </span>
      ))}
      )
    </div>
  );
}
