import type { CellsChunk, CfExtraDto, Rect, SheetLayout, StyleDto } from "../../api/types";

export interface CellEntry {
  text: string;
  kind: number;
  style: StyleDto;
  extra: CfExtraDto | null;
}

export const DEFAULT_STYLE: StyleDto = { size: 11, hAlign: "general", vAlign: "bottom", numFmt: "general" };

const key = (r: number, c: number) => r * 16_385 + c;

/**
 * Cells of the loaded windows (one per visible pane), plus row/column level
 * styles from the sheet layout.
 */
export class CellCache {
  sheet = -1;
  wins: Rect[] = [];
  private map = new Map<number, CellEntry>();
  /** Columns with text per row (for text overflow checks). */
  private rows = new Map<number, number[]>();
  rowStyles = new Map<number, StyleDto>();
  colStyles: [number, number, StyleDto][] = [];
  defaultStyle: StyleDto = DEFAULT_STYLE;

  setLayout(layout: SheetLayout) {
    this.rowStyles = new Map(layout.rowStyles.map(([r, s]) => [r, layout.styles[s]]));
    this.colStyles = layout.colStyles.map(([a, b, s]) => [a, b, layout.styles[s]]);
    this.defaultStyle = layout.styles[0] ?? DEFAULT_STYLE;
  }

  load(chunks: CellsChunk[]) {
    this.map = new Map();
    this.rows = new Map();
    this.wins = [];
    for (const chunk of chunks) {
      this.sheet = chunk.sheet;
      this.wins.push({ r1: chunk.r1, c1: chunk.c1, r2: chunk.r2, c2: chunk.c2 });
      for (const [r, c, text, kind, s, extra] of chunk.cells) {
        const k = key(r, c);
        if (this.map.has(k)) continue;
        this.map.set(k, { text, kind, style: chunk.styles[s] ?? this.defaultStyle, extra });
        if (text !== "") {
          let list = this.rows.get(r);
          if (!list) this.rows.set(r, (list = []));
          list.push(c);
        }
      }
    }
    for (const list of this.rows.values()) list.sort((a, b) => a - b);
  }

  clear() {
    this.map = new Map();
    this.rows = new Map();
    this.wins = [];
  }

  covers(r: Rect): boolean {
    return this.wins.some((w) => r.r1 >= w.r1 && r.r2 <= w.r2 && r.c1 >= w.c1 && r.c2 <= w.c2);
  }

  get(r: number, c: number): CellEntry | undefined {
    return this.map.get(key(r, c));
  }

  /** Style for a cell including row/column level formats. */
  styleAt(r: number, c: number): StyleDto {
    const cell = this.map.get(key(r, c));
    if (cell) return cell.style;
    const rs = this.rowStyles.get(r);
    if (rs) return rs;
    for (const [a, b, s] of this.colStyles) if (c >= a && c <= b) return s;
    return this.defaultStyle;
  }

  hasValue(r: number, c: number): boolean {
    const cell = this.map.get(key(r, c));
    return !!cell && cell.text !== "";
  }

  /** Column of the next cell with text after c in row r (Infinity if none loaded). */
  nextFilled(r: number, c: number): number {
    const list = this.rows.get(r);
    if (!list) return Infinity;
    for (const x of list) if (x > c) return x;
    return Infinity;
  }

  prevFilled(r: number, c: number): number {
    const list = this.rows.get(r);
    if (!list) return -Infinity;
    for (let i = list.length - 1; i >= 0; i--) if (list[i] < c) return list[i];
    return -Infinity;
  }

  /** Cells with text in row r between c1 and c2. */
  rowCells(r: number): number[] {
    return this.rows.get(r) ?? [];
  }

  forEach(fn: (r: number, c: number, e: CellEntry) => void) {
    for (const [k, e] of this.map) {
      const r = Math.floor(k / 16_385);
      fn(r, k - r * 16_385, e);
    }
  }
}
