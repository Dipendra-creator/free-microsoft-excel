import { useEffect, useState } from "react";
import { api, type TemplateMeta, type TemplatePreview } from "../api";
import { Icon } from "../components/Icon";

const previewCache = new Map<string, TemplatePreview | null>();

function BlankThumb() {
  const cols = ["A", "B", "C"];
  return (
    <svg className="thumb-svg" viewBox="0 0 120 92" preserveAspectRatio="none">
      <rect width="120" height="92" fill="#fff" />
      <rect x="0" y="0" width="120" height="8" fill="#e9e9e9" />
      <rect x="0" y="0" width="12" height="92" fill="#e9e9e9" />
      {cols.map((c, i) => (
        <text key={c} x={12 + i * 38 + 17} y="6.5" fontSize="6" fill="#666" textAnchor="middle">
          {c}
        </text>
      ))}
      {[1, 2, 3, 4, 5, 6, 7].map((r) => (
        <text key={r} x="6" y={8 + r * 12 - 3.5} fontSize="6" fill="#666" textAnchor="middle">
          {r}
        </text>
      ))}
      {[1, 2, 3].map((i) => (
        <line key={`v${i}`} x1={12 + i * 38} x2={12 + i * 38} y1="0" y2="92" stroke="#d6d6d6" strokeWidth="0.6" />
      ))}
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <line key={`h${i}`} x1="0" x2="120" y1={8 + i * 12} y2={8 + i * 12} stroke="#d6d6d6" strokeWidth="0.6" />
      ))}
      <rect x="12.5" y="8.5" width="37" height="11.5" fill="none" stroke="#107C41" strokeWidth="1.6" />
      <rect x="12" y="8" width="38" height="12" fill="none" stroke="#107C41" strokeWidth="0" />
      <rect x="18" y="1" width="26" height="7" fill="#d4d4d4" opacity=".6" />
    </svg>
  );
}

function TutorialThumb({ meta }: { meta: TemplateMeta }) {
  const [small, big] = meta.banner ?? ["", meta.name];
  return (
    <div className="thumb-tutorial">
      <div className="tt-text">
        {small && <div className="tt-small">{small}</div>}
        <div className="tt-big">{big}</div>
      </div>
      <div className="tt-band">
        <span className="tt-badge">
          {meta.icon === "fx" ? <i className="tt-fx">fx</i> : <Icon name="arrowRight" size={14} />}
        </span>
      </div>
    </div>
  );
}

function PreviewThumb({ preview }: { preview: TemplatePreview }) {
  const scale = 0.32;
  const xs: number[] = [0];
  preview.cols.forEach((w) => xs.push(xs[xs.length - 1] + w * scale));
  const ys: number[] = [0];
  preview.rows.forEach((h) => ys.push(ys[ys.length - 1] + h * scale));
  const W = 120;
  const H = 92;
  return (
    <svg className="thumb-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMin slice">
      <rect width={W} height={H} fill="#fff" />
      {preview.cells.map((c) => {
        const x = xs[c.c - 1] ?? 0;
        const y = ys[c.r - 1] ?? 0;
        const merge = preview.merges.find((m) => m[0] === c.r && m[1] === c.c);
        const w = merge ? (xs[merge[3]] ?? W) - x : (xs[c.c] ?? W) - x;
        const h = (ys[c.r] ?? H) - y;
        if (x > W || y > H) return null;
        const fs = Math.max(2.2, Math.min(7, c.size * 1.333 * scale));
        const tx = c.align === "right" ? x + w - 1 : c.align === "center" ? x + w / 2 : x + 1;
        return (
          <g key={`${c.r}-${c.c}`}>
            {c.fill && <rect x={x} y={y} width={w} height={h} fill={c.fill} />}
            {c.t && (
              <text
                x={tx}
                y={y + h - Math.max(1, h * 0.25)}
                fontSize={fs}
                fontWeight={c.bold ? 700 : 400}
                fill={c.color ?? "#222"}
                textAnchor={c.align === "right" ? "end" : c.align === "center" ? "middle" : "start"}
              >
                {c.t.length > 26 ? c.t.slice(0, 26) : c.t}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function TemplateTile({
  meta,
  blank,
  selected,
  onOpen,
}: {
  meta?: TemplateMeta;
  blank?: boolean;
  selected?: boolean;
  onOpen: () => void;
}) {
  const [preview, setPreview] = useState<TemplatePreview | null | undefined>(meta ? previewCache.get(meta.id) : null);
  useEffect(() => {
    if (!meta || meta.kind === "tutorial" || previewCache.has(meta.id)) return;
    let alive = true;
    api
      .templatePreview(meta.id)
      .then((p) => {
        previewCache.set(meta.id, p);
        if (alive) setPreview(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [meta]);

  const label = blank ? "Blank workbook" : meta!.name;
  return (
    <button className={`template-tile ${selected ? "selected" : ""}`} onClick={onOpen} title={meta?.description ?? "Create a new blank workbook"}>
      <div className="tile-thumb">
        {blank ? (
          <BlankThumb />
        ) : meta!.kind === "tutorial" ? (
          <TutorialThumb meta={meta!} />
        ) : preview ? (
          <PreviewThumb preview={preview} />
        ) : (
          <div className="thumb-loading" />
        )}
      </div>
      <div className="tile-label">{label}</div>
    </button>
  );
}
