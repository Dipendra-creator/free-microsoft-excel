// Types mirroring the Rust DTOs (src-tauri/src/engine/dto.rs and commands).

export interface Rect {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface BorderDto {
  style: string;
  color: string;
}

export interface StyleDto {
  font?: string;
  size: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  fill?: string;
  hAlign: string;
  vAlign: string;
  wrap?: boolean;
  numFmt: string;
  borderTop?: BorderDto;
  borderRight?: BorderDto;
  borderBottom?: BorderDto;
  borderLeft?: BorderDto;
}

export interface DataBarDto {
  positiveColor: string;
  negativeColor: string;
  gradient: boolean;
  value: number;
  axis: number;
  showValue: boolean;
}

export interface IconDto {
  icon: string;
  color: string;
  showValue: boolean;
}

export interface RatingDto {
  icon: string;
  count: number;
  max: number;
  color: string;
  showValue: boolean;
}

export interface CfExtraDto {
  dataBar?: DataBarDto;
  icon?: IconDto;
  rating?: RatingDto;
}

/** [row, col, text, kind, styleIndex, extras] */
export type CellDto = [number, number, string, number, number, CfExtraDto | null];

export const Kind = {
  EMPTY: 0,
  NUMBER: 1,
  TEXT: 2,
  BOOLEAN: 3,
  ERROR: 4,
  FORMULA: 8,
} as const;

export interface CellsChunk {
  sheet: number;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  cells: CellDto[];
  styles: StyleDto[];
}

export interface SheetLayout {
  sheet: number;
  version: number;
  defaultRowPx: number;
  defaultColPx: number;
  rows: [number, number][];
  cols: [number, number, number][];
  merges: [number, number, number, number][];
  frozenRows: number;
  frozenCols: number;
  maxRow: number;
  maxCol: number;
  showGridLines: boolean;
  rowStyles: [number, number][];
  colStyles: [number, number, number][];
  styles: StyleDto[];
  /** [row, col] of cells with a note. */
  notes: [number, number][];
  filter?: FilterDto;
  charts: ChartSpec[];
}

export interface FilterDto {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  /** Columns with active criteria. */
  active: number[];
}

export type ChartKind = "column" | "bar" | "line" | "area" | "pie" | "doughnut" | "scatter";

export interface ChartSpec {
  id: string;
  kind: ChartKind;
  range: Rect;
  title: string;
  seriesInRows: boolean;
  legend: boolean;
  row: number;
  col: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
}

export interface Note {
  row: number;
  col: number;
  author: string;
  text: string;
}

export interface FilterValue {
  text: string;
  count: number;
  checked: boolean;
}

export interface SplitOptions {
  delimiters: string;
  consecutive: boolean;
  qualifier: string;
}

export interface PivotSpec {
  source: Rect;
  rowsCol: number;
  colsCol: number | null;
  valueCol: number | null;
  func: "sum" | "count" | "average" | "min" | "max";
}

export interface Issue {
  sheet: number;
  row: number;
  col: number;
  severity: "error" | "warning" | "info";
  kind: string;
  message: string;
}

export interface HealthReport {
  issues: Issue[];
  cells: number;
  formulas: number;
  truncated: boolean;
}

export interface RecoveryItem {
  file: string;
  title: string;
  originalPath: string | null;
  savedAt: number;
  kind: "crashed" | "unsaved";
  size: number;
}

export interface VersionItem {
  file: string;
  savedAt: number;
  size: number;
}

export interface BookWindow {
  label: string;
  book: string;
  title: string;
  dirty: boolean;
}

/** [number or null, displayed text] */
export type RangeValue = [number | null, string];

export interface SheetInfo {
  index: number;
  sheetId: number;
  name: string;
  hidden: boolean;
  color?: string;
}

export interface WorkbookInfo {
  id: string;
  title: string;
  path: string | null;
  format: string | null;
  dirty: boolean;
  untouched: boolean;
  sheets: SheetInfo[];
  activeSheet: number;
  canUndo: boolean;
  canRedo: boolean;
  layoutVersion: number;
  defaultFont: string;
  defaultFontSize: number;
}

export interface CellInfo {
  row: number;
  col: number;
  content: string;
  formatted: string;
  kind: number;
  style: StyleDto;
  merge?: [number, number, number, number];
  arrayAnchor?: [number, number];
  note?: Note;
}

export interface SelectionStats {
  count: number;
  numericCount: number;
  sum: number;
  min: number | null;
  max: number | null;
}

export interface StylePatch {
  fontName?: string;
  fontSize?: number;
  fontSizeDelta?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  fill?: string;
  hAlign?: string;
  vAlign?: string;
  wrap?: boolean;
  numFmt?: string;
  borderTop?: BorderDto;
  borderRight?: BorderDto;
  borderBottom?: BorderDto;
  borderLeft?: BorderDto;
  borderInsideH?: BorderDto;
  borderInsideV?: BorderDto;
}

export interface Settings {
  theme: "dark" | "light" | "system";
  defaultFont: string;
  defaultFontSize: number;
  sheetsInNewWorkbook: number;
  userName: string;
  showStartScreen: boolean;
  dayFirst: boolean | null;
  preserveLiterals: boolean;
  csvBom: boolean;
  autorecoverSeconds: number;
  keepVersions: number;
}

export interface AppInfo {
  name: string;
  version: string;
  userName: string;
  initials: string;
  settings: Settings;
  startupFile: string | null;
  dayFirst: boolean;
}

export interface RecentItem {
  path: string;
  name: string;
  folder: string;
  pinned: boolean;
  lastOpened: number;
  modified: number;
  exists: boolean;
}

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: "tutorial" | "template";
  banner?: [string, string];
  icon?: string;
  source: string;
}

export interface PreviewCell {
  r: number;
  c: number;
  t: string;
  fill?: string;
  color?: string;
  bold: boolean;
  size: number;
  align: string;
}

export interface TemplatePreview {
  cols: number[];
  rows: number[];
  cells: PreviewCell[];
  merges: [number, number, number, number][];
}

export interface OpenResult {
  info: WorkbookInfo;
  alreadyOpen: boolean;
}

export interface PasteResult {
  info: WorkbookInfo;
  rect: Rect;
  sourceBook: string | null;
}

export interface FindOptions {
  matchCase: boolean;
  wholeCell: boolean;
  inFormulas: boolean;
  allSheets: boolean;
}

export interface FoundCell {
  sheet: number;
  row: number;
  col: number;
  text: string;
}

export interface DefinedName {
  name: string;
  scope: number | null;
  formula: string;
}

export interface WorkbookStats {
  sheets: number;
  cellsWithData: number;
  formulas: number;
  mergedRanges: number;
  activeSheetCells: number;
  activeSheetFormulas: number;
  usedRange: string;
}

export interface SortKey {
  column: number;
  ascending: boolean;
}

export interface ConditionalFormat {
  index: number;
  range: string;
  rule: { type: string; [key: string]: unknown };
  priority: number;
  format: unknown;
}
