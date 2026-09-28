// Cell Styles and Format-as-Table galleries (Office look-alikes).

import type { BorderDto, StylePatch } from "../api/types";
import { tint } from "./colors";

export interface CellStyleDef {
  name: string;
  group: string;
  /** null means "Normal": clear formatting. */
  patch: StylePatch | null;
}

const reset: StylePatch = { bold: false, italic: false, underline: false, color: "", fill: "" };
const thin = (color: string): BorderDto => ({ style: "thin", color });
const box = (b: BorderDto): StylePatch => ({ borderTop: b, borderBottom: b, borderLeft: b, borderRight: b });
const noBox: StylePatch = box({ style: "none", color: "" });

const ACCENTS = ["#156082", "#E97132", "#196B24", "#0F9ED5", "#A02B93", "#4EA72E"];

export const CELL_STYLES: CellStyleDef[] = [
  { name: "Normal", group: "Good, Bad and Neutral", patch: null },
  { name: "Bad", group: "Good, Bad and Neutral", patch: { ...reset, ...noBox, color: "#9C0006", fill: "#FFC7CE" } },
  { name: "Good", group: "Good, Bad and Neutral", patch: { ...reset, ...noBox, color: "#006100", fill: "#C6EFCE" } },
  { name: "Neutral", group: "Good, Bad and Neutral", patch: { ...reset, ...noBox, color: "#9C5700", fill: "#FFEB9C" } },
  { name: "Calculation", group: "Data and Model", patch: { ...reset, ...box(thin("#7F7F7F")), bold: true, color: "#FA7D00", fill: "#F2F2F2" } },
  { name: "Check Cell", group: "Data and Model", patch: { ...reset, ...box({ style: "double", color: "#3F3F3F" }), bold: true, color: "#FFFFFF", fill: "#A5A5A5" } },
  { name: "Explanatory Text", group: "Data and Model", patch: { ...reset, ...noBox, italic: true, color: "#7F7F7F" } },
  { name: "Input", group: "Data and Model", patch: { ...reset, ...box(thin("#7F7F7F")), color: "#3F3F76", fill: "#FFCC99" } },
  {
    name: "Linked Cell",
    group: "Data and Model",
    patch: { ...reset, ...noBox, color: "#FA7D00", borderBottom: { style: "double", color: "#FF8001" } },
  },
  { name: "Note", group: "Data and Model", patch: { ...reset, ...box(thin("#B2B2B2")), fill: "#FFFFCC" } },
  { name: "Output", group: "Data and Model", patch: { ...reset, ...box(thin("#3F3F3F")), bold: true, color: "#3F3F3F", fill: "#F2F2F2" } },
  { name: "Warning Text", group: "Data and Model", patch: { ...reset, ...noBox, color: "#FF0000" } },
  { name: "Title", group: "Titles and Headings", patch: { ...reset, ...noBox, bold: true, fontSize: 18, color: "#0E2841" } },
  {
    name: "Heading 1",
    group: "Titles and Headings",
    patch: { ...reset, ...noBox, bold: true, fontSize: 15, color: "#0E2841", borderBottom: { style: "thick", color: "#156082" } },
  },
  {
    name: "Heading 2",
    group: "Titles and Headings",
    patch: { ...reset, ...noBox, bold: true, fontSize: 13, color: "#0E2841", borderBottom: { style: "thick", color: tint("#156082", 0.5) } },
  },
  {
    name: "Heading 3",
    group: "Titles and Headings",
    patch: { ...reset, ...noBox, bold: true, fontSize: 11, color: "#0E2841", borderBottom: { style: "medium", color: tint("#156082", 0.4) } },
  },
  { name: "Heading 4", group: "Titles and Headings", patch: { ...reset, ...noBox, bold: true, fontSize: 11, color: "#0E2841" } },
  {
    name: "Total",
    group: "Titles and Headings",
    patch: {
      ...reset,
      ...noBox,
      bold: true,
      borderTop: thin("#156082"),
      borderBottom: { style: "double", color: "#156082" },
    },
  },
  ...ACCENTS.flatMap((accent, i) =>
    [
      [`20% - Accent${i + 1}`, tint(accent, 0.8), "#000000"],
      [`40% - Accent${i + 1}`, tint(accent, 0.6), "#000000"],
      [`60% - Accent${i + 1}`, tint(accent, 0.4), "#FFFFFF"],
      [`Accent${i + 1}`, accent, "#FFFFFF"],
    ].map(([name, fill, color]) => ({
      name,
      group: "Themed Cell Styles",
      patch: { ...reset, ...noBox, fill, color } as StylePatch,
    })),
  ),
  { name: "Comma", group: "Number Format", patch: { numFmt: '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)' } },
  { name: "Comma [0]", group: "Number Format", patch: { numFmt: '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)' } },
  { name: "Percent", group: "Number Format", patch: { numFmt: "0%" } },
];

export const QUICK_STYLES = ["Normal", "Bad", "Good", "Neutral", "Calculation", "Check Cell"];

export function cellStyle(name: string): CellStyleDef | undefined {
  return CELL_STYLES.find((s) => s.name === name);
}

export interface TableStyleDef {
  id: string;
  group: "Light" | "Medium" | "Dark";
  accent: string;
  header: StylePatch;
  odd: StylePatch;
  even: StylePatch;
}

const TABLE_ACCENTS = ["#000000", ...ACCENTS];

