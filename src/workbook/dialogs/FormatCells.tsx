import { useEffect, useMemo, useState } from "react";
import { api, Kind, type BorderDto, type StyleDto, type StylePatch } from "../../api";
import { ColorPicker } from "../../components/ColorPicker";
import { Dialog } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { Popup } from "../../components/Popup";
import { categoryDefs, currency, formatCategory } from "../../lib/formats";
import type { WorkbookController } from "../controller";
import { FONTS, SIZES } from "../../lib/fonts";

type Tab = "number" | "alignment" | "font" | "border" | "fill";

function ColorButton({ value, onChange, auto }: { value: string; onChange: (c: string) => void; auto: string }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <button type="button" className="color-button" onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}>
        <span className="cb-swatch" style={{ background: value || (auto === "No Color" ? "transparent" : "#000") }} />
        <Icon name="chevronDown" size={10} />
      </button>
      {anchor && (
        <Popup anchor={anchor} onClose={() => setAnchor(null)}>
          <div className="menu flyout">
            <ColorPicker
              automaticLabel={auto === "Automatic" ? "Automatic" : undefined}
              noneLabel={auto === "No Color" ? "No Color" : undefined}
              onPick={(c) => {
                setAnchor(null);
                onChange(c);
              }}
            />
          </div>
        </Popup>
      )}
    </>
  );
}

const LINE_STYLES = ["none", "dotted", "mediumdashdotdot", "mediumdashdot", "mediumdashed", "thin", "medium", "thick", "double"];

function NumberTab({ fmt, setFmt, sample }: { fmt: string; setFmt: (f: string) => void; sample: number | null }) {
  const defs = useMemo(() => categoryDefs(), []);
  const initialCat = (() => {
    const c = formatCategory(fmt).toLowerCase();
    if (c === "percentage") return "percent";
    if (c === "short date" || c === "long date") return "date";
    const found = defs.find((d) => d.label.toLowerCase() === c);
    return found ? found.id : "custom";
  })();
  const [cat, setCat] = useState(initialCat);
  const [preview, setPreview] = useState("");
  const def = defs.find((d) => d.id === cat)!;
  const decimalsOf = (f: string) => {
    const m = /\.(0+)/.exec(f);
    return m ? m[1].length : 0;
  };
  const [decimals, setDecimals] = useState(decimalsOf(fmt) || 2);
  const [thousands, setThousands] = useState(fmt.includes("#,##"));
  const [symbol, setSymbol] = useState(() => /"([^"]+)"/.exec(fmt)?.[1] ?? currency());

  useEffect(() => {
    const value = sample ?? (cat === "date" || cat === "time" ? 46293.6 : -1234.5678);
    api
      .formatPreview(value, fmt)
      .then(setPreview)
      .catch(() => setPreview(""));
  }, [fmt, sample, cat]);

  const build = (c: string, d = decimals, th = thousands, sym = symbol) => {
    const dec = d > 0 ? "." + "0".repeat(d) : "";
    switch (c) {
      case "general":
        return "general";
      case "number":
        return `${th ? "#,##0" : "0"}${dec}`;
      case "currency":
        return `"${sym}"#,##0${dec}`;
      case "accounting":
        return `_("${sym}"* #,##0${dec}_);_("${sym}"* (#,##0${dec});_("${sym}"* "-"??_);_(@_)`;
      case "percent":
        return `0${dec}%`;
      case "scientific":
        return `0${dec}E+00`;
      case "text":
        return "@";
      default:
        return fmt;
    }
  };

  const hasDecimals = ["number", "currency", "accounting", "percent", "scientific"].includes(cat);
  return (
    <div className="fc-number">
      <div className="fc-list">
        <div className="fc-label">Category:</div>
        <div className="listbox">
          {defs.map((d) => (
            <div
              key={d.id}
              className={`lb-item ${cat === d.id ? "selected" : ""}`}
              onClick={() => {
                setCat(d.id);
                if (d.id === "date" || d.id === "time" || d.id === "custom") setFmt(d.samples[0]);
                else setFmt(build(d.id));
              }}
            >
              {d.label}
            </div>
          ))}
        </div>
      </div>
      <div className="fc-detail">
        <fieldset className="fc-sample">
          <legend>Sample</legend>
          <div className="sample-text">{preview || " "}</div>
        </fieldset>
        {hasDecimals && (
          <label className="fc-row">
            Decimal places:
            <input
              type="number"
              min={0}
              max={30}
              value={decimals}
              onChange={(e) => {
                const d = Math.max(0, Math.min(30, Number(e.target.value)));
                setDecimals(d);
                setFmt(build(cat, d));
              }}
            />
          </label>
        )}
        {cat === "number" && (
          <label className="fc-row check">
            <input
              type="checkbox"
              checked={thousands}
              onChange={(e) => {
                setThousands(e.target.checked);
                setFmt(build(cat, decimals, e.target.checked));
              }}
            />
            Use 1000 Separator (,)
          </label>
        )}
        {(cat === "currency" || cat === "accounting") && (
          <label className="fc-row">
            Symbol:
            <select
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value);
                setFmt(build(cat, decimals, thousands, e.target.value));
              }}
            >
              {["₹", "$", "€", "£", "¥", "AED ", "Rs "].map((s) => (
                <option key={s} value={s}>
                  {s.trim()}
                </option>
              ))}
            </select>
          </label>
        )}
        {(cat === "date" || cat === "time" || cat === "custom" || cat === "number") && (
          <>
            <div className="fc-label">{cat === "custom" ? "Type:" : "Type:"}</div>
            {cat === "custom" && <input className="fc-code" value={fmt} onChange={(e) => setFmt(e.target.value)} spellCheck={false} />}
            <div className="listbox short">
              {def.samples.map((s) => (
                <div key={s} className={`lb-item ${fmt === s ? "selected" : ""}`} onClick={() => setFmt(s)}>
                  {s}
                </div>
              ))}
            </div>
          </>
        )}
        <p className="fc-desc">{def.description}</p>
      </div>
    </div>
  );
}

