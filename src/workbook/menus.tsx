// Menu definitions shared by the ribbon, context menus and the command search.

import { api } from "../api";
import type { MenuItem } from "../components/Menu";
import { ColorPicker } from "../components/ColorPicker";
import { Icon } from "../components/Icon";
import { isFullCols, isFullRows, rectName } from "../lib/a1";
import { COLOR_SCALES, DATA_BAR_COLORS, ICON_SETS } from "../lib/galleries";
import type { WorkbookController } from "./controller";

export interface BorderPrefs {
  style: string;
  color: string;
}

export function bordersMenu(ctl: WorkbookController, prefs: BorderPrefs, setPrefs: (p: BorderPrefs) => void, onPick: (kind: string) => void): MenuItem[] {
  const b = (label: string, icon: string, kind: string, styleOverride?: string): MenuItem => ({
    label,
    icon,
    onClick: () => {
      onPick(kind);
      ctl.borders(kind, styleOverride ?? prefs.style, prefs.color);
    },
  });
  return [
    { header: "Borders" },
    b("Bottom Border", "borderBottom", "bottom"),
    b("Top Border", "borderTop", "top"),
    b("Left Border", "borderLeft", "left"),
    b("Right Border", "borderRight", "right"),
    { separator: true },
    b("No Border", "borderNone", "none"),
    b("All Borders", "borderAll", "all"),
    b("Outside Borders", "borderOutside", "outer"),
    b("Thick Outside Borders", "borderThickOutside", "thickOuter"),
    { separator: true },
    b("Bottom Double Border", "borderBottomDouble", "bottomDouble"),
    b("Thick Bottom Border", "borderThickBottom", "thickBottom"),
    b("Top and Bottom Border", "borderTopBottom", "topBottom"),
    b("Top and Thick Bottom Border", "borderTopThickBottom", "topThickBottom"),
    b("Top and Double Bottom Border", "borderTopDoubleBottom", "topDoubleBottom"),
    { header: "Draw Borders" },
    {
      label: "Line Color",
      icon: <span className="swatch-icon" style={{ background: prefs.color }} />,
      flyout: (close) => (
        <ColorPicker
          automaticLabel="Automatic"
          onPick={(c) => {
            setPrefs({ ...prefs, color: c || "#000000" });
            close();
          }}
        />
      ),
    },
    {
      label: "Line Style",
      icon: "borders",
      submenu: [
        ["thin", "Thin"],
        ["medium", "Medium"],
        ["thick", "Thick"],
        ["double", "Double"],
        ["dotted", "Dotted"],
        ["mediumdashed", "Dashed"],
        ["mediumdashdot", "Dash Dot"],
        ["mediumdashdotdot", "Dash Dot Dot"],
      ].map(([style, label]) => ({
        label,
        checked: prefs.style === style,
        icon: <span className={`line-sample line-${style}`} />,
        onClick: () => setPrefs({ ...prefs, style }),
      })),
    },
    { separator: true },
    { label: "More Borders...", icon: "formatCells", onClick: () => ctl.ui?.dialog("formatCells", { tab: "border" }) },
  ];
}

export function mergeMenu(ctl: WorkbookController): MenuItem[] {
  return [
    { label: "Merge & Center", icon: "mergeCenter", onClick: () => ctl.merge("center") },
    { label: "Merge Across", icon: "mergeAcross", onClick: () => ctl.merge("across") },
    { label: "Merge Cells", icon: "mergeCells", onClick: () => ctl.merge("merge") },
    { label: "Unmerge Cells", icon: "unmerge", onClick: () => ctl.merge("unmerge") },
  ];
}

export function insertMenu(ctl: WorkbookController): MenuItem[] {
  return [
    { label: "Insert Cells...", icon: "insertRow", onClick: () => ctl.ui?.dialog("insertCells") },
    { label: "Insert Sheet Rows", icon: "insertRow", onClick: () => ctl.insertRows() },
    { label: "Insert Sheet Columns", icon: "insertCol", onClick: () => ctl.insertCols() },
    { separator: true },
    { label: "Insert Sheet", icon: "insertSheet", onClick: () => ctl.addSheet() },
  ];
}

export function deleteMenu(ctl: WorkbookController): MenuItem[] {
  return [
    { label: "Delete Cells...", icon: "deleteRow", onClick: () => ctl.ui?.dialog("deleteCells") },
    { label: "Delete Sheet Rows", icon: "deleteRow", onClick: () => ctl.deleteRows() },
    { label: "Delete Sheet Columns", icon: "deleteCol", onClick: () => ctl.deleteCols() },
    { separator: true },
    { label: "Delete Sheet", icon: "deleteSheet", onClick: () => ctl.deleteSheet() },
  ];
}

