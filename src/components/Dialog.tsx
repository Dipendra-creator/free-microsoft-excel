import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

/** Modal dialog styled like Office dialogs (draggable title bar). */
export function Dialog({
  title,
  children,
  onClose,
  footer,
  width = 420,
  onSubmit,
  className,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: number;
  onSubmit?: () => void;
  className?: string;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const boxRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    // Focus the first input
    const first = boxRef.current?.querySelector<HTMLElement>("input, select, textarea, button.primary");
    first?.focus();
    if (first instanceof HTMLInputElement) first.select();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && e.preventDefault()}>
      <form
        ref={boxRef}
        className={`dialog ${className ?? ""}`}
        style={{ width, transform: `translate(${offset.x}px, ${offset.y}px)` }}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
        onKeyDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
        }}
      >
        <div
          className="dialog-title"
          onMouseDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
            const move = (ev: MouseEvent) => {
              if (!drag.current) return;
              setOffset({ x: drag.current.ox + ev.clientX - drag.current.x, y: drag.current.oy + ev.clientY - drag.current.y });
            };
            const up = () => {
              drag.current = null;
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        >
          <span>{title}</span>
          <button type="button" className="dialog-close" onClick={onClose} title="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer !== undefined ? (
          footer && <div className="dialog-footer">{footer}</div>
        ) : (
          <div className="dialog-footer">
            <button type="submit" className="btn primary">
              OK
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}
      </form>
    </div>,
    document.body,
  );
}

/** Simple message / question box. */
export function MessageBox({
  title,
  message,
  icon = "infoCircle",
  buttons,
  onClose,
}: {
  title: string;
  message: ReactNode;
  icon?: string;
  buttons: { label: string; value: string; primary?: boolean }[];
  onClose: (value: string) => void;
}) {
  return (
    <Dialog
      title={title}
      onClose={() => onClose("cancel")}
      width={440}
      footer={
        <>
          {buttons.map((b) => (
            <button
              key={b.value}
              type={b.primary ? "submit" : "button"}
              className={`btn ${b.primary ? "primary" : ""}`}
              onClick={b.primary ? undefined : () => onClose(b.value)}
            >
              {b.label}
            </button>
          ))}
        </>
      }
      onSubmit={() => onClose(buttons.find((b) => b.primary)?.value ?? "ok")}
    >
      <div className="message-box">
        <Icon name={icon} size={32} />
        <div className="message-text">{message}</div>
      </div>
    </Dialog>
  );
}