function BorderTab({
  borders,
  setBorders,
  multi,
}: {
  borders: Record<string, BorderDto | undefined>;
  setBorders: (b: Record<string, BorderDto | undefined>) => void;
  multi: boolean;
}) {
  const [line, setLine] = useState("thin");
  const [color, setColor] = useState("#000000");
  const item = (): BorderDto => ({ style: line, color });
  const toggle = (edge: string) => {
    const cur = borders[edge];
    setBorders({ ...borders, [edge]: cur && cur.style !== "none" ? { style: "none", color: "" } : item() });
  };
  const preset = (p: "none" | "outline" | "inside") => {
    const none = { style: "none", color: "" };
    if (p === "none") setBorders({ top: none, bottom: none, left: none, right: none, insideH: none, insideV: none });
    if (p === "outline") setBorders({ ...borders, top: item(), bottom: item(), left: item(), right: item() });
    if (p === "inside") setBorders({ ...borders, insideH: item(), insideV: item() });
  };
  const css = (b?: BorderDto) =>
    b && b.style !== "none"
      ? `${b.style === "thick" ? 3 : b.style === "medium" ? 2 : b.style === "double" ? 3 : 1}px ${b.style === "double" ? "double" : b.style.includes("dash") ? "dashed" : b.style === "dotted" ? "dotted" : "solid"} ${b.color || "#000"}`
      : "1px dashed transparent";
  return (
    <div className="fc-border">
      <div className="fc-line">
        <div className="fc-label">Line</div>
        <div className="fc-label small">Style:</div>
        <div className="line-styles">
          {LINE_STYLES.map((s) => (
            <button type="button" key={s} className={`line-style ${line === s ? "selected" : ""}`} onClick={() => setLine(s)}>
              {s === "none" ? "None" : <span className={`line-sample line-${s}`} />}
            </button>
          ))}
        </div>
        <div className="fc-label small">Color:</div>
        <ColorButton value={color} onChange={(c) => setColor(c || "#000000")} auto="Automatic" />
      </div>
      <div className="fc-borders-right">
        <div className="fc-label">Presets</div>
        <div className="border-presets">
          <button type="button" onClick={() => preset("none")}>
            <Icon name="borderNone" size={24} />
            <span>None</span>
          </button>
          <button type="button" onClick={() => preset("outline")}>
            <Icon name="borderOutside" size={24} />
            <span>Outline</span>
          </button>
          <button type="button" onClick={() => preset("inside")} disabled={!multi}>
            <Icon name="borderInside" size={24} />
            <span>Inside</span>
          </button>
        </div>
        <div className="fc-label">Border</div>
        <div className="border-editor">
          <div className="be-side">
            <button type="button" onClick={() => toggle("top")}>
              <Icon name="borderTop" />
            </button>
            <button type="button" onClick={() => toggle("insideH")} disabled={!multi}>
              <Icon name="borderInside" />
            </button>
            <button type="button" onClick={() => toggle("bottom")}>
              <Icon name="borderBottom" />
            </button>
          </div>
          <div
            className="be-preview"
            style={{ borderTop: css(borders.top), borderBottom: css(borders.bottom), borderLeft: css(borders.left), borderRight: css(borders.right) }}
          >
            {multi && (
              <>
                <div className="be-inside-h" style={{ borderTop: css(borders.insideH) }} />
                <div className="be-inside-v" style={{ borderLeft: css(borders.insideV) }} />
              </>
            )}
            <span>Text</span>
          </div>
          <div className="be-bottom">
            <button type="button" onClick={() => toggle("left")}>
              <Icon name="borderLeft" />
            </button>
            <button type="button" onClick={() => toggle("insideV")} disabled={!multi}>
              <Icon name="borderInside" />
            </button>
            <button type="button" onClick={() => toggle("right")}>
              <Icon name="borderRight" />
            </button>
          </div>
        </div>
        <p className="fc-desc">Click a preset, preview diagram or the buttons above to apply borders.</p>
      </div>
    </div>
  );
}

