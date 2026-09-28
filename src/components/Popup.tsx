import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type Anchor = DOMRect | { x: number; y: number };

function isRect(a: Anchor): a is DOMRect {
  return a instanceof DOMRect || "width" in a;
}

/**
 * A floating layer positioned next to an anchor element or a point.
 * Closes on outside mousedown, Escape and window blur.
 */
export function Popup({
  anchor,
  onClose,
  children,
  placement = "bottom-start",
  className,
  closeOnOutside = true,
  offset = 2,
}: {
  anchor: Anchor;
  onClose: () => void;
  children: ReactNode;
  placement?: "bottom-start" | "bottom-end" | "right-start" | "top-start";
  className?: string;
  closeOnOutside?: boolean;
  offset?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight?: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    let top: number;
    if (!isRect(anchor)) {
      left = anchor.x;
      top = anchor.y;
      if (left + w > vw - 4) left = Math.max(4, anchor.x - w);
      if (top + h > vh - 4) top = Math.max(4, anchor.y - h);
    } else if (placement === "right-start") {
      left = anchor.right + offset;
      top = anchor.top - 4;
      if (left + w > vw - 4) left = Math.max(4, anchor.left - w - offset);
      if (top + h > vh - 4) top = Math.max(4, vh - h - 4);
    } else if (placement === "top-start") {
      left = anchor.left;
      top = anchor.top - h - offset;
      if (top < 4) top = anchor.bottom + offset;
      if (left + w > vw - 4) left = Math.max(4, vw - w - 4);
    } else {
      left = placement === "bottom-end" ? anchor.right - w : anchor.left;
      top = anchor.bottom + offset;
      if (left + w > vw - 4) left = Math.max(4, vw - w - 4);
      if (left < 4) left = 4;
      if (top + h > vh - 4) {
        const above = anchor.top - h - offset;
        top = above >= 4 ? above : Math.max(4, vh - h - 4);
      }
    }
    const maxHeight = h > vh - 8 ? vh - 8 : undefined;
    setPos({ left, top, maxHeight });
  }, [anchor, placement, offset]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!closeOnOutside) return;
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      // Clicks inside nested popups (submenus) are handled by those popups
      if ((target as Element).closest?.(".popup")) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
    };
    const onBlur = () => closeRef.current();
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [closeOnOutside]);

  return createPortal(
    <div
      ref={ref}
      className={`popup ${className ?? ""}`}
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        maxHeight: pos?.maxHeight,
        overflowY: pos?.maxHeight ? "auto" : undefined,
        visibility: pos ? "visible" : "hidden",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}
