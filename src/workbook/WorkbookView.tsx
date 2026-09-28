import { getCurrentWindow } from "@tauri-apps/api/window";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage, type WorkbookInfo } from "../api";
import { APP_NAME, useApp } from "../app/context";
import { CommandSearch, TitleBar, type SearchCommand } from "../app/TitleBar";
import { Backstage, type BackstagePage, type BookActions } from "../backstage/Backstage";
import { Icon } from "../components/Icon";
import { Menu } from "../components/Menu";
import { MOST_USED } from "../lib/functions";
import { WorkbookController } from "./controller";
import { DialogHost, type DialogState } from "./dialogs/Dialogs";
import { FormulaBar } from "./FormulaBar";
import { Grid, type GridContextMenu } from "./grid/Grid";
import { useCtl } from "./hooks";
import { cellContextMenu } from "./menus";
import { Ribbon } from "./ribbon/Ribbon";
import { SheetTabs } from "./SheetTabs";
import { StatusBar } from "./StatusBar";

function QuickAccess({ ctl }: { ctl: WorkbookController }) {
  const s = useCtl(ctl, (c) => ({ canUndo: c.info.canUndo || !!c.edit, canRedo: c.info.canRedo, dirty: c.info.dirty }));
  const [menu, setMenu] = useState<DOMRect | null>(null);
  return (
    <div className="qat">
      <button className="qat-btn" title="Save (Ctrl+S)" onClick={() => ctl.save()}>
        <Icon name="save" />
      </button>
      <div className="qat-split">
        <button className="qat-btn" title="Undo (Ctrl+Z)" disabled={!s.canUndo} onClick={() => ctl.undo()}>
          <Icon name="undo" />
        </button>
        <button className="qat-caret" disabled={!s.canUndo} tabIndex={-1}>
          <Icon name="chevronDown" size={8} />
        </button>
      </div>
      <div className="qat-split">
        <button className="qat-btn" title="Redo (Ctrl+Y)" disabled={!s.canRedo} onClick={() => ctl.redo()}>
          <Icon name="redo" />
        </button>
        <button className="qat-caret" disabled={!s.canRedo} tabIndex={-1}>
          <Icon name="chevronDown" size={8} />
        </button>
      </div>
      <button className="qat-btn" title="Customize Quick Access Toolbar" onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}>
        <Icon name="customize" />
      </button>
      {menu && (
        <Menu
          anchor={menu}
          onClose={() => setMenu(null)}
          items={[
            { header: "Customize Quick Access Toolbar" },
            { label: "New", icon: "newDoc", onClick: () => ctl.ui?.backstage("new-blank") },
            { label: "Open", icon: "open", onClick: () => ctl.ui?.backstage("open") },
            { label: "Save", icon: "save", checked: true, onClick: () => ctl.save() },
            { label: "Undo", checked: true, onClick: () => ctl.undo() },
            { label: "Redo", checked: true, onClick: () => ctl.redo() },
            { label: "Sort Ascending", icon: "sortAZ", onClick: () => ctl.sort(true) },
            { label: "Sort Descending", icon: "sortZA", onClick: () => ctl.sort(false) },
          ]}
        />
      )}
    </div>
  );
}

