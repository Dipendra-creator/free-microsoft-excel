// Typed wrappers over the Tauri commands. This is the only module that talks
// to the backend, so a future remote/DB transport can be swapped in here.

import { invoke } from "@tauri-apps/api/core";
import type {
  AppInfo,
  BookWindow,
  ChartSpec,
  FillMode,
  FillReport,
  FilterValue,
  FlashFillResult,
  HealthReport,
  Note,
  PivotSpec,
  RangeValue,
  RecoveryItem,
  SeriesSpec,
  SplitOptions,
  VersionItem,
  CellInfo,
  CellsChunk,
  ConditionalFormat,
  DefinedName,
  FindOptions,
  FoundCell,
  OpenResult,
  PasteResult,
  PasteSpecialOptions,
  RecentItem,
  Rect,
  SelectionStats,
  Settings,
  SheetLayout,
  SortKey,
  StylePatch,
  TemplateMeta,
  TemplatePreview,
  WorkbookInfo,
  WorkbookStats,
} from "./types";

export * from "./types";

// Mutating commands run strictly one after another, in call order, so edits
// made in quick succession reach the engine in the same order.
let chain: Promise<unknown> = Promise.resolve();
function mut<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const p = chain.then(() => invoke<T>(cmd, args));
  chain = p.catch(() => undefined);
  return p;
}

type Book = string;

