// Cell notes: shown on hover (or all at once with Review > Show All Notes).

import { useEffect, useState } from "react";
import { api, type Note } from "../api";
import type { WorkbookController } from "./controller";
import { useCtl } from "./hooks";

export function NotesLayer({ ctl, hover }: { ctl: WorkbookController; hover: { r: number; c: number } | null }) {
  const s = useCtl(ctl, (c) => ({
    version: c.layout?.version ?? 0,
    sheet: c.sheet,
    all: c.showAllNotes,
    count: c.layout?.notes.length ?? 0,
    sx: c.scroll.x,
    sy: c.scroll.y,
    zoom: c.zoom,
    vw: c.viewport.width,
    vh: c.viewport.height,
  }));
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    if (!s.count) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    api
      .notes(ctl.id, s.sheet)
      .then((n) => !cancelled && setNotes(n))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ctl, s.version, s.sheet, s.count]);

  const shown = s.all ? notes : notes.filter((n) => hover && n.row === hover.r && n.col === hover.c);
  if (!shown.length) return null;
  return (
    <div className="notes-layer">
      {shown.map((n) => {
        const cw = ctl.cols.size(n.col);
        const rh = ctl.rows.size(n.row);
        if (!cw || !rh) return null;
        const x = ctl.colX(n.col) + cw;
        const y = ctl.rowY(n.row);
        if (x > s.vw || y > s.vh || y + rh < ctl.headerH || x < ctl.headerW) return null;
        const left = Math.min(x + 12, s.vw - 214);
        return (
          <div key={`${n.row}:${n.col}`} className="note-box" style={{ left, top: Math.max(ctl.headerH, y - 4) }}>
            {n.author && <div className="note-author">{n.author}:</div>}
            <div className="note-text">{n.text}</div>
          </div>
        );
      })}
    </div>
  );
}
