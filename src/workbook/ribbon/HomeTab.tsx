import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import type { MenuItem } from "../../components/Menu";
import { Popup } from "../../components/Popup";
import { FONTS, SIZES } from "../../lib/fonts";
import { formatCategory, FORMAT_PRESETS, accountingFmt } from "../../lib/formats";
import { CELL_STYLES, QUICK_STYLES, TABLE_STYLES, type CellStyleDef, type TableStyleDef } from "../../lib/galleries";
import type { WorkbookController } from "../controller";
import { useCtl } from "../hooks";
import {
  autoSumMenu,
  bordersMenu,
  clearMenu,
  conditionalMenu,
  deleteMenu,
  fillMenu,
  findMenu,
  formatMenu,
  insertMenu,
  mergeMenu,
  pasteMenu,
  sortMenu,
  type BorderPrefs,
} from "../menus";
import { BigButton, BigSplit, ColorSplit, Combo, RibbonGroup, Row, Sep, SmallButton, SplitButton, Stack } from "./controls";


function StylePreview({ def, onClick, wide }: { def: CellStyleDef; onClick: () => void; wide?: boolean }) {
  const p = def.patch ?? {};
  const border = (b?: { style: string; color: string }) => (b && b.style !== "none" ? `${b.style === "double" ? 3 : b.style === "thick" ? 2 : 1}px ${b.style === "double" ? "double" : "solid"} ${b.color}` : undefined);
  return (
    <button
      className={`style-preview ${wide ? "wide" : ""}`}
      title={def.name}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        background: p.fill || "#ffffff",
        color: p.color || "#000000",
        fontWeight: p.bold ? 700 : 400,
        fontStyle: p.italic ? "italic" : undefined,
        fontSize: p.fontSize && p.fontSize > 12 ? 13 : 11,
        borderTop: border(p.borderTop),
        borderBottom: border(p.borderBottom),
        borderLeft: border(p.borderLeft),
        borderRight: border(p.borderRight),
      }}
    >
      {def.name}
    </button>
  );
}

