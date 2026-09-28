// The AutoFill Options button Excel shows at the corner of a filled range:
// switch the fill to Copy Cells, Fill Series, formatting only, and so on.

import { useState } from "react";
import type { FillMode } from "../api";
import { Icon } from "../components/Icon";
import { Menu, type MenuItem } from "../components/Menu";
import type { WorkbookController } from "./controller";
import { useCtl } from "./hooks";

export function FillOptionsButton({ ctl }: { ctl: WorkbookController }) {
  const s = useCtl(ctl, (c) => ({
    options: c.fillOptions,
    sheet: c.sheet,
    x: c.scroll.x,
    y: c.scroll.y,
    zoom: c.zoom,
    vw: c.viewport.width,
    vh: c.viewport.height,
  }));
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const o = s.options;
  if (!o || o.sheet !== s.sheet) return null;
  const box = ctl.rangeBox(o.target);
  const left = box.x + box.w + 2;
  const top = box.y + box.h + 2;
  if (left < ctl.originX || top < ctl.originY || left > s.vw - 22 || top > s.vh - 20) return null;

  const { mode, hasDates, canSeries } = o.report;
  const item = (label: string, m: FillMode, shortcut?: string): MenuItem => ({
    label,
    shortcut,
    checked: mode === m,
    onClick: () => ctl.changeFill(m),
  });
  const vertical = o.target.r1 !== o.source.r1 || o.target.r2 !== o.source.r2;
  const items: MenuItem[] = [
    item("Copy Cells", "copy"),
    ...(canSeries ? [item("Fill Series", "series")] : []),
    item("Fill Formatting Only", "formats"),
    item("Fill Without Formatting", "values"),
    ...(hasDates
      ? [{ separator: true }, item("Fill Days", "days"), item("Fill Weekdays", "weekdays"), item("Fill Months", "months"), item("Fill Years", "years")]
      : []),
    ...(vertical && o.source.c1 === o.source.c2
      ? [{ separator: true }, { label: "Flash Fill", icon: "flashFill", shortcut: "Ctrl+E", onClick: () => ctl.fillToFlashFill() }]
      : []),
  ];

  return (
    <>
      <button
        type="button"
        className={`fill-options-btn${menu ? " open" : ""}`}
        style={{ left, top }}
        title="Auto Fill Options"
        aria-label="Auto Fill Options"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => setMenu(menu ? null : (e.currentTarget as HTMLElement).getBoundingClientRect())}
      >
        <Icon name="autoFillOptions" />
        <Icon name="caretDown" size={10} />
      </button>
      {menu && (
        <Menu
          anchor={menu}
          items={items}
          onClose={() => {
            setMenu(null);
            ctl.ui?.focusGrid();
          }}
        />
      )}
    </>
  );
}