function lightStyle(accent: string, i: number): TableStyleDef {
  const c = accent === "#000000" ? "#000000" : accent;
  const band = accent === "#000000" ? "#D9D9D9" : tint(accent, 0.8);
  return {
    id: `light-${i}`,
    group: "Light",
    accent,
    header: { bold: true, color: accent === "#000000" ? "#000000" : tint(accent, -0.25), fill: "", borderTop: thin(c), borderBottom: thin(c) },
    odd: { fill: band, color: "", bold: false },
    even: { fill: "", color: "", bold: false },
  };
}

function mediumStyle(accent: string, i: number): TableStyleDef {
  const head = accent === "#000000" ? "#000000" : accent;
  const band = accent === "#000000" ? "#D9D9D9" : tint(accent, 0.8);
  const line = accent === "#000000" ? "#666666" : tint(accent, 0.4);
  return {
    id: `medium-${i}`,
    group: "Medium",
    accent,
    header: { bold: true, color: "#FFFFFF", fill: head, borderInsideH: thin(line), borderBottom: thin(line) },
    odd: { fill: band, color: "", bold: false, borderBottom: thin(line), borderTop: thin(line), borderInsideH: thin(line) },
    even: { fill: "", color: "", bold: false, borderBottom: thin(line), borderTop: thin(line), borderInsideH: thin(line) },
  };
}

function darkStyle(accent: string, i: number): TableStyleDef {
  const base = accent === "#000000" ? "#404040" : tint(accent, -0.25);
  const band = accent === "#000000" ? "#737373" : accent;
  return {
    id: `dark-${i}`,
    group: "Dark",
    accent,
    header: { bold: true, color: "#FFFFFF", fill: "#000000", borderBottom: { style: "medium", color: "#FFFFFF" } },
    odd: { fill: band, color: "#FFFFFF", bold: false },
    even: { fill: base, color: "#FFFFFF", bold: false },
  };
}

export const TABLE_STYLES: TableStyleDef[] = [
  ...TABLE_ACCENTS.map(lightStyle),
  ...TABLE_ACCENTS.map(mediumStyle),
  ...TABLE_ACCENTS.map(darkStyle),
];

export const DEFAULT_TABLE_STYLE = "medium-1";

// Conditional formatting presets (Highlight Cells Rules)
export const CF_PRESETS = [
  { id: "lightRed", label: "Light Red Fill with Dark Red Text", format: { font: { color: "#9C0006" }, fill: { color: "#FFC7CE" } } },
  { id: "yellow", label: "Yellow Fill with Dark Yellow Text", format: { font: { color: "#9C5700" }, fill: { color: "#FFEB9C" } } },
  { id: "green", label: "Green Fill with Dark Green Text", format: { font: { color: "#006100" }, fill: { color: "#C6EFCE" } } },
  { id: "lightRedFill", label: "Light Red Fill", format: { fill: { color: "#FFC7CE" } } },
  { id: "redText", label: "Red Text", format: { font: { color: "#9C0006" } } },
  { id: "bold", label: "Bold Text", format: { font: { b: true } } },
];

export const DATA_BAR_COLORS = [
  { name: "Blue", color: "#638EC6" },
  { name: "Green", color: "#63C384" },
  { name: "Red", color: "#FF555A" },
  { name: "Orange", color: "#FFB628" },
  { name: "Light Blue", color: "#008AEF" },
  { name: "Purple", color: "#D6007B" },
];

export const COLOR_SCALES = [
  { name: "Green - Yellow - Red", colors: ["#63BE7B", "#FFEB84", "#F8696B"] },
  { name: "Red - Yellow - Green", colors: ["#F8696B", "#FFEB84", "#63BE7B"] },
  { name: "Green - White - Red", colors: ["#63BE7B", "#FCFCFF", "#F8696B"] },
  { name: "Red - White - Green", colors: ["#F8696B", "#FCFCFF", "#63BE7B"] },
  { name: "Blue - White - Red", colors: ["#5A8AC6", "#FCFCFF", "#F8696B"] },
  { name: "Red - White - Blue", colors: ["#F8696B", "#FCFCFF", "#5A8AC6"] },
  { name: "White - Red", colors: ["#FCFCFF", "#F8696B"] },
  { name: "Green - White", colors: ["#63BE7B", "#FCFCFF"] },
  { name: "Green - Yellow", colors: ["#63BE7B", "#FFEF9C"] },
  { name: "Yellow - Green", colors: ["#FFEF9C", "#63BE7B"] },
];

export const ICON_SETS = [
  {
    name: "3 Arrows",
    icons: [
      ["ArrowUp", "#63BE7B"],
      ["ArrowRight", "#FFEB84"],
      ["ArrowDown", "#F8696B"],
    ],
  },
  {
    name: "3 Arrows (Gray)",
    icons: [
      ["ArrowUp", "#808080"],
      ["ArrowRight", "#808080"],
      ["ArrowDown", "#808080"],
    ],
  },
  {
    name: "3 Traffic Lights",
    icons: [
      ["Circle", "#63BE7B"],
      ["Circle", "#FFC000"],
      ["Circle", "#F8696B"],
    ],
  },
  {
    name: "3 Flags",
    icons: [
      ["Flag", "#63BE7B"],
      ["Flag", "#FFC000"],
      ["Flag", "#F8696B"],
    ],
  },
  {
    name: "3 Symbols",
    icons: [
      ["Check", "#63BE7B"],
      ["Exclamation", "#FFC000"],
      ["Cross", "#F8696B"],
    ],
  },
  {
    name: "3 Triangles",
    icons: [
      ["TriangleUp", "#63BE7B"],
      ["FlatRectangle", "#FFC000"],
      ["TriangleDown", "#F8696B"],
    ],
  },
];
