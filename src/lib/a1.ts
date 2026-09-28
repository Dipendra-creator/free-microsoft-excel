import type { Rect } from "../api/types";

export const LAST_ROW = 1_048_576;
export const LAST_COL = 16_384;

const colNameCache: string[] = [];

export function colName(c: number): string {
  const cached = colNameCache[c];
  if (cached) return cached;
  let n = c;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  colNameCache[c] = s;
  return s;
}

export function colNumber(name: string): number | null {
  if (!/^[A-Za-z]{1,3}$/.test(name)) return null;
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n >= 1 && n <= LAST_COL ? n : null;
}

export function cellName(r: number, c: number): string {
  return `${colName(c)}${r}`;
}

export function rect(r1: number, c1: number, r2 = r1, c2 = c1): Rect {
  return { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
}

export function rectName(r: Rect): string {
  if (r.r1 === 1 && r.r2 === LAST_ROW) {
    return `${colName(r.c1)}:${colName(r.c2)}`;
  }
  if (r.c1 === 1 && r.c2 === LAST_COL) {
    return `${r.r1}:${r.r2}`;
  }
  if (r.r1 === r.r2 && r.c1 === r.c2) return cellName(r.r1, r.c1);
  return `${cellName(r.r1, r.c1)}:${cellName(r.r2, r.c2)}`;
}

export function parseCell(text: string): { r: number; c: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(text.trim());
  if (!m) return null;
  const c = colNumber(m[1]);
  const r = Number(m[2]);
  if (!c || r < 1 || r > LAST_ROW) return null;
  return { r, c };
}

/** Parses "A1", "A1:B5", "A:C", "3:7". */
export function parseRange(text: string): Rect | null {
  const t = text.trim().replace(/\$/g, "");
  const parts = t.split(":");
  if (parts.length === 1) {
    const cell = parseCell(parts[0]);
    return cell ? rect(cell.r, cell.c) : null;
  }
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  const ca = parseCell(a);
  const cb = parseCell(b);
  if (ca && cb) return rect(ca.r, ca.c, cb.r, cb.c);
  const colA = colNumber(a);
  const colB = colNumber(b);
  if (colA && colB) return rect(1, colA, LAST_ROW, colB);
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const ra = Number(a);
    const rb = Number(b);
    if (ra >= 1 && rb >= 1 && ra <= LAST_ROW && rb <= LAST_ROW) return rect(ra, 1, rb, LAST_COL);
  }
  return null;
}

export function contains(r: Rect, row: number, col: number): boolean {
  return row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2;
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;
}

export function sameRect(a: Rect | null | undefined, b: Rect | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2;
}

export function isFullRows(r: Rect): boolean {
  return r.c1 === 1 && r.c2 === LAST_COL;
}

export function isFullCols(r: Rect): boolean {
  return r.r1 === 1 && r.r2 === LAST_ROW;
}

export function rectSize(r: Rect): number {
  return (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1);
}

/** Quotes a sheet name for use in a formula reference when required. */
export function sheetRef(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) && !parseCell(name) ? name : `'${name.replace(/'/g, "''")}'`;
}