export function hideUnhideMenu(ctl: WorkbookController): MenuItem[] {
  const hiddenSheets = ctl.info.sheets.filter((s) => s.hidden).length;
  return [
    { label: "Hide Rows", onClick: () => ctl.setHidden("rows", true), shortcut: "Ctrl+9" },
    { label: "Hide Columns", onClick: () => ctl.setHidden("cols", true), shortcut: "Ctrl+0" },
    { label: "Hide Sheet", onClick: () => ctl.setSheetHidden(ctl.sheet, true) },
    { separator: true },
    { label: "Unhide Rows", onClick: () => ctl.unhideAround("rows"), shortcut: "Ctrl+Shift+9" },
    { label: "Unhide Columns", onClick: () => ctl.unhideAround("cols") },
    { label: "Unhide Sheet...", disabled: hiddenSheets === 0, onClick: () => ctl.ui?.dialog("unhideSheet") },
  ];
}

export function formatMenu(ctl: WorkbookController): MenuItem[] {
  return [
    { header: "Cell Size" },
    { label: "Row Height...", icon: "rowHeight", onClick: () => ctl.ui?.dialog("rowHeight") },
    { label: "AutoFit Row Height", onClick: () => ctl.autoFitRows() },
    { label: "Column Width...", icon: "colWidth", onClick: () => ctl.ui?.dialog("colWidth") },
    { label: "AutoFit Column Width", onClick: () => ctl.autoFitCols() },
    { label: "Default Width...", onClick: () => ctl.ui?.dialog("colWidth", { all: true }) },
    { header: "Visibility" },
    { label: "Hide & Unhide", icon: "hide", submenu: hideUnhideMenu(ctl) },
    { header: "Organize Sheets" },
    { label: "Rename Sheet", icon: "rename", onClick: () => ctl.ui?.dialog("renameSheet") },
    { label: "Move or Copy Sheet...", icon: "duplicate", onClick: () => ctl.ui?.dialog("moveSheet") },
    {
      label: "Tab Color",
      icon: "tabColor",
      flyout: (close) => (
        <ColorPicker
          noneLabel="No Color"
          onPick={(c) => {
            close();
            ctl.setSheetColor(ctl.sheet, c);
          }}
        />
      ),
    },
    { header: "Protection" },
    { label: "Protect Sheet...", icon: "lock", disabled: true },
    { separator: true },
    { label: "Format Cells...", icon: "formatCells", shortcut: "Ctrl+1", onClick: () => ctl.ui?.dialog("formatCells") },
  ];
}

export function autoSumMenu(ctl: WorkbookController): MenuItem[] {
  return [
    { label: "Sum", icon: "autosum", onClick: () => ctl.autoSum("SUM") },
    { label: "Average", onClick: () => ctl.autoSum("AVERAGE") },
    { label: "Count Numbers", onClick: () => ctl.autoSum("COUNT") },
    { label: "Max", onClick: () => ctl.autoSum("MAX") },
    { label: "Min", onClick: () => ctl.autoSum("MIN") },
    { separator: true },
    { label: "More Functions...", icon: "fx", onClick: () => ctl.ui?.dialog("insertFunction") },
  ];
}

export function fillMenu(ctl: WorkbookController): MenuItem[] {
  return [
    { label: "Down", icon: "fill", shortcut: "Ctrl+D", onClick: () => ctl.fillDirection("down") },
    { label: "Right", shortcut: "Ctrl+R", onClick: () => ctl.fillDirection("right") },
    { label: "Up", onClick: () => ctl.fillDirection("up") },
    { label: "Left", onClick: () => ctl.fillDirection("left") },
    { separator: true },
    { label: "Series...", disabled: true },
    { label: "Flash Fill", disabled: true },
  ];
}

export function clearMenu(ctl: WorkbookController): MenuItem[] {
  return [
    { label: "Clear All", icon: "clear", onClick: () => ctl.clear("all") },
    { label: "Clear Formats", onClick: () => ctl.clear("formats") },
    { label: "Clear Contents", shortcut: "Delete", onClick: () => ctl.clear("contents") },
    { label: "Clear Comments and Notes", disabled: true },
    { label: "Clear Hyperlinks", disabled: true },
  ];
}

export function sortMenu(ctl: WorkbookController): MenuItem[] {
  return [
    { label: "Sort A to Z", icon: "sortAZ", onClick: () => ctl.sort(true) },
    { label: "Sort Z to A", icon: "sortZA", onClick: () => ctl.sort(false) },
    { label: "Custom Sort...", icon: "sortCustom", onClick: () => ctl.ui?.dialog("sort") },
    { separator: true },
    { label: "Filter", icon: "filter", disabled: true, description: "Coming soon" },
  ];
}

