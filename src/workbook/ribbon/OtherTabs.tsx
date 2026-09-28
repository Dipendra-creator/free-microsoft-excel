import type { MenuItem } from "../../components/Menu";
import { CATEGORIES, FUNCTIONS, MOST_USED } from "../../lib/functions";
import { isFullCols, isFullRows } from "../../lib/a1";
import type { WorkbookController } from "../controller";
import { useCtl } from "../hooks";
import { autoSumMenu, sortMenu } from "../menus";
import { BigButton, CheckItem, RibbonGroup, SmallButton, SplitButton, Stack } from "./controls";

const soon = "Coming soon";

function fnMenu(ctl: WorkbookController, category: string): MenuItem[] {
  return FUNCTIONS.filter((f) => f.category === category).map((f) => ({
    label: f.name,
    onClick: () => ctl.insertFunction(f.name),
  }));
}

export function InsertTab({ ctl }: { ctl: WorkbookController }) {
  return (
    <>
      <RibbonGroup label="Tables">
        <BigButton icon="pivot" label={"PivotTable"} disabled title={soon} />
        <BigButton icon="table" label="Table" onClick={() => ctl.formatAsTable()} title="Format the selected range as a table (Ctrl+T)" />
      </RibbonGroup>
      <RibbonGroup label="Illustrations">
        <BigButton icon="pictures" label="Pictures" disabled title={soon} />
      </RibbonGroup>
      <RibbonGroup label="Charts">
        <BigButton icon="charts" label={"Recommended\nCharts"} disabled title={soon} />
      </RibbonGroup>
      <RibbonGroup label="Links">
        <BigButton icon="link" label="Link" disabled title={soon} />
      </RibbonGroup>
      <RibbonGroup label="Comments">
        <BigButton icon="comment" label="Comment" disabled title={soon} />
      </RibbonGroup>
      <RibbonGroup label="Text">
        <BigButton icon="textbox" label={"Text\nBox"} disabled title={soon} />
        <BigButton icon="dateTime" label={"Date &\nTime"} dropdown={[
          { label: "Insert Today's Date", shortcut: "Ctrl+;", onClick: () => ctl.insertDate() },
          { label: "Insert Current Time", shortcut: "Ctrl+Shift+;", onClick: () => ctl.insertTime() },
          { label: "=TODAY()", onClick: () => ctl.insertText("=TODAY()") },
          { label: "=NOW()", onClick: () => ctl.insertText("=NOW()") },
        ]} />
      </RibbonGroup>
      <RibbonGroup label="Symbols">
        <BigButton icon="fx" label="Equation" onClick={() => ctl.ui?.dialog("insertFunction")} title="Insert Function" />
        <BigButton icon="symbol" label="Symbol" onClick={() => ctl.ui?.dialog("symbol")} />
      </RibbonGroup>
    </>
  );
}

export function PageLayoutTab({ ctl }: { ctl: WorkbookController }) {
  const s = useCtl(ctl, (c) => ({ grid: c.layout?.showGridLines !== false, headings: c.showHeadings }));
  return (
    <>
      <RibbonGroup label="Themes">
        <BigButton icon="themes" label="Themes" disabled title={soon} />
      </RibbonGroup>
      <RibbonGroup label="Page Setup">
        <BigButton icon="margins" label="Margins" disabled title={soon} />
        <BigButton icon="orientationPage" label="Orientation" disabled title={soon} />
        <BigButton icon="size" label="Size" disabled title={soon} />
        <BigButton icon="print" label={"Print\nArea"} disabled title={soon} />
      </RibbonGroup>
      <RibbonGroup label="Sheet Options">
        <div className="sheet-options">
          <div className="so-col">
            <div className="so-title">Gridlines</div>
            <CheckItem label="View" checked={s.grid} onChange={(v) => ctl.setGridLines(v)} />
            <CheckItem label="Print" checked={false} disabled onChange={() => {}} />
          </div>
          <div className="so-col">
            <div className="so-title">Headings</div>
            <CheckItem
              label="View"
              checked={s.headings}
              onChange={(v) => {
                ctl.showHeadings = v;
                ctl.emit();
              }}
            />
            <CheckItem label="Print" checked={false} disabled onChange={() => {}} />
          </div>
        </div>
      </RibbonGroup>
    </>
  );
}