export function CellStylesGallery({ ctl, close }: { ctl: WorkbookController; close: () => void }) {
  const groups = [...new Set(CELL_STYLES.map((s) => s.group))];
  return (
    <div className="gallery-panel">
      {groups.map((g) => (
        <div key={g}>
          <div className="menu-header">{g}</div>
          <div className="style-grid">
            {CELL_STYLES.filter((s) => s.group === g).map((s) => (
              <StylePreview
                key={s.name}
                def={s}
                wide
                onClick={() => {
                  close();
                  ctl.applyCellStyle(s.name);
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TableThumb({ def }: { def: TableStyleDef }) {
  const rows = [0, 1, 2, 3, 4];
  return (
    <svg width="61" height="46" viewBox="0 0 61 46">
      {rows.map((r) => {
        const patch = r === 0 ? def.header : r % 2 === 1 ? def.odd : def.even;
        const fill = patch.fill || "#ffffff";
        return (
          <g key={r}>
            <rect x="0.5" y={0.5 + r * 9} width="60" height="9" fill={fill} />
            {r > 0 && patch.borderInsideH && <line x1="0.5" x2="60.5" y1={0.5 + r * 9} y2={0.5 + r * 9} stroke={patch.borderInsideH.color} />}
            {[0, 1, 2, 3].map((c) => (
              <rect
                key={c}
                x={4 + c * 14}
                y={4 + r * 9}
                width="9"
                height="2"
                fill={patch.color || (r === 0 && patch.bold ? "#000" : "#7f7f7f")}
                opacity={r === 0 ? 1 : 0.6}
              />
            ))}
          </g>
        );
      })}
      {def.header.borderTop && <line x1="0" x2="61" y1="0.5" y2="0.5" stroke={def.header.borderTop.color} />}
      {def.header.borderBottom && <line x1="0" x2="61" y1="9.5" y2="9.5" stroke={def.header.borderBottom.color} />}
      <rect x="0.5" y="0.5" width="60" height="45" fill="none" stroke="#9a9a9a" />
    </svg>
  );
}

export function TableGallery({ ctl, close }: { ctl: WorkbookController; close: () => void }) {
  return (
    <div className="gallery-panel table-gallery">
      {(["Light", "Medium", "Dark"] as const).map((g) => (
        <div key={g}>
          <div className="menu-header">{g}</div>
          <div className="table-grid">
            {TABLE_STYLES.filter((t) => t.group === g).map((t, i) => (
              <button
                key={t.id}
                className="table-thumb"
                title={`${g} Table Style ${i + 1}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  close();
                  ctl.formatAsTable(t.id);
                }}
              >
                <TableThumb def={t} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

export function HomeTab({ ctl }: { ctl: WorkbookController }) {
  const width = useWindowWidth();
  const galleryInline = width >= 1760;
  const compact = width < 1320;
  const s = useCtl(ctl, (c) => {
    const st = c.activeInfo?.style;
    return {
      font: st?.font ?? c.info.defaultFont,
      size: st ? String(st.size) : String(c.info.defaultFontSize),
      bold: !!st?.bold,
      italic: !!st?.italic,
      underline: !!st?.underline,
      hAlign: st?.hAlign ?? "general",
      vAlign: st?.vAlign ?? "bottom",
      wrap: !!st?.wrap,
      numFmt: st?.numFmt ?? "general",
      merged: c.isMerged(),
      painter: !!c.painter,
      hasClip: !!c.clip,
    };
  });
  const [borderPrefs, setBorderPrefs] = useState<BorderPrefs>({ style: "thin", color: "#000000" });
  const [lastBorder, setLastBorder] = useState<{ kind: string; icon: string }>({ kind: "bottom", icon: "borderBottom" });
  const [stylesAnchor, setStylesAnchor] = useState<DOMRect | null>(null);
  const [styleOffset, setStyleOffset] = useState(0);
  const quick = [...QUICK_STYLES.map((n) => CELL_STYLES.find((c) => c.name === n)!), ...CELL_STYLES.filter((c) => !QUICK_STYLES.includes(c.name))];
  const shown = quick.slice(styleOffset, styleOffset + 6);

  const borderIcon: Record<string, string> = {
    bottom: "borderBottom",
    top: "borderTop",
    left: "borderLeft",
    right: "borderRight",
    none: "borderNone",
    all: "borderAll",
    outer: "borderOutside",
    thickOuter: "borderThickOutside",
    bottomDouble: "borderBottomDouble",
    thickBottom: "borderThickBottom",
    topBottom: "borderTopBottom",
    topThickBottom: "borderTopThickBottom",
    topDoubleBottom: "borderTopDoubleBottom",
  };

  const numberMenu: MenuItem[] = [
    ...FORMAT_PRESETS.map((p) => ({
      label: p.label,
      icon: p.icon,
      onClick: () => ctl.style({ numFmt: p.code() }),
    })),
    { separator: true },
    { label: "More Number Formats...", onClick: () => ctl.ui?.dialog("formatCells", { tab: "number" }) },
  ];

  return (
    <>
      <RibbonGroup label="Clipboard">
        <BigSplit icon="paste" label="Paste" onClick={() => ctl.paste("all")} dropdown={pasteMenu(ctl)} title="Paste (Ctrl+V)" />
        <Stack>
          <SmallButton icon="cut" label="Cut" onClick={() => ctl.copy(true)} title="Cut (Ctrl+X)" />
          <SplitButton
            icon="copy"
            label="Copy"
            onClick={() => ctl.copy(false)}
            title="Copy (Ctrl+C)"
            dropdown={[
              { label: "Copy", icon: "copy", onClick: () => ctl.copy(false) },
              { label: "Copy as Picture...", disabled: true },
            ]}
          />
          <SmallButton
            icon="formatPainter"
            label="Format Painter"
            active={s.painter}
            onClick={() => (ctl.painter ? ((ctl.painter = null), ctl.clearClip()) : ctl.armPainter())}
          />
        </Stack>
      </RibbonGroup>

      <RibbonGroup label="Font" launcher={() => ctl.ui?.dialog("formatCells", { tab: "font" })}>
        <Stack className="font-stack">
          <Row>
            <Combo
              value={s.font}
              options={FONTS.includes(s.font) ? FONTS : [s.font, ...FONTS]}
              width={122}
              title="Font"
              onCommit={(v) => {
                if (v.trim()) ctl.style({ fontName: v.trim() });
                ctl.ui?.focusGrid();
              }}
              renderOption={(o) => <span style={{ fontFamily: `"${o}"`, fontSize: 14 }}>{o}</span>}
            />
            <Combo
              value={s.size}
              options={SIZES}
              width={46}
              title="Font Size"
              onCommit={(v) => {
                const n = Number(v);
                if (n >= 1 && n <= 409) ctl.style({ fontSize: n });
                ctl.ui?.focusGrid();
              }}
            />
            <SmallButton icon="fontGrow" title="Increase Font Size (Ctrl+Shift+>)" onClick={() => ctl.style({ fontSizeDelta: 1 })} />
            <SmallButton icon="fontShrink" title="Decrease Font Size (Ctrl+Shift+<)" onClick={() => ctl.style({ fontSizeDelta: -1 })} />
          </Row>
          <Row>
            <SmallButton icon="bold" title="Bold (Ctrl+B)" active={s.bold} onClick={() => ctl.toggle("bold")} />
            <SmallButton icon="italic" title="Italic (Ctrl+I)" active={s.italic} onClick={() => ctl.toggle("italic")} />
            <SplitButton
              icon="underline"
              title="Underline (Ctrl+U)"
              active={s.underline}
              onClick={() => ctl.toggle("underline")}
              dropdown={[
                { label: "Underline", icon: "underline", onClick: () => ctl.style({ underline: true }) },
                { label: "Double Underline", disabled: true },
              ]}
            />
            <Sep />
            <SplitButton
              icon={lastBorder.icon}
              title="Borders"
              onClick={() => ctl.borders(lastBorder.kind, borderPrefs.style, borderPrefs.color)}
              dropdown={bordersMenu(ctl, borderPrefs, setBorderPrefs, (kind) => setLastBorder({ kind, icon: borderIcon[kind] ?? "borders" }))}
            />
            <Sep />
            <ColorSplit icon="fillColor" color="#FFFF00" title="Fill Color" noneLabel="No Fill" onPick={(c) => ctl.style({ fill: c })} />
            <ColorSplit icon="fontColor" color="#FF0000" title="Font Color" automaticLabel="Automatic" onPick={(c) => ctl.style({ color: c })} />
          </Row>
        </Stack>
      </RibbonGroup>

      <RibbonGroup label="Alignment" launcher={() => ctl.ui?.dialog("formatCells", { tab: "alignment" })}>
        <Stack>
          <Row>
            <SmallButton icon="alignTop" title="Top Align" active={s.vAlign === "top"} onClick={() => ctl.style({ vAlign: "top" })} />
            <SmallButton icon="alignMiddle" title="Middle Align" active={s.vAlign === "center"} onClick={() => ctl.style({ vAlign: "center" })} />
            <SmallButton icon="alignBottom" title="Bottom Align" active={s.vAlign === "bottom"} onClick={() => ctl.style({ vAlign: "bottom" })} />
            <SmallButton icon="orientation" title="Orientation" disabled dropdown={[]} />
            <Sep />
            <SmallButton icon="wrapText" label="Wrap Text" active={s.wrap} onClick={() => ctl.style({ wrap: !s.wrap })} />
          </Row>
          <Row>
            <SmallButton icon="alignLeft" title="Align Left" active={s.hAlign === "left"} onClick={() => ctl.style({ hAlign: s.hAlign === "left" ? "general" : "left" })} />
            <SmallButton icon="alignCenter" title="Center" active={s.hAlign === "center"} onClick={() => ctl.style({ hAlign: s.hAlign === "center" ? "general" : "center" })} />
            <SmallButton icon="alignRight" title="Align Right" active={s.hAlign === "right"} onClick={() => ctl.style({ hAlign: s.hAlign === "right" ? "general" : "right" })} />
            <Sep />
            <SmallButton icon="indentDecrease" title="Decrease Indent" disabled />
            <SmallButton icon="indentIncrease" title="Increase Indent" disabled />
            <Sep />
            <SplitButton
              icon="mergeCenter"
              label="Merge & Center"
              active={s.merged}
              onClick={() => ctl.merge(s.merged ? "unmerge" : "center")}
              dropdown={mergeMenu(ctl)}
            />
          </Row>
        </Stack>
      </RibbonGroup>

      <RibbonGroup label="Number" launcher={() => ctl.ui?.dialog("formatCells", { tab: "number" })}>
        <Stack>
          <Row>
            <NumberFormatBox value={formatCategory(s.numFmt)} items={numberMenu} />
          </Row>
          <Row>
            <SplitButton
              icon="accounting"
              title="Accounting Number Format"
              onClick={() => ctl.style({ numFmt: accountingFmt() })}
              dropdown={[
                ["₹", "₹ English (India)"],
                ["$", "$ English (United States)"],
                ["£", "£ English (United Kingdom)"],
                ["€", "€ Euro (€ 123)"],
                ["¥", "¥ Chinese (PRC)"],
              ]
                .map(
                  ([sym, label]): MenuItem => ({
                    label,
                    onClick: () => ctl.style({ numFmt: `_("${sym}"* #,##0.00_);_("${sym}"* (#,##0.00);_("${sym}"* "-"??_);_(@_)` }),
                  }),
                )
                .concat([{ separator: true }, { label: "More Accounting Formats...", onClick: () => ctl.ui?.dialog("formatCells", { tab: "number" }) }])}
            />
            <SmallButton icon="percent" title="Percent Style (Ctrl+Shift+%)" onClick={() => ctl.style({ numFmt: "0%" })} />
            <SmallButton icon="comma" title="Comma Style" onClick={() => ctl.style({ numFmt: '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)' })} />
            <Sep />
            <SmallButton icon="decimalIncrease" title="Increase Decimal" onClick={() => ctl.decimals(1)} />
            <SmallButton icon="decimalDecrease" title="Decrease Decimal" onClick={() => ctl.decimals(-1)} />
          </Row>
        </Stack>
      </RibbonGroup>

      <RibbonGroup label="Styles" className="styles-group">
        <BigButton icon="conditionalFormatting" label={"Conditional\nFormatting"} dropdown={conditionalMenu(ctl)} />
        <BigButton icon="formatAsTable" label={"Format as\nTable"} dropdown={(close) => <TableGallery ctl={ctl} close={close} />} />
        {!galleryInline && (
          <BigButton icon="cellStyles" label={"Cell\nStyles"} dropdown={(close) => <CellStylesGallery ctl={ctl} close={close} />} />
        )}
        {galleryInline && (
        <div className="styles-gallery">
          <div className="styles-grid">
            {shown.map((d) => (
              <StylePreview key={d.name} def={d} onClick={() => ctl.applyCellStyle(d.name)} />
            ))}
          </div>
          <div className="styles-scroll">
            <button tabIndex={-1} disabled={styleOffset === 0} onClick={() => setStyleOffset(Math.max(0, styleOffset - 3))} title="Previous row">
              <Icon name="caretUp" size={10} />
            </button>
            <button tabIndex={-1} disabled={styleOffset + 6 >= quick.length} onClick={() => setStyleOffset(Math.min(quick.length - 6, styleOffset + 3))} title="Next row">
              <Icon name="caretDown" size={10} />
            </button>
            <button tabIndex={-1} title="More" onClick={(e) => setStylesAnchor(e.currentTarget.parentElement!.parentElement!.getBoundingClientRect())}>
              <Icon name="caretDown" size={10} />
            </button>
          </div>
          {stylesAnchor && (
            <Popup anchor={stylesAnchor} onClose={() => setStylesAnchor(null)}>
              <div className="menu flyout">
                <CellStylesGallery ctl={ctl} close={() => setStylesAnchor(null)} />
              </div>
            </Popup>
          )}
        </div>
        )}
      </RibbonGroup>

      <RibbonGroup label="Cells">
        <BigButton icon="insert" label="Insert" dropdown={insertMenu(ctl)} />
        <BigButton icon="delete" label="Delete" dropdown={deleteMenu(ctl)} />
        <BigButton icon="format" label="Format" dropdown={formatMenu(ctl)} />
      </RibbonGroup>

      <RibbonGroup label="Editing">
        <Stack className={`editing-stack ${compact ? "compact" : ""}`}>
          <SplitButton icon="autosum" label="AutoSum" onClick={() => ctl.autoSum("SUM")} dropdown={autoSumMenu(ctl)} title="AutoSum (Alt+=)" />
          <SmallButton icon="fill" label="Fill" dropdown={fillMenu(ctl)} />
          <SmallButton icon="clear" label="Clear" dropdown={clearMenu(ctl)} />
        </Stack>
        <BigButton icon="sortFilter" label={"Sort &\nFilter"} dropdown={sortMenu(ctl)} />
        <BigButton icon="findSelect" label={"Find &\nSelect"} dropdown={findMenu(ctl)} />
      </RibbonGroup>

      <RibbonGroup label="Add-ins">
        <BigButton icon="addins" label="Add-ins" onClick={() => ctl.ui?.dialog("addins")} />
      </RibbonGroup>
    </>
  );
}

function NumberFormatBox({ value, items }: { value: string; items: MenuItem[] }) {
  return (
    <SmallButton dropdown={items} title="Number Format">
      <span className="numfmt-box">{value}</span>
    </SmallButton>
  );
}
