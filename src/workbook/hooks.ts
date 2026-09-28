import { useEffect, useReducer, useRef } from "react";
import type { WorkbookController } from "./controller";

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

/** Re-renders when the selected slice of controller state changes. */
export function useCtl<T>(ctl: WorkbookController, select: (c: WorkbookController) => T): T {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const selectRef = useRef(select);
  selectRef.current = select;
  const last = useRef<T>(select(ctl));
  useEffect(() => {
    last.current = selectRef.current(ctl);
    return ctl.subscribe(() => {
      const next = selectRef.current(ctl);
      if (!shallowEqual(next, last.current)) {
        last.current = next;
        force();
      }
    });
  }, [ctl]);
  const value = select(ctl);
  last.current = value;
  return value;
}
