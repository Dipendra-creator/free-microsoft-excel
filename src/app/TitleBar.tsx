import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { Popup } from "../components/Popup";
import { useApp } from "./context";
import { isMac, keyLabel } from "../lib/platform";

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    win.isMaximized().then(setMaximized).catch(() => {});
    win
      .onResized(() => {
        win.isMaximized().then(setMaximized).catch(() => {});
      })
      .then((u) => (unlisten = u))
      .catch(() => {});
    return () => unlisten?.();
  }, []);
  const win = () => getCurrentWindow();
  return (
    <div className="window-controls">
      <button className="wc-btn" title="Minimize" onClick={() => win().minimize()}>
        <Icon name="minimize" />
      </button>
      <button className="wc-btn" title={maximized ? "Restore Down" : "Maximize"} onClick={() => win().toggleMaximize()}>
        <Icon name={maximized ? "restore" : "maximize"} />
      </button>
      <button className="wc-btn wc-close" title="Close" onClick={() => win().close()}>
        <Icon name="close" />
      </button>
    </div>
  );
}

export function Avatar() {
  const app = useApp();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <button className="avatar" title={app.settings.userName} onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}>
        {app.info.initials}
      </button>
      {anchor && (
        <Popup anchor={anchor} placement="bottom-end" onClose={() => setAnchor(null)}>
          <div className="menu flyout account-card">
            <div className="ac-head">
              <div className="avatar big">{app.info.initials}</div>
              <div>
                <b>{app.settings.userName}</b>
                <div className="muted">Local account</div>
              </div>
            </div>
            <p className="muted small">Sign-in and cloud sync will be available when the database layer is connected.</p>
            <button
              className="btn"
              onClick={() => {
                setAnchor(null);
                app.openOptions();
              }}
            >
              Options
            </button>
          </div>
        </Popup>
      )}
    </>
  );
}

export interface SearchCommand {
  label: string;
  hint?: string;
  icon?: string;
  run: () => void;
}

export function CommandSearch({ commands, onFind }: { commands: () => SearchCommand[]; onFind: (q: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<DOMRect | null>(null);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // e.code: on macOS Option+Q types "œ"
      if (e.altKey && (e.key === "q" || e.key === "Q" || e.code === "KeyQ")) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const query = q.trim().toLowerCase();
  const all = open ? commands() : [];
  const matches = query
    ? all.filter((c) => c.label.toLowerCase().includes(query) || c.hint?.toLowerCase().includes(query)).slice(0, 10)
    : all.slice(0, 8);
  const items: SearchCommand[] = [...matches];
  if (query) items.push({ label: `Find "${q.trim()}" in this sheet`, icon: "find", run: () => onFind(q.trim()) });

  const close = () => {
    setOpen(null);
    setQ("");
    inputRef.current?.blur();
  };

  return (
    <div className="tb-search" ref={wrap}>
      <Icon name="search" size={14} />
      <input
        ref={inputRef}
        placeholder="Search (Alt+Q)"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setIndex(0);
        }}
        onFocus={() => setOpen(wrap.current!.getBoundingClientRect())}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((index + 1) % Math.max(1, items.length));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((index - 1 + items.length) % Math.max(1, items.length));
          } else if (e.key === "Enter") {
            const item = items[index];
            close();
            item?.run();
          } else if (e.key === "Escape") close();
        }}
      />
      {open && (
        <Popup anchor={open} onClose={close}>
          <div className="menu search-results" style={{ width: open.width }}>
            <div className="menu-header">{query ? "Actions" : "Suggested actions"}</div>
            {items.map((c, i) => (
              <div
                key={c.label + i}
                className={`menu-item ${i === index ? "active" : ""}`}
                onMouseEnter={() => setIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  close();
                  c.run();
                }}
              >
                <span className="menu-icon">{c.icon && <Icon name={c.icon} />}</span>
                <span className="menu-label">{c.label}</span>
                {c.hint && <span className="menu-shortcut">{keyLabel(c.hint)}</span>}
              </div>
            ))}
            {items.length === 0 && <div className="menu-item disabled">No results</div>}
          </div>
        </Popup>
      )}
    </div>
  );
}

export function TitleBar({ left, center, title, right }: { left?: ReactNode; center?: ReactNode; title?: string; right?: ReactNode }) {
  return (
    <div className={`titlebar ${isMac ? "mac" : ""}`} data-tauri-drag-region>
      <div className="tb-left" data-tauri-drag-region>
        {/* macOS draws its traffic-light buttons here */}
        {isMac && <span className="tb-traffic" data-tauri-drag-region />}
        <span className="tb-logo" data-tauri-drag-region>
          <Icon name="logo" size={16} />
        </span>
        {left}
        {title && (
          <span className="tb-title" data-tauri-drag-region>
            {title}
          </span>
        )}
      </div>
      <div className="tb-center" data-tauri-drag-region>
        {center}
      </div>
      <div className="tb-right" data-tauri-drag-region>
        {right}
        <Avatar />
        {!isMac && <WindowControls />}
      </div>
    </div>
  );
}