export function FormulasTab({ ctl }: { ctl: WorkbookController }) {
  const showFormulas = useCtl(ctl, (c) => c.showFormulas);
  const more: MenuItem[] = ["Statistical", "Engineering", "Information", "Compatibility", "Database"].map((c) => ({
    label: c,
    submenu: fnMenu(ctl, c),
  }));
  return (
    <>
      <RibbonGroup label="Function Library">
        <BigButton icon="fx" label={"Insert\nFunction"} onClick={() => ctl.ui?.dialog("insertFunction")} title="Insert Function (Shift+F3)" />
        <BigButton icon="autosum" label="AutoSum" dropdown={autoSumMenu(ctl)} />
        <BigButton icon="book" label={"Recently\nUsed"} dropdown={MOST_USED.map((n) => ({ label: n, onClick: () => ctl.insertFunction(n) }))} />
        <BigButton icon="book" label="Financial" dropdown={fnMenu(ctl, "Financial")} />
        <BigButton icon="book" label="Logical" dropdown={fnMenu(ctl, "Logical")} />
        <BigButton icon="book" label="Text" dropdown={fnMenu(ctl, "Text")} />
        <BigButton icon="book" label={"Date &\nTime"} dropdown={fnMenu(ctl, "Date & Time")} />
        <BigButton icon="book" label={"Lookup &\nReference"} dropdown={fnMenu(ctl, "Lookup & Reference")} />
        <BigButton icon="book" label={"Math &\nTrig"} dropdown={fnMenu(ctl, "Math & Trig")} />
        <BigButton icon="book" label={"More\nFunctions"} dropdown={more} />
      </RibbonGroup>
      <RibbonGroup label="Defined Names">
        <BigButton icon="nameManager" label={"Name\nManager"} onClick={() => ctl.ui?.dialog("nameManager")} />
        <Stack>
          <SmallButton icon="tag" label="Define Name" onClick={() => ctl.ui?.dialog("defineName")} />
          <SmallButton icon="fx" label="Use in Formula" onClick={() => ctl.ui?.dialog("nameManager")} />
        </Stack>
      </RibbonGroup>
      <RibbonGroup label="Formula Auditing">
        <Stack>
          <SmallButton icon="showFormulas" label="Show Formulas" active={showFormulas} onClick={() => ctl.toggleShowFormulas()} />
        </Stack>
      </RibbonGroup>
      <RibbonGroup label="Calculation">
        <BigButton icon="calculator" label={"Calculate\nNow"} onClick={() => ctl.recalculate()} title="Calculate Now (F9)" />
      </RibbonGroup>
    </>
  );
}

export function DataTab({ ctl }: { ctl: WorkbookController }) {
  return (
    <>
      <RibbonGroup label="Get & Transform Data">
        <BigButton
          icon="getData"
          label={"Get\nData"}
          dropdown={[{ label: "From Text/CSV", icon: "file", onClick: () => ctl.ui?.backstage("open") }, { label: "From Workbook", icon: "xlsx", onClick: () => ctl.ui?.backstage("open") }, { separator: true }, { label: "From Database", disabled: true, description: "Available with database sync" }]}
        />
      </RibbonGroup>
      <RibbonGroup label="Sort & Filter">
        <Stack>
          <SmallButton icon="sortAZ" title="Sort A to Z" onClick={() => ctl.sort(true)} />
          <SmallButton icon="sortZA" title="Sort Z to A" onClick={() => ctl.sort(false)} />
        </Stack>
        <BigButton icon="sort" label="Sort" onClick={() => ctl.ui?.dialog("sort")} />
        <BigButton icon="filter" label="Filter" disabled title={soon} />
      </RibbonGroup>
      <RibbonGroup label="Data Tools">
        <BigButton icon="textToColumns" label={"Text to\nColumns"} disabled title={soon} />
        <BigButton icon="removeDuplicates" label={"Remove\nDuplicates"} onClick={() => ctl.ui?.dialog("removeDuplicates")} />
      </RibbonGroup>
      <RibbonGroup label="Sort">
        <SplitButton icon="sortCustom" label="Sort" onClick={() => ctl.ui?.dialog("sort")} dropdown={sortMenu(ctl)} />
      </RibbonGroup>
    </>
  );
}

export function ReviewTab({ ctl }: { ctl: WorkbookController }) {
  return (
    <>
      <RibbonGroup label="Proofing">
        <BigButton icon="spelling" label="Spelling" disabled title={soon} />
        <BigButton icon="stats" label={"Workbook\nStatistics"} onClick={() => ctl.ui?.dialog("stats")} />
      </RibbonGroup>
      <RibbonGroup label="Accessibility">
        <BigButton icon="accessibility" label={"Check\nAccessibility"} disabled title={soon} />
      </RibbonGroup>
      <RibbonGroup label="Comments">
        <BigButton icon="comment" label={"New\nComment"} disabled title={soon} />
      </RibbonGroup>
      <RibbonGroup label="Protect">
        <BigButton icon="protect" label={"Protect\nSheet"} disabled title={soon} />
      </RibbonGroup>
    </>
  );
}

