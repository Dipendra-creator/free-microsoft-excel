import { useEffect, useRef, useState } from "react";
import { ColorPicker } from "../components/ColorPicker";
import { Icon } from "../components/Icon";
import { Menu, type MenuItem } from "../components/Menu";
import type { WorkbookController } from "./controller";
import { Scrollbar } from "./grid/Scrollbar";
import { useCtl } from "./hooks";

export function SheetTabs({ ctl }: { ctl: WorkbookController }) {
  const s = useCtl(ctl, (c) => ({ sheets: c.info.sheets, active: c.sheet }));
  const [renaming, setRenaming] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [split, setSplit] = useState(() => {
    try {
      return Number(localStorage.getItem("sheets.tabSplit")) || 0.55;
    } catch {
      return 0.55;
    }
  });
  const stripRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Keep the active tab visible
    const el = stripRef.current?.querySelector(".sheet-tab.active") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [s.active, s.sheets.length]);

  const visible = s.sheets.filter((sh) => !sh.hidden);

  const menuItems = (index: number): MenuItem[] => [
    { label: "Insert...", icon: "insertSheet", onClick: () => ctl.addSheet() },
    { label: "Delete", icon: "deleteSheet", onClick: () => ctl.deleteSheet(index) },
    { label: "Rename", icon: "rename", onClick: () => setRenaming(index) },
    { label: "Move or Copy...", icon: "duplicate", onClick: () => ctl.ui?.dialog("moveSheet", { index }) },
    { label: "Duplicate", onClick: () => ctl.duplicateSheet(index) },
    {
      label: "Tab Color",
      icon: "tabColor",
      flyout: (close) => (
        <ColorPicker
          noneLabel="No Color"
          onPick={(c) => {
            close();
            ctl.setSheetColor(index, c);
          }}
        />
      ),
    },
    { separator: true },
    { label: "Hide", icon: "hide", disabled: visible.length <= 1, onClick: () => ctl.setSheetHidden(index, true) },
    { label: "Unhide...", icon: "unhide", disabled: !s.sheets.some((x) => x.hidden), onClick: () => ctl.ui?.dialog("unhideSheet") },
  ];

  return (
    <div className="sheet-bar" ref={barRef} onContextMenu={(e) => e.preventDefault()}>
      <div className="sheet-nav">
        <button title="Previous sheet" onClick={() => stripRef.current?.scrollBy({ left: -120, behavior: "smooth" })}>
          <Icon name="caretLeft" size={12} />
        </button>
        <button title="Next sheet" onClick={() => stripRef.current?.scrollBy({ left: 120, behavior: "smooth" })}>
          <Icon name="caretRight" size={12} />
        </button>
      </div>
      <div className="sheet-tabs-area" style={{ flexBasis: `${split * 100}%` }}>
        <div className="sheet-strip" ref={stripRef}>
          {s.sheets.map((sheet) => {
            if (sheet.hidden) return null;
            const i = sheet.index;
            const active = i === s.active;
            return (
              <div
                key={sheet.sheetId}
                className={`sheet-tab ${active ? "active" : ""} ${dragOver === i ? "drop-target" : ""}`}
                style={sheet.color ? ({ "--tab-color": sheet.color } as React.CSSProperties) : undefined}
                onMouseDown={(e) => {
                  if (e.button !== 0 || renaming === i) return;
                  e.preventDefault();
                  ctl.switchSheet(i);
                  const startX = e.clientX;
                  let dragging = false;
                  let target: number | null = null;
                  const move = (ev: MouseEvent) => {
                    if (!dragging && Math.abs(ev.clientX - startX) > 6) dragging = true;
                    if (!dragging) return;
                    const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".sheet-tab") as HTMLElement | null;
                    const idx = el ? Number(el.dataset.index) : null;
                    target = idx;
                    setDragOver(idx);
                  };
                  const up = () => {
                    window.removeEventListener("mousemove", move);
                    window.removeEventListener("mouseup", up);
                    setDragOver(null);
                    if (dragging && target !== null && target !== i) ctl.moveSheet(i, target);
                    ctl.ui?.focusGrid();
                  };
                  window.addEventListener("mousemove", move);
                  window.addEventListener("mouseup", up);
                }}
                onDoubleClick={() => setRenaming(i)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  ctl.switchSheet(i);
                  setMenu({ x: e.clientX, y: e.clientY, index: i });
                }}
                data-index={i}
              >
                {renaming === i ? (
                  <input
                    className="sheet-rename"
                    autoFocus
                    defaultValue={sheet.name}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") {
                        (e.target as HTMLInputElement).value = sheet.name;
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      setRenaming(null);
                      if (name && name !== sheet.name) ctl.renameSheet(i, name);
                      ctl.ui?.focusGrid();
                    }}
                  />
                ) : (
                  <span>{sheet.name}</span>
                )}
              </div>
            );
          })}
        </div>
        <button className="sheet-add" title="New sheet (Shift+F11)" onClick={() => ctl.addSheet()}>
          <Icon name="plusCircle" size={16} />
        </button>
      </div>
      <div
        className="sheet-splitter"
        title="Drag to resize"
        onMouseDown={(e) => {
          e.preventDefault();
          const bar = barRef.current!.getBoundingClientRect();
          const move = (ev: MouseEvent) => {
            const v = Math.max(0.15, Math.min(0.85, (ev.clientX - bar.left - 60) / (bar.width - 60)));
            setSplit(v);
            try {
              localStorage.setItem("sheets.tabSplit", String(v));
            } catch {
              /* ignore */
            }
          };
          const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
          };
          window.addEventListener("mousemove", move);
          window.addEventListener("mouseup", up);
        }}
      >
        <Icon name="dotsV" size={12} />
      </div>
      <div className="hscroll-area">
        <Scrollbar ctl={ctl} orientation="horizontal" />
      </div>
      {menu && <Menu anchor={{ x: menu.x, y: menu.y }} items={menuItems(menu.index)} onClose={() => setMenu(null)} />}
    </div>
  );
}