export function findMenu(ctl: WorkbookController): MenuItem[] {
  return [
    { label: "Find...", icon: "find", shortcut: "Ctrl+F", onClick: () => ctl.ui?.dialog("find", { tab: "find" }) },
    { label: "Replace...", icon: "replace", shortcut: "Ctrl+H", onClick: () => ctl.ui?.dialog("find", { tab: "replace" }) },
    { label: "Go To...", icon: "goto", shortcut: "Ctrl+G", onClick: () => ctl.ui?.dialog("goto") },
    { label: "Go To Special...", disabled: true },
  ];
}

export function pasteMenu(ctl: WorkbookController): MenuItem[] {
  return [
    { header: "Paste" },
    { label: "Paste", icon: "paste", shortcut: "Ctrl+V", onClick: () => ctl.paste("all") },
    { label: "Formulas", icon: "pasteFormulas", onClick: () => ctl.paste("formulas") },
    { header: "Paste Values" },
    { label: "Values", icon: "pasteValues", onClick: () => ctl.paste("values") },
    { header: "Other Paste Options" },
    { label: "Formatting", icon: "pasteFormats", onClick: () => ctl.paste("formats") },
  ];
}

// ------------------------------------------------------------------
// Conditional formatting
// ------------------------------------------------------------------

function cfRange(ctl: WorkbookController): string {
  const r = ctl.usedClamp(ctl.range);
  return rectName(r);
}

export function addRule(ctl: WorkbookController, rule: unknown) {
  return ctl.run(api.cfAdd(ctl.id, ctl.sheet, cfRange(ctl), rule));
}

export function conditionalMenu(ctl: WorkbookController): MenuItem[] {
  const d = (kind: string) => () => ctl.ui?.dialog("cfRule", { kind });
  const bars = (gradient: boolean): MenuItem[] =>
    DATA_BAR_COLORS.map((c) => ({
      label: `${c.name} Data Bar`,
      icon: (
        <span
          className="bar-sample"
          style={{ background: gradient ? `linear-gradient(90deg, ${c.color}, #fff)` : c.color, borderColor: c.color }}
        />
      ),
      onClick: () =>
        addRule(ctl, {
          type: "DataBar",
          min: null,
          max: null,
          positive_color: c.color,
          negative_color: "#FF0000",
          is_gradient: gradient,
          show_value: true,
        }),
    }));
  return [
    {
      label: "Highlight Cells Rules",
      icon: "highlightRules",
      submenu: [
        { label: "Greater Than...", onClick: d("greaterThan") },
        { label: "Less Than...", onClick: d("lessThan") },
        { label: "Between...", onClick: d("between") },
        { label: "Equal To...", onClick: d("equalTo") },
        { label: "Text that Contains...", onClick: d("textContains") },
        { label: "A Date Occurring...", onClick: d("dateOccurring") },
        { label: "Duplicate Values...", onClick: d("duplicate") },
      ],
    },
    {
      label: "Top/Bottom Rules",
      icon: "topBottom",
      submenu: [
        { label: "Top 10 Items...", onClick: d("top10") },
        { label: "Top 10%...", onClick: d("top10pct") },
        { label: "Bottom 10 Items...", onClick: d("bottom10") },
        { label: "Bottom 10%...", onClick: d("bottom10pct") },
        { label: "Above Average...", onClick: d("aboveAverage") },
        { label: "Below Average...", onClick: d("belowAverage") },
      ],
    },
    { separator: true },
    {
      label: "Data Bars",
      icon: "dataBars",
      submenu: [{ header: "Gradient Fill" }, ...bars(true), { header: "Solid Fill" }, ...bars(false)],
    },
    {
      label: "Color Scales",
      icon: "colorScales",
      submenu: COLOR_SCALES.map((s) => ({
        label: s.name,
        icon: <span className="scale-sample" style={{ background: `linear-gradient(90deg, ${s.colors.join(",")})` }} />,
        onClick: () => {
          const thresholds =
            s.colors.length === 3
              ? [
                  { cfvo: "Min", color: s.colors[2] },
                  { cfvo: { Percentile: 50 }, color: s.colors[1] },
                  { cfvo: "Max", color: s.colors[0] },
                ]
              : [
                  { cfvo: "Min", color: s.colors[1] },
                  { cfvo: "Max", color: s.colors[0] },
                ];
          addRule(ctl, { type: "ColorScale", thresholds });
        },
      })),
    },
    {
      label: "Icon Sets",
      icon: "iconSets",
      submenu: ICON_SETS.map((set) => ({
        label: set.name,
        icon: (
          <span className="iconset-sample">
            {set.icons.map(([, color], i) => (
              <span key={i} style={{ background: color }} />
            ))}
          </span>
        ),
        onClick: () => {
          const icons = [...set.icons].reverse();
          const cfvos = ["Min", { Percent: 33 }, { Percent: 67 }];
          addRule(ctl, {
            type: "IconSet",
            thresholds: icons.map(([icon, color], i) => ({ icon, color, cfvo: cfvos[i], is_strict: false })),
            show_value: true,
          });
        },
      })),
    },
    { separator: true },
    { label: "New Rule...", icon: "newRule", onClick: d("greaterThan") },
    {
      label: "Clear Rules",
      icon: "clearRules",
      submenu: [
        {
          label: "Clear Rules from Selected Cells",
          onClick: () => ctl.run(api.cfClear(ctl.id, ctl.sheet, ctl.usedClamp(ctl.range))),
        },
        {
          label: "Clear Rules from Entire Sheet",
          onClick: () => ctl.run(api.cfClear(ctl.id, ctl.sheet, null)),
        },
      ],
    },
    { label: "Manage Rules...", icon: "manageRules", onClick: () => ctl.ui?.dialog("cfManage") },
  ];
}

