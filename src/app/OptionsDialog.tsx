import { useState } from "react";
import type { Settings } from "../api";
import { Dialog } from "../components/Dialog";
import { FONTS, SIZES } from "../lib/fonts";

export function OptionsDialog({ settings, onSave, onClose }: { settings: Settings; onSave: (s: Settings) => void; onClose: () => void }) {
  const [s, setS] = useState<Settings>(settings);
  return (
    <Dialog
      title="Sheets Options"
      width={520}
      onClose={onClose}
      onSubmit={() => {
        onSave(s);
        onClose();
      }}
    >
      <div className="options">
        <h3>Personalize</h3>
        <label className="fc-row">
          <span className="lbl">User name:</span>
          <input value={s.userName} onChange={(e) => setS({ ...s, userName: e.target.value })} />
        </label>
        <label className="fc-row">
          <span className="lbl">Office Theme:</span>
          <select value={s.theme} onChange={(e) => setS({ ...s, theme: e.target.value as Settings["theme"] })}>
            <option value="dark">Black</option>
            <option value="light">White</option>
            <option value="system">Use system setting</option>
          </select>
        </label>
        <h3>When creating new workbooks</h3>
        <label className="fc-row">
          <span className="lbl">Use this as the default font:</span>
          <select value={s.defaultFont} onChange={(e) => setS({ ...s, defaultFont: e.target.value })}>
            {FONTS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="fc-row">
          <span className="lbl">Font size:</span>
          <select value={String(s.defaultFontSize)} onChange={(e) => setS({ ...s, defaultFontSize: Number(e.target.value) })}>
            {SIZES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="fc-row">
          <span className="lbl">Include this many sheets:</span>
          <input
            type="number"
            min={1}
            max={255}
            value={s.sheetsInNewWorkbook}
            onChange={(e) => setS({ ...s, sheetsInNewWorkbook: Math.max(1, Math.min(255, Number(e.target.value) || 1)) })}
          />
        </label>
        <h3>Editing</h3>
        <label className="fc-row">
          <span className="lbl">Typed dates like 01/02/2026 mean:</span>
          <select
            value={s.dayFirst === null ? "auto" : s.dayFirst ? "dmy" : "mdy"}
            onChange={(e) => setS({ ...s, dayFirst: e.target.value === "auto" ? null : e.target.value === "dmy" })}
          >
            <option value="auto">Automatic (by region)</option>
            <option value="dmy">Day / Month / Year</option>
            <option value="mdy">Month / Day / Year</option>
          </select>
        </label>
        <label className="fc-row check">
          <input type="checkbox" checked={s.showStartScreen} onChange={(e) => setS({ ...s, showStartScreen: e.target.checked })} />
          Show the Start screen when this application starts
        </label>
        <h3>Data integrity</h3>
        <label className="fc-row check">
          <input type="checkbox" checked={s.preserveLiterals} onChange={(e) => setS({ ...s, preserveLiterals: e.target.checked })} />
          Keep leading zeros and numbers longer than 15 digits exactly as typed, pasted or imported (IDs, ZIP codes, card numbers)
        </label>
        <label className="fc-row check">
          <input type="checkbox" checked={s.csvBom} onChange={(e) => setS({ ...s, csvBom: e.target.checked })} />
          Save CSV files as UTF-8 with a byte order mark (Excel opens accents and non-Latin text correctly)
        </label>
        <h3>Save</h3>
        <label className="fc-row">
          <span className="lbl">Save AutoRecover information every:</span>
          <select value={String(s.autorecoverSeconds)} onChange={(e) => setS({ ...s, autorecoverSeconds: Number(e.target.value) })}>
            <option value="10">10 seconds</option>
            <option value="30">30 seconds</option>
            <option value="60">1 minute</option>
            <option value="300">5 minutes</option>
            <option value="0">Off (not recommended)</option>
          </select>
        </label>
        <label className="fc-row">
          <span className="lbl">Previous versions kept per file:</span>
          <input
            type="number"
            min={0}
            max={200}
            value={s.keepVersions}
            onChange={(e) => setS({ ...s, keepVersions: Math.max(0, Math.min(200, Number(e.target.value) || 0)) })}
          />
        </label>
      </div>
    </Dialog>
  );
}