export function ViewTab({ ctl }: { ctl: WorkbookController }) {
  const s = useCtl(ctl, (c) => ({
    grid: c.layout?.showGridLines !== false,
    headings: c.showHeadings,
    formulaBar: c.showFormulaBar,
    frozen: c.frozenRows > 0 || c.frozenCols > 0,
    zoom: c.zoom,
  }));
  return (
    <>
      <RibbonGroup label="Workbook Views">
        <BigButton icon="normalView" label="Normal" active onClick={() => {}} />
        <BigButton icon="pageBreakView" label={"Page Break\nPreview"} disabled title={soon} />
        <BigButton icon="pageLayoutView" label={"Page\nLayout"} disabled title={soon} />
      </RibbonGroup>
      <RibbonGroup label="Show">
        <div className="show-checks">
          <CheckItem label="Gridlines" checked={s.grid} onChange={(v) => ctl.setGridLines(v)} />
          <CheckItem
            label="Formula Bar"
            checked={s.formulaBar}
            onChange={(v) => {
              ctl.showFormulaBar = v;
              ctl.emit();
            }}
          />
          <CheckItem
            label="Headings"
            checked={s.headings}
            onChange={(v) => {
              ctl.showHeadings = v;
              ctl.emit();
            }}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Zoom">
        <BigButton icon="zoom" label="Zoom" onClick={() => ctl.ui?.dialog("zoom")} />
        <BigButton icon="zoom100" label="100%" onClick={() => ctl.setZoom(1)} />
        <BigButton
          icon="zoomSelection"
          label={"Zoom to\nSelection"}
          onClick={() => {
            const r = ctl.range;
            if (isFullCols(r) || isFullRows(r)) return;
            const w = (ctl.cols.start(r.c2 + 1) - ctl.cols.start(r.c1)) / ctl.zoom;
            const h = (ctl.rows.start(r.r2 + 1) - ctl.rows.start(r.r1)) / ctl.zoom;
            const z = Math.min((ctl.viewport.width - ctl.headerW - 20) / w, (ctl.viewport.height - ctl.headerH - 20) / h);
            ctl.setZoom(Math.max(0.1, Math.min(4, z)));
            ctl.ensureVisible(r.r1, r.c1);
          }}
        />
      </RibbonGroup>
      <RibbonGroup label="Window">
        <BigButton
          icon="freeze"
          label={"Freeze\nPanes"}
          dropdown={[
            s.frozen
              ? { label: "Unfreeze Panes", icon: "freeze", description: "Unlock all rows and columns to scroll through the entire worksheet.", onClick: () => ctl.unfreeze() }
              : { label: "Freeze Panes", icon: "freeze", description: "Keep rows and columns visible while the rest of the worksheet scrolls (based on current selection).", onClick: () => ctl.freezePanes() },
            { label: "Freeze Top Row", icon: "freezeRow", description: "Keep the top row visible while scrolling through the rest of the worksheet.", onClick: () => ctl.freezeTopRow() },
            { label: "Freeze First Column", icon: "freezeCol", description: "Keep the first column visible while scrolling through the rest of the worksheet.", onClick: () => ctl.freezeFirstCol() },
          ]}
          largeMenu
        />
        <BigButton icon="newWindow" label={"New\nWindow"} disabled title={soon} />
        <BigButton icon="switchWindows" label={"Switch\nWindows"} disabled title={soon} />
      </RibbonGroup>
    </>
  );
}

export function HelpTab({ ctl }: { ctl: WorkbookController }) {
  return (
    <>
      <RibbonGroup label="Help">
        <BigButton icon="help" label="Help" onClick={() => ctl.ui?.dialog("shortcuts")} />
        <BigButton icon="keyboard" label={"Keyboard\nShortcuts"} onClick={() => ctl.ui?.dialog("shortcuts")} />
        <BigButton icon="training" label={"Show\nTraining"} onClick={() => ctl.ui?.backstage("template:formula-tutorial")} />
        <BigButton icon="feedback" label="Feedback" onClick={() => ctl.ui?.dialog("feedback")} />
        <BigButton icon="about" label="About" onClick={() => ctl.ui?.dialog("about")} />
      </RibbonGroup>
    </>
  );
}

export { CATEGORIES };
