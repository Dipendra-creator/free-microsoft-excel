// Row / column geometry with sparse size overrides. Positions are in screen
// pixels at the current zoom; every size is rounded to whole pixels so grid
// lines stay crisp.

export class Axis {
  readonly count: number;
  readonly def: number;
  private keys: number[] = [];
  private sizes = new Map<number, number>();
  /** cum[i] = sum of (size - def) for keys[0..i] */
  private cum: number[] = [];

  constructor(defaultPx: number, overrides: Iterable<[number, number]>, count: number, zoom: number) {
    this.count = count;
    this.def = Math.max(1, Math.round(defaultPx * zoom));
    const map = new Map<number, number>();
    for (const [i, px] of overrides) {
      if (i < 1 || i > count) continue;
      const z = px <= 0 ? 0 : Math.max(1, Math.round(px * zoom));
      if (z !== this.def) map.set(i, z);
    }
    this.sizes = map;
    this.keys = [...map.keys()].sort((a, b) => a - b);
    let acc = 0;
    this.cum = this.keys.map((k) => (acc += map.get(k)! - this.def));
  }

  size(i: number): number {
    return this.sizes.get(i) ?? this.def;
  }

  isHidden(i: number): boolean {
    return this.sizes.get(i) === 0;
  }

  /** Number of override keys strictly less than i. */
  private below(i: number): number {
    let lo = 0;
    let hi = this.keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.keys[mid] < i) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Pixel offset of the start of index i (1-based). start(1) = 0. */
  start(i: number): number {
    const k = this.below(i);
    return (i - 1) * this.def + (k > 0 ? this.cum[k - 1] : 0);
  }

  end(i: number): number {
    return this.start(i) + this.size(i);
  }

  /** Index whose span contains pos (pos >= 0). Skips hidden entries. */
  indexAt(pos: number): number {
    if (pos <= 0) {
      let i = 1;
      while (i < this.count && this.size(i) === 0) i++;
      return i;
    }
    let lo = 1;
    let hi = this.count;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.start(mid) <= pos) lo = mid;
      else hi = mid - 1;
    }
    // lo is the last index starting at or before pos; skip zero-size ones backwards
    let i = lo;
    while (i > 1 && this.size(i) === 0) i--;
    return Math.min(i, this.count);
  }

  /** Next visible index after i (or i if none). */
  next(i: number, step = 1): number {
    let j = i;
    let moved = 0;
    while (moved < step && j < this.count) {
      j++;
      if (this.size(j) > 0) moved++;
    }
    return this.size(j) > 0 ? j : i;
  }

  prev(i: number, step = 1): number {
    let j = i;
    let moved = 0;
    while (moved < step && j > 1) {
      j--;
      if (this.size(j) > 0) moved++;
    }
    return this.size(j) > 0 ? j : i;
  }

  /** Indices of hidden entries between a and b (exclusive), for header markers. */
  hiddenBetween(a: number, b: number): boolean {
    for (let i = a + 1; i < b; i++) if (this.size(i) === 0) return true;
    return false;
  }
}
