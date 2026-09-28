import { useRef } from "react";
import { STANDARD_COLORS, themeGrid } from "../lib/colors";
import { Icon } from "./Icon";

const GRID = themeGrid();

/** Office-style colour palette (theme colours, standard colours, more). */
export function ColorPicker({
  onPick,
  automaticLabel,
  noneLabel,
}: {
  onPick: (color: string) => void;
  automaticLabel?: string;
  noneLabel?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="color-picker">
      {automaticLabel && (
        <button type="button" className="cp-wide" onClick={() => onPick("")}>
          <span className="cp-swatch" style={{ background: "#000" }} />
          {automaticLabel}
        </button>
      )}
      <div className="cp-title">Theme Colors</div>
      <div className="cp-grid">
        {GRID.map((row, ri) => (
          <div key={ri} className={`cp-row ${ri === 0 ? "first" : ""}`}>
            {row.map((c) => (
              <button
                key={c.hex + c.name}
                type="button"
                className="cp-cell"
                title={c.name}
                style={{ background: c.hex }}
                onClick={() => onPick(c.hex)}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="cp-title">Standard Colors</div>
      <div className="cp-row">
        {STANDARD_COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            className="cp-cell"
            title={c.name}
            style={{ background: c.hex }}
            onClick={() => onPick(c.hex)}
          />
        ))}
      </div>
      {noneLabel && (
        <button type="button" className="cp-wide" onClick={() => onPick("")}>
          <Icon name="borderNone" />
          {noneLabel}
        </button>
      )}
      <button type="button" className="cp-wide" onClick={() => input.current?.click()}>
        <Icon name="themes" />
        More Colors...
      </button>
      <input
        ref={input}
        type="color"
        className="cp-native"
        onChange={(e) => onPick(e.target.value.toUpperCase())}
      />
    </div>
  );
}
