import { useRef } from "react";
import { Icon } from "../../components/Icon";
import type { WorkbookController } from "../controller";
import { useCtl } from "../hooks";

/** Excel-like scrollbar (arrows, track, thumb) bound to the controller scroll. */
export function Scrollbar({ ctl, orientation }: { ctl: WorkbookController; orientation: "vertical" | "horizontal" }) {
  const vertical = orientation === "vertical";
  const state = useCtl(ctl, (c) => {
    const ext = c.extent();
    return {
      pos: vertical ? c.scroll.y : c.scroll.x,
      content: vertical ? ext.h : ext.w,
      view: vertical ? c.mainH : c.mainW,
    };
  });
  const trackRef = useRef<HTMLDivElement>(null);
  const repeat = useRef<number | undefined>(undefined);

  const trackLen = () => {
    const el = trackRef.current;
    if (!el) return 1;
    return vertical ? el.clientHeight : el.clientWidth;
  };
  const len = trackLen();
  const content = Math.max(state.content, state.view + 1);
  const thumb = Math.max(18, Math.round((state.view / content) * len));
  const maxPos = Math.max(1, content - state.view);
  const thumbPos = Math.round((Math.min(state.pos, maxPos) / maxPos) * Math.max(0, len - thumb));

  const set = (value: number) => {
    if (vertical) ctl.scrollTo(ctl.scroll.x, value);
    else ctl.scrollTo(value, ctl.scroll.y);
  };
  const step = vertical ? ctl.rows.def * 3 : ctl.cols.def;

  const startRepeat = (fn: () => void) => {
    fn();
    window.clearInterval(repeat.current);
    const start = Date.now();
    repeat.current = window.setInterval(() => {
      if (Date.now() - start > 300) fn();
    }, 50);
    const stop = () => {
      window.clearInterval(repeat.current);
      window.removeEventListener("mouseup", stop);
    };
    window.addEventListener("mouseup", stop);
  };

  return (
    <div className={`scrollbar ${orientation}`} onMouseDown={(e) => e.preventDefault()}>
      <button
        className="sb-arrow"
        tabIndex={-1}
        onMouseDown={() => startRepeat(() => set((vertical ? ctl.scroll.y : ctl.scroll.x) - step))}
      >
        <Icon name={vertical ? "caretUp" : "caretLeft"} size={10} />
      </button>
      <div
        className="sb-track"
        ref={trackRef}
        onMouseDown={(e) => {
          if (e.target !== e.currentTarget) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const at = vertical ? e.clientY - rect.top : e.clientX - rect.left;
          const page = state.view * 0.9;
          startRepeat(() => {
            const cur = vertical ? ctl.scroll.y : ctl.scroll.x;
            const tp = (cur / Math.max(1, Math.max(content, state.view + 1) - state.view)) * (len - thumb);
            if (at < tp) set(cur - page);
            else if (at > tp + thumb) set(cur + page);
          });
        }}
      >
        <div
          className="sb-thumb"
          style={vertical ? { top: thumbPos, height: thumb } : { left: thumbPos, width: thumb }}
          onMouseDown={(e) => {
            e.stopPropagation();
            const start = vertical ? e.clientY : e.clientX;
            const startPos = state.pos;
            const scale = maxPos / Math.max(1, len - thumb);
            const move = (ev: MouseEvent) => {
              const delta = (vertical ? ev.clientY : ev.clientX) - start;
              set(Math.max(0, Math.min(maxPos, startPos + delta * scale)));
            };
            const up = () => {
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        />
      </div>
      <button
        className="sb-arrow"
        tabIndex={-1}
        onMouseDown={() => startRepeat(() => set((vertical ? ctl.scroll.y : ctl.scroll.x) + step))}
      >
        <Icon name={vertical ? "caretDown" : "caretRight"} size={10} />
      </button>
    </div>
  );
}