// ------------------------------------------------------------------
// Context menus
// ------------------------------------------------------------------

export function cellContextMenu(ctl: WorkbookController, kind: "cell" | "colHeader" | "rowHeader"): MenuItem[] {
  const range = ctl.range;
  const cols = isFullCols(range);
  const rows = isFullRows(range);
  const items: MenuItem[] = [
    { label: "Cut", icon: "cut", shortcut: "Ctrl+X", onClick: () => ctl.copy(true) },
    { label: "Copy", icon: "copy", shortcut: "Ctrl+C", onClick: () => ctl.copy(false) },
    {
      label: "Paste Options:",
      render: (close) => (
        <div className="paste-options">
          <span className="menu-icon">
            <Icon name="paste" />
          </span>
          <span className="menu-label">Paste Options:</span>
          <div className="paste-option-row">
            {[
              ["paste", "all", "Paste (P)"],
              ["pasteValues", "values", "Values (V)"],
              ["pasteFormulas", "formulas", "Formulas (F)"],
              ["pasteFormats", "formats", "Formatting (R)"],
            ].map(([icon, mode, title]) => (
              <button
                key={mode}
                title={title}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  close();
                  ctl.paste(mode as "all");
                }}
              >
                <Icon name={icon} />
              </button>
            ))}
          </div>
        </div>
      ),
    },
    { separator: true },
  ];
  if (kind === "colHeader" || cols) {
    items.push(
      { label: "Insert", onClick: () => ctl.insertCols() },
      { label: "Delete", onClick: () => ctl.deleteCols() },
      { label: "Clear Contents", onClick: () => ctl.clear("contents") },
      { separator: true },
      { label: "Format Cells...", icon: "formatCells", onClick: () => ctl.ui?.dialog("formatCells") },
      { label: "Column Width...", onClick: () => ctl.ui?.dialog("colWidth") },
      { label: "Hide", onClick: () => ctl.setHidden("cols", true) },
      { label: "Unhide", onClick: () => ctl.unhideAround("cols") },
    );
    return items;
  }
  if (kind === "rowHeader" || rows) {
    items.push(
      { label: "Insert", onClick: () => ctl.insertRows() },
      { label: "Delete", onClick: () => ctl.deleteRows() },
      { label: "Clear Contents", onClick: () => ctl.clear("contents") },
      { separator: true },
      { label: "Format Cells...", icon: "formatCells", onClick: () => ctl.ui?.dialog("formatCells") },
      { label: "Row Height...", onClick: () => ctl.ui?.dialog("rowHeight") },
      { label: "Hide", onClick: () => ctl.setHidden("rows", true) },
      { label: "Unhide", onClick: () => ctl.unhideAround("rows") },
    );
    return items;
  }
  items.push(
    { label: "Insert...", onClick: () => ctl.ui?.dialog("insertCells") },
    { label: "Delete...", onClick: () => ctl.ui?.dialog("deleteCells") },
    { label: "Clear Contents", onClick: () => ctl.clear("contents") },
    { separator: true },
    {
      label: "Sort",
      icon: "sortCustom",
      submenu: [
        { label: "Sort A to Z", icon: "sortAZ", onClick: () => ctl.sort(true) },
        { label: "Sort Z to A", icon: "sortZA", onClick: () => ctl.sort(false) },
        { separator: true },
        { label: "Custom Sort...", icon: "sortCustom", onClick: () => ctl.ui?.dialog("sort") },
      ],
    },
    { separator: true },
    { label: "Format Cells...", icon: "formatCells", shortcut: "Ctrl+1", onClick: () => ctl.ui?.dialog("formatCells") },
    { label: "Define Name...", icon: "tag", onClick: () => ctl.ui?.dialog("defineName") },
    { separator: true },
    { label: "Merge & Center", icon: "mergeCenter", onClick: () => ctl.merge(ctl.isMerged() ? "unmerge" : "center") },
  );
  return items;
}