export const api = {
  // App
  appInfo: () => invoke<AppInfo>("app_info"),
  updateSettings: (settings: Settings) => mut<Settings>("update_settings", { settings }),
  listRecent: () => invoke<RecentItem[]>("list_recent"),
  pinRecent: (path: string, pinned: boolean) => mut<RecentItem[]>("pin_recent", { path, pinned }),
  removeRecent: (path: string) => mut<RecentItem[]>("remove_recent", { path }),
  clearRecent: () => mut<RecentItem[]>("clear_recent"),
  listTemplates: () => invoke<TemplateMeta[]>("list_templates"),
  templatePreview: (id: string) => invoke<TemplatePreview | null>("template_preview", { id }),
  revealInFolder: (path: string) => invoke<void>("reveal_in_folder", { path }),
  bindWindow: (book: Book | null) => mut<void>("bind_window", { book }),
  windowBook: () => invoke<string | null>("window_book"),
  focusBook: (book: Book) => invoke<boolean>("focus_book", { book }),
  openBookWindow: (book: Book, title: string) => mut<void>("open_book_window", { book, title }),

  // Workbook
  newWorkbook: (template?: string) => mut<WorkbookInfo>("workbook_new", { template: template ?? null }),
  openWorkbook: (path: string) => mut<OpenResult>("workbook_open", { path }),
  info: (book: Book) => invoke<WorkbookInfo>("workbook_info", { book }),
  save: (book: Book) => mut<WorkbookInfo>("workbook_save", { book }),
  saveAs: (book: Book, path: string) => mut<WorkbookInfo>("workbook_save_as", { book, path }),
  exportCopy: (book: Book, path: string) => mut<void>("workbook_export", { book, path }),
  close: (book: Book) => mut<void>("workbook_close", { book }),
  undo: (book: Book) => mut<WorkbookInfo>("workbook_undo", { book }),
  redo: (book: Book) => mut<WorkbookInfo>("workbook_redo", { book }),
  stats: (book: Book) => invoke<WorkbookStats>("workbook_stats", { book }),
  recalculate: (book: Book) => mut<WorkbookInfo>("workbook_recalculate", { book }),
  formatIsLossy: (path: string) => invoke<boolean>("format_is_lossy", { path }),

  // Sheets
  layout: (book: Book, sheet: number) => invoke<SheetLayout>("sheet_layout", { book, sheet }),
  activateSheet: (book: Book, sheet: number) => mut<void>("sheet_activate", { book, sheet }),
  addSheet: (book: Book, after: number | null) => mut<WorkbookInfo>("sheet_add", { book, after }),
  deleteSheet: (book: Book, sheet: number) => mut<WorkbookInfo>("sheet_delete", { book, sheet }),
  renameSheet: (book: Book, sheet: number, name: string) =>
    mut<WorkbookInfo>("sheet_rename", { book, sheet, name }),
  moveSheet: (book: Book, from: number, to: number) => mut<WorkbookInfo>("sheet_move", { book, from, to }),
  duplicateSheet: (book: Book, sheet: number) => mut<WorkbookInfo>("sheet_duplicate", { book, sheet }),
  setSheetHidden: (book: Book, sheet: number, hidden: boolean) =>
    mut<WorkbookInfo>("sheet_set_hidden", { book, sheet, hidden }),
  setSheetColor: (book: Book, sheet: number, color: string) =>
    mut<WorkbookInfo>("sheet_set_color", { book, sheet, color }),
  freeze: (book: Book, sheet: number, rows: number, cols: number) =>
    mut<WorkbookInfo>("sheet_freeze", { book, sheet, rows, cols }),
  gridLines: (book: Book, sheet: number, show: boolean) =>
    mut<WorkbookInfo>("sheet_grid_lines", { book, sheet, show }),

  // Cells
  cells: (book: Book, sheet: number, rect: Rect, showFormulas: boolean) =>
    invoke<CellsChunk>("cells_get", { book, sheet, rect, showFormulas }),
  cellInfo: (book: Book, sheet: number, row: number, col: number) =>
    invoke<CellInfo>("cell_info", { book, sheet, row, col }),
  setCell: (book: Book, sheet: number, row: number, col: number, input: string) =>
    mut<WorkbookInfo>("cell_set", { book, sheet, row, col, input }),
  setRange: (book: Book, sheet: number, rect: Rect, input: string) =>
    mut<WorkbookInfo>("range_set", { book, sheet, rect, input }),
  clear: (book: Book, sheet: number, rect: Rect, what: "all" | "contents" | "formats") =>
    mut<WorkbookInfo>("range_clear", { book, sheet, rect, what }),
  style: (book: Book, sheet: number, rect: Rect, patch: StylePatch) =>
    mut<WorkbookInfo>("range_style", { book, sheet, rect, patch }),
  borders: (book: Book, sheet: number, rect: Rect, kind: string, style: string, color: string) =>
    mut<WorkbookInfo>("range_borders", { book, sheet, rect, kind, style, color }),
  decimals: (book: Book, sheet: number, rect: Rect, row: number, col: number, delta: number) =>
    mut<WorkbookInfo>("range_decimals", { book, sheet, rect, row, col, delta }),
  tableStyle: (
    book: Book,
    sheet: number,
    rect: Rect,
    header: StylePatch,
    odd: StylePatch,
    even: StylePatch,
    hasHeader: boolean,
  ) => mut<WorkbookInfo>("range_table_style", { book, sheet, rect, header, odd, even, hasHeader }),
  merge: (book: Book, sheet: number, rect: Rect, mode: "center" | "across" | "merge" | "unmerge") =>
    mut<WorkbookInfo>("range_merge", { book, sheet, rect, mode }),
  insertRows: (book: Book, sheet: number, at: number, count: number) =>
    mut<WorkbookInfo>("rows_insert", { book, sheet, at, count }),
  deleteRows: (book: Book, sheet: number, at: number, count: number) =>
    mut<WorkbookInfo>("rows_delete", { book, sheet, at, count }),
  insertCols: (book: Book, sheet: number, at: number, count: number) =>
    mut<WorkbookInfo>("cols_insert", { book, sheet, at, count }),
  deleteCols: (book: Book, sheet: number, at: number, count: number) =>
    mut<WorkbookInfo>("cols_delete", { book, sheet, at, count }),
  colWidth: (book: Book, sheet: number, c1: number, c2: number, px: number) =>
    mut<WorkbookInfo>("cols_width", { book, sheet, c1, c2, px }),
  colWidths: (book: Book, sheet: number, widths: [number, number][]) =>
    mut<WorkbookInfo>("cols_widths", { book, sheet, widths }),
  rowHeight: (book: Book, sheet: number, r1: number, r2: number, px: number) =>
    mut<WorkbookInfo>("rows_height", { book, sheet, r1, r2, px }),
  rowHeights: (book: Book, sheet: number, heights: [number, number][]) =>
    mut<WorkbookInfo>("rows_heights", { book, sheet, heights }),
  setHidden: (book: Book, sheet: number, axis: "rows" | "cols", a: number, b: number, hidden: boolean) =>
    mut<WorkbookInfo>("axis_hidden", { book, sheet, axis, a, b, hidden }),

  // Clipboard
  copy: (book: Book, sheet: number, rect: Rect, cut: boolean) =>
    mut<string>("clipboard_copy", { book, sheet, rect, cut }),
  clearClipboard: () => mut<void>("clipboard_clear"),
  paste: (book: Book, sheet: number, rect: Rect, mode: string, text: string | null) =>
    mut<PasteResult>("clipboard_paste", { book, sheet, rect, mode, text }),
  pasteSpecial: (book: Book, sheet: number, rect: Rect, options: PasteSpecialOptions, text: string | null) =>
    mut<PasteResult>("clipboard_paste_special", { book, sheet, rect, options, text }),

  // Data
  currentRegion: (book: Book, sheet: number, row: number, col: number) =>
    invoke<Rect>("current_region", { book, sheet, row, col }),
  insertCells: (book: Book, sheet: number, rect: Rect, shift: "down" | "right") =>
    mut<WorkbookInfo>("range_insert_cells", { book, sheet, rect, shift }),
  deleteCells: (book: Book, sheet: number, rect: Rect, shift: "up" | "left") =>
    mut<WorkbookInfo>("range_delete_cells", { book, sheet, rect, shift }),
  fill: (book: Book, sheet: number, source: Rect, target: Rect, mode: FillMode = "auto") =>
    mut<[FillReport, WorkbookInfo]>("range_fill", { book, sheet, source, target, mode }),
  fillExtent: (book: Book, sheet: number, source: Rect) =>
    invoke<number | null>("range_fill_extent", { book, sheet, source }),
  fillSeries: (book: Book, sheet: number, rect: Rect, spec: SeriesSpec) =>
    mut<[Rect, WorkbookInfo]>("range_fill_series", { book, sheet, rect, spec }),
  flashFill: (book: Book, sheet: number, row: number, col: number) =>
    mut<[FlashFillResult, WorkbookInfo]>("range_flash_fill", { book, sheet, row, col }),
  sort: (book: Book, sheet: number, rect: Rect, keys: SortKey[], hasHeader: boolean) =>
    mut<WorkbookInfo>("range_sort", { book, sheet, rect, keys, hasHeader }),
  removeDuplicates: (book: Book, sheet: number, rect: Rect, columns: number[], hasHeader: boolean) =>
    mut<[number, number, WorkbookInfo]>("range_remove_duplicates", { book, sheet, rect, columns, hasHeader }),
  findAll: (book: Book, sheet: number, query: string, options: FindOptions) =>
    invoke<FoundCell[]>("find_all", { book, sheet, query, options }),
  replace: (
    book: Book,
    sheet: number,
    query: string,
    replacement: string,
    options: FindOptions,
    only: [number, number, number] | null,
  ) => mut<[number, WorkbookInfo]>("replace", { book, sheet, query, replacement, options, only }),
  selectionStats: (book: Book, sheet: number, rect: Rect) =>
    invoke<SelectionStats>("selection_stats", { book, sheet, rect }),
  navigateEdge: (book: Book, sheet: number, row: number, col: number, dir: "up" | "down" | "left" | "right") =>
    invoke<[number, number]>("navigate_edge", { book, sheet, row, col, dir }),
  cycleReference: (book: Book, text: string, start: number, end: number) =>
    invoke<[string, number, number]>("cycle_reference", { book, text, start, end }),
  formatPreview: (value: number, fmt: string) => invoke<string>("format_preview", { value, fmt }),

  // Names & conditional formatting
  names: (book: Book) => invoke<DefinedName[]>("names_list", { book }),
  addName: (book: Book, name: string, scope: number | null, formula: string) =>
    mut<WorkbookInfo>("name_add", { book, name, scope, formula }),
  updateName: (book: Book, name: string, scope: number | null, newName: string, newScope: number | null, formula: string) =>
    mut<WorkbookInfo>("name_update", { book, name, scope, newName, newScope, formula }),
  deleteName: (book: Book, name: string, scope: number | null) =>
    mut<WorkbookInfo>("name_delete", { book, name, scope }),
  cfList: (book: Book, sheet: number) => invoke<ConditionalFormat[]>("cf_list", { book, sheet }),
  cfAdd: (book: Book, sheet: number, range: string, rule: unknown) =>
    mut<WorkbookInfo>("cf_add", { book, sheet, range, rule }),
  cfDelete: (book: Book, sheet: number, index: number) => mut<WorkbookInfo>("cf_delete", { book, sheet, index }),
  cfClear: (book: Book, sheet: number, rect: Rect | null) => mut<WorkbookInfo>("cf_clear", { book, sheet, rect }),

  // Notes
  setNote: (book: Book, sheet: number, row: number, col: number, text: string) =>
    mut<WorkbookInfo>("note_set", { book, sheet, row, col, text }),
  deleteNotes: (book: Book, sheet: number, rect: Rect) => mut<WorkbookInfo>("notes_delete", { book, sheet, rect }),
  notes: (book: Book, sheet: number) => invoke<Note[]>("notes_list", { book, sheet }),

  // Charts
  saveChart: (book: Book, sheet: number, chart: ChartSpec) =>
    mut<[string, WorkbookInfo]>("chart_save", { book, sheet, chart }),
  deleteChart: (book: Book, sheet: number, id: string) => mut<WorkbookInfo>("chart_delete", { book, sheet, id }),
  rangeValues: (book: Book, sheet: number, rect: Rect) => invoke<RangeValue[][]>("range_values", { book, sheet, rect }),

  // AutoFilter
  filterToggle: (book: Book, sheet: number, rect: Rect) => mut<WorkbookInfo>("filter_toggle", { book, sheet, rect }),
  filterValues: (book: Book, sheet: number, col: number) => invoke<FilterValue[]>("filter_values", { book, sheet, col }),
  filterSet: (book: Book, sheet: number, col: number, values: string[] | null) =>
    mut<WorkbookInfo>("filter_set", { book, sheet, col, values }),
  filterClear: (book: Book, sheet: number) => mut<WorkbookInfo>("filter_clear", { book, sheet }),
  filterReapply: (book: Book, sheet: number) => mut<WorkbookInfo>("filter_reapply", { book, sheet }),
  filterSort: (book: Book, sheet: number, col: number, ascending: boolean) =>
    mut<WorkbookInfo>("filter_sort", { book, sheet, col, ascending }),

  // Data tools
  textToColumns: (book: Book, sheet: number, rect: Rect, options: SplitOptions) =>
    mut<[Rect, WorkbookInfo]>("text_to_columns", { book, sheet, rect, options }),
  createPivot: (book: Book, sheet: number, spec: PivotSpec) => mut<WorkbookInfo>("pivot_create", { book, sheet, spec }),
  healthCheck: (book: Book) => invoke<HealthReport>("health_check", { book }),

  // AutoRecover & versions
  recoveryList: () => invoke<RecoveryItem[]>("recovery_list"),
  recoveryOpen: (file: string) => mut<WorkbookInfo>("recovery_open", { file }),
  recoveryDiscard: (file: string) => mut<RecoveryItem[]>("recovery_discard", { file }),
  versions: (path: string) => invoke<VersionItem[]>("versions_list", { path }),
  versionOpen: (file: string, title: string) => mut<WorkbookInfo>("version_open", { file, title }),
  bookWindows: () => invoke<BookWindow[]>("list_book_windows"),
};

export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