export function FormatCellsDialog({ ctl, tab: initialTab, onClose }: { ctl: WorkbookController; tab?: Tab; onClose: () => void }) {
  const base: StyleDto = ctl.activeInfo?.style ?? { size: ctl.info.defaultFontSize, hAlign: "general", vAlign: "bottom", numFmt: "general" };
  const [tab, setTab] = useState<Tab>(initialTab ?? "number");
  const [fmt, setFmt] = useState(base.numFmt || "general");
  const [hAlign, setHAlign] = useState(base.hAlign);
  const [vAlign, setVAlign] = useState(base.vAlign);
  const [wrap, setWrap] = useState(!!base.wrap);
  const [merge, setMerge] = useState(ctl.isMerged());
  const [font, setFont] = useState(base.font ?? ctl.info.defaultFont);
  const [size, setSize] = useState(String(base.size));
  const [bold, setBold] = useState(!!base.bold);
  const [italic, setItalic] = useState(!!base.italic);
  const [underline, setUnderline] = useState(!!base.underline);
  const [strike, setStrike] = useState(!!base.strike);
  const [color, setColor] = useState(base.color ?? "");
  const [fill, setFill] = useState(base.fill ?? "");
  const r = ctl.range;
  const multi = r.r1 !== r.r2 || r.c1 !== r.c2;
  const [borders, setBorders] = useState<Record<string, BorderDto | undefined>>(() =>
    multi ? {} : { top: base.borderTop, bottom: base.borderBottom, left: base.borderLeft, right: base.borderRight },
  );
  const sampleValue = ctl.activeInfo && (ctl.activeInfo.kind & 7) === Kind.NUMBER ? Number(ctl.activeInfo.content) : null;

  const apply = async () => {
    const patch: StylePatch = {};
    if (fmt !== base.numFmt) patch.numFmt = fmt;
    if (hAlign !== base.hAlign) patch.hAlign = hAlign;
    if (vAlign !== base.vAlign) patch.vAlign = vAlign;
    if (wrap !== !!base.wrap) patch.wrap = wrap;
    if (font !== (base.font ?? ctl.info.defaultFont)) patch.fontName = font;
    if (Number(size) !== base.size && Number(size) > 0) patch.fontSize = Number(size);
    if (bold !== !!base.bold) patch.bold = bold;
    if (italic !== !!base.italic) patch.italic = italic;
    if (underline !== !!base.underline) patch.underline = underline;
    if (strike !== !!base.strike) patch.strike = strike;
    if (color !== (base.color ?? "")) patch.color = color;
    if (fill !== (base.fill ?? "")) patch.fill = fill;
    const same = (a?: BorderDto, b?: BorderDto) => (a?.style ?? "none") === (b?.style ?? "none") && (a?.color ?? "") === (b?.color ?? "");
    if (borders.top && !same(borders.top, base.borderTop)) patch.borderTop = borders.top;
    if (borders.bottom && !same(borders.bottom, base.borderBottom)) patch.borderBottom = borders.bottom;
    if (borders.left && !same(borders.left, base.borderLeft)) patch.borderLeft = borders.left;
    if (borders.right && !same(borders.right, base.borderRight)) patch.borderRight = borders.right;
    if (borders.insideH) patch.borderInsideH = borders.insideH;
    if (borders.insideV) patch.borderInsideV = borders.insideV;
    onClose();
    if (Object.keys(patch).length) await ctl.style(patch);
    if (merge !== ctl.isMerged()) await ctl.merge(merge ? "merge" : "unmerge");
  };

  const tabs: [Tab, string][] = [
    ["number", "Number"],
    ["alignment", "Alignment"],
    ["font", "Font"],
    ["border", "Border"],
    ["fill", "Fill"],
  ];

  return (
    <Dialog title="Format Cells" onClose={onClose} onSubmit={apply} width={620} className="format-cells">
      <div className="tabs">
        {tabs.map(([id, label]) => (
          <button type="button" key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="tab-panel">
        {tab === "number" && <NumberTab fmt={fmt} setFmt={setFmt} sample={sampleValue} />}
        {tab === "alignment" && (
          <div className="fc-align">
            <fieldset>
              <legend>Text alignment</legend>
              <label className="fc-row">
                Horizontal:
                <select value={hAlign} onChange={(e) => setHAlign(e.target.value)}>
                  <option value="general">General</option>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                  <option value="fill">Fill</option>
                  <option value="justify">Justify</option>
                  <option value="centerContinuous">Center Across Selection</option>
                  <option value="distributed">Distributed</option>
                </select>
              </label>
              <label className="fc-row">
                Vertical:
                <select value={vAlign} onChange={(e) => setVAlign(e.target.value)}>
                  <option value="top">Top</option>
                  <option value="center">Center</option>
                  <option value="bottom">Bottom</option>
                  <option value="justify">Justify</option>
                  <option value="distributed">Distributed</option>
                </select>
              </label>
            </fieldset>
            <fieldset>
              <legend>Text control</legend>
              <label className="fc-row check">
                <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> Wrap text
              </label>
              <label className="fc-row check">
                <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} disabled={!multi && !ctl.isMerged()} /> Merge cells
              </label>
            </fieldset>
          </div>
        )}
        {tab === "font" && (
          <div className="fc-font">
            <div className="fc-font-top">
              <div>
                <div className="fc-label">Font:</div>
                <input value={font} onChange={(e) => setFont(e.target.value)} />
                <div className="listbox">
                  {FONTS.map((f) => (
                    <div key={f} className={`lb-item ${font === f ? "selected" : ""}`} style={{ fontFamily: `"${f}"` }} onClick={() => setFont(f)}>
                      {f}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="fc-label">Font style:</div>
                <div className="listbox short">
                  {[
                    ["Regular", false, false],
                    ["Italic", false, true],
                    ["Bold", true, false],
                    ["Bold Italic", true, true],
                  ].map(([label, b, i]) => (
                    <div
                      key={label as string}
                      className={`lb-item ${bold === b && italic === i ? "selected" : ""}`}
                      onClick={() => {
                        setBold(b as boolean);
                        setItalic(i as boolean);
                      }}
                    >
                      {label as string}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="fc-label">Size:</div>
                <input value={size} onChange={(e) => setSize(e.target.value)} style={{ width: 60 }} />
                <div className="listbox short">
                  {SIZES.map((s) => (
                    <div key={s} className={`lb-item ${size === s ? "selected" : ""}`} onClick={() => setSize(s)}>
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="fc-font-bottom">
              <div>
                <label className="fc-row">
                  Underline:
                  <select value={underline ? "single" : "none"} onChange={(e) => setUnderline(e.target.value === "single")}>
                    <option value="none">None</option>
                    <option value="single">Single</option>
                  </select>
                </label>
                <label className="fc-row">
                  Color:
                  <ColorButton value={color} onChange={setColor} auto="Automatic" />
                </label>
                <fieldset>
                  <legend>Effects</legend>
                  <label className="fc-row check">
                    <input type="checkbox" checked={strike} onChange={(e) => setStrike(e.target.checked)} /> Strikethrough
                  </label>
                </fieldset>
              </div>
              <fieldset className="fc-sample grow">
                <legend>Preview</legend>
                <div
                  className="sample-text font-sample"
                  style={{
                    fontFamily: `"${font}"`,
                    fontSize: `${Math.min(36, Number(size) || 11) * 1.333}px`,
                    fontWeight: bold ? 700 : 400,
                    fontStyle: italic ? "italic" : "normal",
                    textDecoration: `${underline ? "underline" : ""} ${strike ? "line-through" : ""}`,
                    color: color || "#000",
                  }}
                >
                  AaBbCcYyZz
                </div>
              </fieldset>
            </div>
          </div>
        )}
        {tab === "border" && <BorderTab borders={borders} setBorders={setBorders} multi={multi} />}
        {tab === "fill" && (
          <div className="fc-fill">
            <div>
              <div className="fc-label">Background Color:</div>
              <button type="button" className="btn" onClick={() => setFill("")}>
                No Color
              </button>
              <ColorPicker onPick={(c) => setFill(c)} />
            </div>
            <fieldset className="fc-sample grow">
              <legend>Sample</legend>
              <div className="fill-sample" style={{ background: fill || "#fff" }} />
            </fieldset>
          </div>
        )}
      </div>
    </Dialog>
  );
}