function commandList(ctl: WorkbookController): SearchCommand[] {
  const d = (name: string, props?: Record<string, unknown>) => () => ctl.ui?.dialog(name, props);
  return [
    { label: "Bold", hint: "Ctrl+B", icon: "bold", run: () => ctl.toggle("bold") },
    { label: "Italic", hint: "Ctrl+I", icon: "italic", run: () => ctl.toggle("italic") },
    { label: "Underline", hint: "Ctrl+U", icon: "underline", run: () => ctl.toggle("underline") },
    { label: "Merge & Center", icon: "mergeCenter", run: () => ctl.merge("center") },
    { label: "Unmerge Cells", icon: "unmerge", run: () => ctl.merge("unmerge") },
    { label: "Wrap Text", icon: "wrapText", run: () => ctl.style({ wrap: !(ctl.activeInfo?.style.wrap ?? false) }) },
    { label: "Format Cells", hint: "Ctrl+1", icon: "formatCells", run: d("formatCells") },
    { label: "Format as Table", icon: "table", run: () => ctl.formatAsTable() },
    { label: "Conditional Formatting: Greater Than", icon: "highlightRules", run: d("cfRule", { kind: "greaterThan" }) },
    { label: "Conditional Formatting: Duplicate Values", icon: "highlightRules", run: d("cfRule", { kind: "duplicate" }) },
    { label: "Manage Conditional Formatting Rules", icon: "manageRules", run: d("cfManage") },
    { label: "Insert Sheet Rows", icon: "insertRow", run: () => ctl.insertRows() },
    { label: "Insert Sheet Columns", icon: "insertCol", run: () => ctl.insertCols() },
    { label: "Delete Sheet Rows", icon: "deleteRow", run: () => ctl.deleteRows() },
    { label: "Delete Sheet Columns", icon: "deleteCol", run: () => ctl.deleteCols() },
    { label: "Insert Sheet", icon: "insertSheet", run: () => ctl.addSheet() },
    { label: "Rename Sheet", icon: "rename", run: d("renameSheet") },
    { label: "Sort A to Z", icon: "sortAZ", run: () => ctl.sort(true) },
    { label: "Sort Z to A", icon: "sortZA", run: () => ctl.sort(false) },
    { label: "Custom Sort", icon: "sortCustom", run: d("sort") },
    { label: "Remove Duplicates", icon: "removeDuplicates", run: d("removeDuplicates") },
    { label: "Find", hint: "Ctrl+F", icon: "find", run: d("find", { tab: "find" }) },
    { label: "Replace", hint: "Ctrl+H", icon: "replace", run: d("find", { tab: "replace" }) },
    { label: "Go To", hint: "Ctrl+G", icon: "goto", run: d("goto") },
    { label: "Insert Function", hint: "Shift+F3", icon: "fx", run: d("insertFunction") },
    { label: "Name Manager", icon: "tag", run: d("nameManager") },
    { label: "Define Name", icon: "tag", run: d("defineName") },
    { label: "AutoSum", hint: "Alt+=", icon: "autosum", run: () => ctl.autoSum() },
    { label: "Freeze Panes", icon: "freeze", run: () => ctl.freezePanes() },
    { label: "Freeze Top Row", icon: "freezeRow", run: () => ctl.freezeTopRow() },
    { label: "Unfreeze Panes", icon: "freeze", run: () => ctl.unfreeze() },
    { label: "Show Formulas", hint: "Ctrl+`", icon: "showFormulas", run: () => ctl.toggleShowFormulas() },
    { label: "Clear All", icon: "clear", run: () => ctl.clear("all") },
    { label: "Clear Formats", icon: "clear", run: () => ctl.clear("formats") },
    { label: "AutoFit Column Width", icon: "colWidth", run: () => ctl.autoFitCols() },
    { label: "AutoFit Row Height", icon: "rowHeight", run: () => ctl.autoFitRows() },
    { label: "Workbook Statistics", icon: "stats", run: d("stats") },
    { label: "Zoom", icon: "zoom", run: d("zoom") },
    { label: "Keyboard Shortcuts", icon: "keyboard", run: d("shortcuts") },
    { label: "Save As", hint: "F12", icon: "saveAs", run: () => ctl.ui?.saveAs() },
    { label: "Filter", hint: "Ctrl+Shift+L", icon: "filter", run: () => ctl.toggleFilter() },
    { label: "Clear Filter", icon: "clear", run: () => ctl.clearFilter() },
    { label: "Text to Columns", icon: "textToColumns", run: d("textToColumns") },
    { label: "PivotTable", icon: "pivot", run: d("pivot") },
    { label: "Insert Column Chart", hint: "Alt+F1", icon: "chartColumn", run: () => ctl.insertChart("column") },
    { label: "Insert Line Chart", icon: "chartLine", run: () => ctl.insertChart("line") },
    { label: "Insert Pie Chart", icon: "chartPie", run: () => ctl.insertChart("pie") },
    { label: "Insert Bar Chart", icon: "chartBar", run: () => ctl.insertChart("bar") },
    { label: "Insert Scatter Chart", icon: "chartScatter", run: () => ctl.insertChart("scatter") },
    { label: "New Note", hint: "Shift+F2", icon: "comment", run: d("note") },
    { label: "Show All Notes", icon: "comment", run: () => { ctl.showAllNotes = !ctl.showAllNotes; ctl.emit(); } },
    { label: "Insert Link", hint: "Ctrl+K", icon: "link", run: d("link") },
    { label: "Check Workbook (find errors)", icon: "health", run: d("healthCheck") },
    { label: "Print / Save as PDF", hint: "Ctrl+P", icon: "print", run: () => ctl.ui?.backstage("print") },
    { label: "Recover Unsaved Workbooks", icon: "recover", run: () => ctl.ui?.backstage("open") },
    { label: "Switch Windows", icon: "switchWindows", run: d("switchWindows") },
    ...MOST_USED.map((f) => ({ label: `Insert ${f} function`, icon: "fx", run: () => ctl.insertFunction(f) })),
  ];
}

