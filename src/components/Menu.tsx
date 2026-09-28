import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Popup, type Anchor } from "./Popup";
import { keyLabel } from "../lib/platform";

export interface MenuItem {
  id?: string;
  label?: string;
  icon?: string | ReactNode;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  header?: string;
  description?: string;
  onClick?: () => void;
  submenu?: MenuItem[];
  /** Arbitrary content shown as a flyout (colour pickers, galleries). */
  flyout?: (close: () => void) => ReactNode;
  /** Arbitrary inline content (e.g. a gallery row). */
  render?: (close: () => void) => ReactNode;
}

function ItemIcon({ icon, checked }: { icon?: string | ReactNode; checked?: boolean }) {
  if (checked && !icon) return <Icon name="check" />;
  if (typeof icon === "string") return <Icon name={icon} />;
  return <>{icon}</>;
}

export function MenuList({
  items,
  onClose,
  large,
  onBack,
}: {
  items: MenuItem[];
  onClose: () => void;
  large?: boolean;
  /** Closes this submenu (ArrowLeft) and returns to the parent menu. */
  onBack?: () => void;
}) {
  const [open, setOpen] = useState<{ index: number; rect: DOMRect } | null>(null);
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  const actionable = items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => !it.separator && !it.header && !it.render && !it.disabled);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open) {
        // A flyout (colour picker, gallery) has no key handling of its own
        if (items[open.index]?.flyout && ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter", "Tab"].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          if (e.key === "ArrowLeft") setOpen(null);
        }
        return;
      }
      // The innermost open menu owns navigation keys; nothing reaches the grid.
      if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter", "Tab", " "].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.key === "ArrowLeft" && onBack) {
        onBack();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        if (!actionable.length) return;
        const pos = actionable.findIndex((a) => a.i === active);
        const next =
          e.key === "ArrowDown"
            ? actionable[(pos + 1) % actionable.length]
            : actionable[(pos - 1 + actionable.length) % actionable.length];
        setActive(next.i);
      } else if (e.key === "Enter" && active >= 0) {
        e.preventDefault();
        e.stopPropagation();
        const it = items[active];
        if (it.submenu || it.flyout) {
          const el = listRef.current?.querySelector(`[data-index="${active}"]`);
          if (el) setOpen({ index: active, rect: el.getBoundingClientRect() });
        } else if (it.onClick) {
          onClose();
          it.onClick();
        }
      } else if (e.key === "ArrowRight" && active >= 0) {
        const it = items[active];
        if (it.submenu || it.flyout) {
          e.preventDefault();
          const el = listRef.current?.querySelector(`[data-index="${active}"]`);
          if (el) setOpen({ index: active, rect: el.getBoundingClientRect() });
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div className={`menu ${large ? "menu-large" : ""}`} ref={listRef} role="menu">
      {items.map((it, i) => {
        if (it.separator) return <div key={i} className="menu-sep" />;
        if (it.header) return <div key={i} className="menu-header">{it.header}</div>;
        if (it.render) return <div key={i} className="menu-custom">{it.render(onClose)}</div>;
        const hasSub = !!(it.submenu || it.flyout);
        return (
          <div
            key={i}
            data-index={i}
            role="menuitem"
            className={`menu-item${it.disabled ? " disabled" : ""}${active === i ? " active" : ""}${
              open?.index === i ? " open" : ""
            }${it.description ? " with-desc" : ""}`}
            onMouseEnter={(e) => {
              setActive(i);
              window.clearTimeout(timer.current);
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              timer.current = window.setTimeout(() => {
                setOpen(hasSub && !it.disabled ? { index: i, rect } : null);
              }, hasSub ? 120 : 200);
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              if (it.disabled) return;
              if (hasSub) {
                setOpen({ index: i, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() });
                return;
              }
              onClose();
              it.onClick?.();
            }}
          >
            <span className="menu-icon">
              <ItemIcon icon={it.icon} checked={it.checked} />
            </span>
            <span className="menu-label">
              {it.label}
              {it.description && <span className="menu-desc">{it.description}</span>}
            </span>
            {it.shortcut && <span className="menu-shortcut">{keyLabel(it.shortcut)}</span>}
            {hasSub && (
              <span className="menu-arrow">
                <Icon name="caretRight" size={12} />
              </span>
            )}
          </div>
        );
      })}
      {open && (items[open.index].submenu || items[open.index].flyout) && (
        <Popup anchor={open.rect} placement="right-start" onClose={() => setOpen(null)} closeOnOutside={false}>
          {items[open.index].submenu ? (
            <MenuList items={items[open.index].submenu!} onClose={onClose} onBack={() => setOpen(null)} />
          ) : (
            <div className="menu flyout">{items[open.index].flyout!(onClose)}</div>
          )}
        </Popup>
      )}
    </div>
  );
}

/** A dropdown/context menu anchored to a rect or a point. */
export function Menu({
  anchor,
  items,
  onClose,
  placement,
  large,
}: {
  anchor: Anchor;
  items: MenuItem[];
  onClose: () => void;
  placement?: "bottom-start" | "bottom-end" | "right-start";
  large?: boolean;
}) {
  return (
    <Popup anchor={anchor} onClose={onClose} placement={placement}>
      <MenuList items={items} onClose={onClose} large={large} />
    </Popup>
  );
}
