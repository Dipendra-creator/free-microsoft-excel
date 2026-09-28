// Lightweight formula scanning used by the editor: reference highlighting,
// point mode (click/arrow to insert references), function autocomplete and
// argument hints. Parsing/evaluation itself is done by the engine.

import type { Rect } from "../api/types";
import { parseRange } from "./a1";

export const REF_COLORS = ["#4472C4", "#C0504D", "#9BBB59", "#8064A2", "#F79646", "#4BACC6", "#E0529C", "#2E8B57"];

export interface RefToken {
  start: number;
  end: number;
  text: string;
  sheet: string | null;
  rect: Rect;
  color: string;
}

export interface Token {
  start: number;
  end: number;
  kind: "ref" | "func" | "string" | "number" | "op" | "text";
  color?: string;
}

const REF_RE =
  /(?:(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_.]*))!)?(\$?[A-Za-z]{1,3}\$?\d{1,7}(?::\$?[A-Za-z]{1,3}\$?\d{1,7})?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d{1,7}:\$?\d{1,7})(?![A-Za-z0-9_(])/y;

/** Splits a formula into tokens, skipping string literals. */
export function tokenize(formula: string): { tokens: Token[]; refs: RefToken[] } {
  const tokens: Token[] = [];
  const refs: RefToken[] = [];
  if (!formula.startsWith("=")) return { tokens, refs };
  const colorFor = new Map<string, string>();
  let i = 1;
  while (i < formula.length) {
    const ch = formula[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < formula.length) {
        if (formula[j] === '"') {
          if (formula[j + 1] === '"') {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      tokens.push({ start: i, end: Math.min(j + 1, formula.length), kind: "string" });
      i = j + 1;
      continue;
    }
    const prev = i > 0 ? formula[i - 1] : "=";
    const boundary = !/[A-Za-z0-9_.$]/.test(prev);
    if (boundary) {
      REF_RE.lastIndex = i;
      const m = REF_RE.exec(formula);
      if (m) {
        const text = m[0];
        const sheet = m[1] ? m[1].replace(/''/g, "'") : m[2] ?? null;
        const r = parseRange(m[3]);
        if (r) {
          const key = `${(sheet ?? "").toLowerCase()}!${m[3].replace(/\$/g, "").toUpperCase()}`;
          let color = colorFor.get(key);
          if (!color) {
            color = REF_COLORS[colorFor.size % REF_COLORS.length];
            colorFor.set(key, color);
          }
          refs.push({ start: i, end: i + text.length, text, sheet, rect: r, color });
          tokens.push({ start: i, end: i + text.length, kind: "ref", color });
          i += text.length;
          continue;
        }
      }
      const fn = /^[A-Za-z_][A-Za-z0-9_.]*(?=\()/.exec(formula.slice(i));
      if (fn) {
        tokens.push({ start: i, end: i + fn[0].length, kind: "func" });
        i += fn[0].length;
        continue;
      }
      const num = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(formula.slice(i));
      if (num) {
        tokens.push({ start: i, end: i + num[0].length, kind: "number" });
        i += num[0].length;
        continue;
      }
    }
    tokens.push({ start: i, end: i + 1, kind: /[-+*/^&=<>(),:;%]/.test(ch) ? "op" : "text" });
    i++;
  }
  return { tokens, refs };
}

/** True when a reference can be inserted at `caret` (point mode). */
export function canInsertRef(text: string, caret: number): boolean {
  if (!text.startsWith("=")) return false;
  // Inside a string literal?
  let quotes = 0;
  for (let i = 0; i < caret; i++) if (text[i] === '"') quotes++;
  if (quotes % 2 === 1) return false;
  const before = text.slice(0, caret).replace(/\s+$/, "");
  if (before.length === 0) return false;
  const last = before[before.length - 1];
  return /[=(,+\-*/^&<>:;%]/.test(last);
}

/** The reference token that ends exactly at the caret (to replace while pointing). */
export function refEndingAt(text: string, caret: number): RefToken | null {
  const { refs } = tokenize(text);
  return refs.find((r) => r.end === caret) ?? null;
}

/** Identifier being typed at the caret, for function autocomplete. */
export function identifierAt(text: string, caret: number): { start: number; word: string } | null {
  if (!text.startsWith("=")) return null;
  let quotes = 0;
  for (let i = 0; i < caret; i++) if (text[i] === '"') quotes++;
  if (quotes % 2 === 1) return null;
  const m = /[A-Za-z_][A-Za-z0-9_.]*$/.exec(text.slice(0, caret));
  if (!m) return null;
  const start = caret - m[0].length;
  const prev = start > 0 ? text[start - 1] : "";
  if (prev && !/[=(,+\-*/^&<>:;%\s]/.test(prev)) return null;
  // Don't suggest when it already looks like a cell reference (A1, AB12)
  if (/^[A-Za-z]{1,3}\d+$/.test(m[0])) return null;
  return { start, word: m[0] };
}

/** Function call enclosing the caret and the index of the current argument. */
export function enclosingCall(text: string, caret: number): { name: string; arg: number } | null {
  if (!text.startsWith("=")) return null;
  const stack: { name: string; arg: number }[] = [];
  let inString = false;
  for (let i = 1; i < caret; i++) {
    const ch = text[i];
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "(") {
      const m = /[A-Za-z_][A-Za-z0-9_.]*$/.exec(text.slice(0, i));
      stack.push({ name: m ? m[0].toUpperCase() : "", arg: 0 });
    } else if (ch === ")") {
      stack.pop();
    } else if (ch === "," && stack.length) {
      stack[stack.length - 1].arg++;
    }
  }
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name) return stack[i];
  return null;
}

/** Returns the formula text with parentheses auto-closed like Excel does on commit. */
export function autoClose(text: string): string {
  if (!text.startsWith("=")) return text;
  let depth = 0;
  let inString = false;
  for (const ch of text) {
    if (ch === '"') inString = !inString;
    else if (!inString && ch === "(") depth++;
    else if (!inString && ch === ")") depth--;
  }
  let out = text;
  if (inString) out += '"';
  if (depth > 0) out += ")".repeat(depth);
  return out;
}