export function WorkbookView({ info }: { info: WorkbookInfo }) {
  const app = useApp();
  const ctl = useMemo(() => new WorkbookController(info), [info.id]);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [backstage, setBackstage] = useState<BackstagePage | null>(null);
  const [ctxMenu, setCtxMenu] = useState<GridContextMenu | null>(null);
  const title = useCtl(ctl, (c) => c.info.title);
  const ribbonCollapsed = useCtl(ctl, (c) => c.ribbonCollapsed);

  const confirmClose = async (): Promise<boolean> => {
    if (ctl.edit) await ctl.commitEdit("none");
    if (!ctl.info.dirty) return true;
    const answer = await app.ask(
      APP_NAME,
      `Want to save your changes to '${ctl.info.title}'?`,
      [
        { label: "Save", value: "save", primary: true },
        { label: "Don't Save", value: "discard" },
        { label: "Cancel", value: "cancel" },
      ],
      "questionCircle",
    );
    if (answer === "save") return ctl.save();
    return answer === "discard";
  };

  const saveAs = async (): Promise<boolean> => {
    if (ctl.edit) await ctl.commitEdit("none");
    const current = ctl.info.path;
    const path = await saveDialog({
      title: "Save As",
      defaultPath: current ?? `${ctl.info.title}.xlsx`,
      filters: [
        { name: "Excel Workbook (*.xlsx)", extensions: ["xlsx"] },
        { name: "CSV (Comma delimited) (*.csv)", extensions: ["csv"] },
        { name: "Text (Tab delimited) (*.txt)", extensions: ["txt"] },
      ],
    });
    if (!path) return false;
    try {
      if (await api.formatIsLossy(path)) {
        const answer = await app.ask(
          APP_NAME,
          "Some features in your workbook might be lost if you save it as CSV / Text. Only the active sheet's values are saved.\n\nDo you want to keep using that format?",
          [
            { label: "Yes", value: "yes", primary: true },
            { label: "No", value: "no" },
          ],
          "warning",
        );
        if (answer !== "yes") return false;
      }
      const updated = await api.saveAs(ctl.id, path);
      await ctl.setInfo(updated);
      await app.refreshRecent();
      return true;
    } catch (e) {
      app.error(errorMessage(e));
      return false;
    }
  };

  const exportAs = async (ext: "csv" | "tsv" | "xlsx") => {
    const extension = ext === "tsv" ? "txt" : ext;
    const path = await saveDialog({
      title: "Export",
      defaultPath: `${ctl.info.title}.${extension}`,
      filters: [{ name: ext === "xlsx" ? "Excel Workbook" : ext === "csv" ? "CSV (Comma delimited)" : "Text (Tab delimited)", extensions: [extension] }],
    });
    if (!path) return;
    try {
      await api.exportCopy(ctl.id, path);
      setBackstage(null);
    } catch (e) {
      app.error(errorMessage(e));
    }
  };

  const closeWorkbook = async () => {
    if (!(await confirmClose())) return;
    await api.close(ctl.id).catch(() => {});
    app.showStart();
  };

  useEffect(() => {
    ctl.ui = {
      error: (m) => app.error(m),
      ask: (t, m, b) => app.ask(t, m, b),
      dialog: (name, props) => {
        if (name === "closeWorkbook") {
          closeWorkbook();
          return;
        }
        if (name === "print") {
          setBackstage("print");
          return;
        }
        setDialog({ name, props });
      },
      backstage: (page) => {
        if (page === "new-blank") app.newWorkbook();
        else if (page?.startsWith("template:")) app.newWorkbook(page.slice(9));
        else setBackstage((page as BackstagePage) ?? "home");
      },
      saveAs,
      focusGrid: () => editorRef.current?.focus({ preventScroll: true }),
    };
    ctl.init().catch((e) => app.error(errorMessage(e)));
    // Keep the grid focused on start
    requestAnimationFrame(() => editorRef.current?.focus({ preventScroll: true }));
    return () => {
      ctl.ui = null;
    };
  }, [ctl]);

  useEffect(() => {
    getCurrentWindow()
      .setTitle(`${title} - ${APP_NAME}`)
      .catch(() => {});
  }, [title]);

  // Window close button: ask to save
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let closing = false;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (closing) return;
        event.preventDefault();
        if (await confirmClose()) {
          closing = true;
          await api.close(ctl.id).catch(() => {});
          await getCurrentWindow().destroy();
        }
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [ctl]);

  // Ctrl+F1 toggles the ribbon, Ctrl+Shift+U the formula bar; other shortcuts when focus is outside the grid
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "F1") {
        e.preventDefault();
        ctl.ribbonCollapsed = !ctl.ribbonCollapsed;
        ctl.emit();
      } else if (e.ctrlKey && e.shiftKey && (e.key === "U" || e.key === "u")) {
        e.preventDefault();
        ctl.formulaBarExpanded = !ctl.formulaBarExpanded;
        ctl.emit();
      } else if (e.ctrlKey && (e.key === "s" || e.key === "S") && document.activeElement !== editorRef.current) {
        e.preventDefault();
        ctl.save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctl]);

  const bookActions: BookActions = {
    ctl,
    back: () => {
      setBackstage(null);
      requestAnimationFrame(() => editorRef.current?.focus({ preventScroll: true }));
    },
    save: () => ctl.save(),
    saveAs,
    exportAs,
    close: closeWorkbook,
  };

  return (
    <div className={`workbook-window ${ribbonCollapsed ? "ribbon-collapsed" : ""}`}>
      <TitleBar
        left={<QuickAccess ctl={ctl} />}
        title={`${title} - ${APP_NAME}`}
        center={
          <CommandSearch
            commands={() => commandList(ctl)}
            onFind={async (q) => {
              const found = await api.findAll(ctl.id, ctl.sheet, q, { matchCase: false, wholeCell: false, inFormulas: false, allSheets: true });
              if (!found.length) app.error(`We couldn't find "${q}".`);
              else {
                const f = found[0];
                if (f.sheet !== ctl.sheet) await ctl.switchSheet(f.sheet);
                ctl.select(f.row, f.col);
                editorRef.current?.focus();
              }
            }}
          />
        }
      />
      <Ribbon ctl={ctl} onFile={() => setBackstage("home")} />
      <FormulaBar ctl={ctl} />
      <div className="grid-area">
        <Grid ctl={ctl} editorRef={editorRef} onContextMenu={setCtxMenu} />
      </div>
      <SheetTabs ctl={ctl} />
      <StatusBar ctl={ctl} />
      {ctxMenu && (
        <Menu
          anchor={{ x: ctxMenu.x, y: ctxMenu.y }}
          items={cellContextMenu(ctl, ctxMenu.kind)}
          onClose={() => {
            setCtxMenu(null);
            editorRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
      <DialogHost
        ctl={ctl}
        state={dialog}
        onClose={() => {
          setDialog(null);
          requestAnimationFrame(() => editorRef.current?.focus({ preventScroll: true }));
        }}
      />
      {backstage && (
        <div className="backstage-overlay">
          <Backstage initial={backstage} book={bookActions} />
        </div>
      )}
    </div>
  );
}
