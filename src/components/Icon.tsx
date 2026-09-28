// Office-style SVG icons. Small icons use a 16x16 grid, large ones 32x32.
// Monochrome strokes use currentColor so they follow the theme.

import type { CSSProperties, ReactElement } from "react";

const G = "#21A366"; // green
const G2 = "#107C41";
const B = "#3B8EEA"; // blue
const R = "#E0463C"; // red
const Y = "#F2C230"; // yellow
const O = "#EA8A2F"; // orange
const P = "#9B59D0"; // purple
const W = "var(--icon-paper, #fafafa)";

type Draw = () => ReactElement;

const s = { fill: "none", stroke: "currentColor", strokeWidth: 1, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const small: Record<string, Draw> = {
  logo: () => (
    <>
      <rect x="4.5" y="1.5" width="11" height="13" rx="1.5" fill="#33C481" />
      <rect x="4.5" y="1.5" width="11" height="4.3" fill="#21A366" />
      <rect x="4.5" y="10.2" width="11" height="4.3" rx="0" fill="#107C41" />
      <rect x="0.5" y="4" width="8" height="8" rx="1" fill="#0B5C30" />
      <path d="M2.2 5.7h4.6v4.6H2.2zM4.5 5.7v4.6M2.2 8h4.6" stroke="#fff" strokeWidth="1" fill="none" />
    </>
  ),
  save: () => (
    <>
      <path d="M2.5 2.5h9l2 2v9h-11z" {...s} />
      <path d="M5 2.5v3h5v-3M4.5 13.5v-4h7v4" {...s} />
    </>
  ),
  undo: () => <path d="M5 4L2 7l3 3M2.5 7H10a3.5 3.5 0 010 7H7" {...s} />,
  redo: () => <path d="M11 4l3 3-3 3M13.5 7H6a3.5 3.5 0 000 7h3" {...s} />,
  chevronDown: () => <path d="M4 6l4 4 4-4" {...s} />,
  chevronUp: () => <path d="M4 10l4-4 4 4" {...s} />,
  chevronRight: () => <path d="M6 4l4 4-4 4" {...s} />,
  chevronLeft: () => <path d="M10 4l-4 4 4 4" {...s} />,
  caretDown: () => <path d="M5 6.5h6L8 10z" fill="currentColor" />,
  caretUp: () => <path d="M5 9.5h6L8 6z" fill="currentColor" />,
  caretRight: () => <path d="M6.5 5v6L10 8z" fill="currentColor" />,
  caretLeft: () => <path d="M9.5 5v6L6 8z" fill="currentColor" />,
  customize: () => (
    <>
      <path d="M4 4.5h8" {...s} />
      <path d="M5 8h6l-3 3.2z" fill="currentColor" />
    </>
  ),
  search: () => (
    <>
      <circle cx="6.5" cy="6.5" r="4" {...s} />
      <path d="M9.5 9.5l4.5 4.5" {...s} />
    </>
  ),
  feedback: () => (
    <>
      <circle cx="6" cy="5" r="2.5" {...s} />
      <path d="M1.5 13.5c0-2.5 2-4 4.5-4s3 .8 3.6 1.8" {...s} />
      <path d="M9.5 2.5h5v4h-2l-1.6 1.5V6.5H9.5z" {...s} />
    </>
  ),
  help: () => (
    <>
      <path d="M5.8 5.7a2.2 2.2 0 114 1.2c-.6.7-1.8 1.1-1.8 2.3" {...s} />
      <circle cx="8" cy="11.8" r=".7" fill="currentColor" />
    </>
  ),
  minimize: () => <path d="M3 8.5h10" {...s} />,
  maximize: () => <rect x="3.5" y="3.5" width="9" height="9" rx="1" {...s} />,
  restore: () => (
    <>
      <rect x="3.5" y="5.5" width="7" height="7" rx="1" {...s} />
      <path d="M5.5 5.5v-1a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-1" {...s} />
    </>
  ),
  close: () => <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" {...s} />,
  x: () => <path d="M4 4l8 8M12 4l-8 8" {...s} />,
  check: () => <path d="M3 8.5l3 3 7-7" {...s} />,
  plus: () => <path d="M8 3v10M3 8h10" {...s} />,
  minus: () => <path d="M3 8h10" {...s} />,
  plusCircle: () => (
    <>
      <circle cx="8" cy="8" r="6" {...s} />
      <path d="M8 5v6M5 8h6" {...s} />
    </>
  ),
  dotsV: () => (
    <>
      <circle cx="8" cy="3.5" r="1" fill="currentColor" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="12.5" r="1" fill="currentColor" />
    </>
  ),
  dotsH: () => (
    <>
      <circle cx="3.5" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1" fill="currentColor" />
    </>
  ),
  arrowRight: () => <path d="M2.5 8h11M9.5 4l4 4-4 4" {...s} />,
  arrowLeft: () => <path d="M13.5 8h-11M6.5 4l-4 4 4 4" {...s} />,
  back: () => (
    <>
      <circle cx="8" cy="8" r="6.5" {...s} />
      <path d="M11 8H5M7.5 5.5L5 8l2.5 2.5" {...s} />
    </>
  ),
  home: () => <path d="M2.5 7.5L8 3l5.5 4.5M4 6.5v7h3v-4h2v4h3v-7" {...s} />,
  newDoc: () => <path d="M4 1.5h5.5l3 3v10H4zM9.5 1.5v3h3" {...s} />,
  open: () => <path d="M1.5 4.5v8h11l2-5.5H4l-2 5.5M1.5 4.5v-1h4l1 1h5v2" {...s} />,
  info: () => (
    <>
      <circle cx="8" cy="8" r="6" {...s} />
      <path d="M8 7v4" {...s} />
      <circle cx="8" cy="5" r=".6" fill="currentColor" />
    </>
  ),
  saveAs: () => (
    <>
      <path d="M2.5 2.5h8l2 2v3M2.5 2.5v11h5" {...s} />
      <path d="M5 2.5v3h4.5v-3" {...s} />
      <path d="M9 13.5l.5-2 4-4 1.5 1.5-4 4z" {...s} />
    </>
  ),
  export: () => <path d="M8 10V2M5 5l3-3 3 3M3 9v4.5h10V9" {...s} />,
  closeDoc: () => <path d="M4 1.5h8.5v13H4zM6.5 6.5l3.5 3.5M10 6.5L6.5 10" {...s} />,
  account: () => (
    <>
      <circle cx="8" cy="5.5" r="3" {...s} />
      <path d="M2.5 14c.5-3 2.8-4.5 5.5-4.5s5 1.5 5.5 4.5" {...s} />
    </>
  ),
  options: () => (
    <>
      <circle cx="8" cy="8" r="2" {...s} />
      <path
        d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
        {...s}
      />
    </>
  ),
  pin: () => <path d="M9.5 2l4.5 4.5-2 .5-2.5 2.5.5 3-1.5 1-3-3L2 14l-.5-.5 3.5-3.5-3-3 1-1.5 3 .5L8.5 4z" {...s} />,
  pinFilled: () => (
    <path d="M9.5 2l4.5 4.5-2 .5-2.5 2.5.5 3-1.5 1-3-3L2 14l-.5-.5 3.5-3.5-3-3 1-1.5 3 .5L8.5 4z" fill="currentColor" />
  ),
  file: () => <path d="M4 1.5h5.5l3 3v10H4zM9.5 1.5v3h3" {...s} />,
  xlsx: () => (
    <>
      <path d="M4.5 1.5h6l3 3v10h-9z" fill={W} stroke="#9a9a9a" strokeWidth="1" />
      <rect x="0.5" y="5" width="8" height="8" rx="1" fill="#0B5C30" />
      <path d="M2.3 6.8h4.4v4.4H2.3zM4.5 6.8v4.4M2.3 9h4.4" stroke="#fff" strokeWidth="0.9" fill="none" />
      <path d="M10 8h2.5M10 10h2.5M10 12h2.5" stroke="#9a9a9a" />
    </>
  ),
  csv: () => (
    <>
      <path d="M4.5 1.5h6l3 3v10h-9z" fill={W} stroke="#9a9a9a" strokeWidth="1" />
      <rect x="0.5" y="5" width="8" height="8" rx="1" fill="#0B5C30" />
      <path d="M2.3 6.8h4.4v4.4H2.3zM4.5 6.8v4.4M2.3 9h4.4" stroke="#fff" strokeWidth="0.9" fill="none" />
      <text x="9" y="13" fontSize="4" fill="#666">,</text>
    </>
  ),
  // --- Clipboard
  cut: () => (
    <>
      <circle cx="4.5" cy="11.5" r="2" {...s} />
      <circle cx="11.5" cy="11.5" r="2" {...s} />
      <path d="M5.8 10L11 2M10.2 10L5 2" {...s} />
    </>
  ),
  copy: () => (
    <>
      <rect x="5.5" y="4.5" width="8" height="10" rx="1" {...s} />
      <path d="M3.5 11.5h-1v-10h8v1" {...s} />
    </>
  ),
  formatPainter: () => (
    <>
      <rect x="2.5" y="1.5" width="10" height="4" rx="1" fill={Y} stroke="currentColor" />
      <path d="M12.5 3.5h1.5v3.5H7.5v2" {...s} />
      <rect x="6.5" y="9" width="2" height="5.5" rx=".5" fill="currentColor" />
    </>
  ),
  paste: () => (
    <>
      <rect x="2.5" y="2.5" width="9" height="11" rx="1" fill="#C8A26E" stroke="#8a6b3f" />
      <rect x="5" y="1.5" width="4" height="2.5" rx=".5" fill="#666" />
      <rect x="6.5" y="6.5" width="7" height="8" fill={W} stroke="currentColor" />
    </>
  ),
  pasteValues: () => (
    <>
      <rect x="2.5" y="2.5" width="9" height="11" rx="1" fill="#C8A26E" stroke="#8a6b3f" />
      <rect x="6.5" y="6.5" width="7" height="8" fill={W} stroke="currentColor" />
      <text x="7.5" y="13" fontSize="5.5" fontWeight="700" fill={B}>123</text>
    </>
  ),
  pasteFormats: () => (
    <>
      <rect x="2.5" y="2.5" width="9" height="11" rx="1" fill="#C8A26E" stroke="#8a6b3f" />
      <rect x="6.5" y="6.5" width="7" height="8" fill={W} stroke="currentColor" />
      <path d="M8 9h4M8 11h4" stroke={P} strokeWidth="1.5" />
    </>
  ),
  pasteFormulas: () => (
    <>
      <rect x="2.5" y="2.5" width="9" height="11" rx="1" fill="#C8A26E" stroke="#8a6b3f" />
      <rect x="6.5" y="6.5" width="7" height="8" fill={W} stroke="currentColor" />
      <text x="7.6" y="13" fontSize="6" fontStyle="italic" fill={G2}>fx</text>
    </>
  ),
  // --- Font
  fontGrow: () => (
    <>
      <path d="M1.5 13.5l4-10 4 10M3 10h5" {...s} />
      <path d="M11 6l2-3 2 3" {...s} />
    </>
  ),
  fontShrink: () => (
    <>
      <path d="M1.5 13.5l3.5-9 3.5 9M3 10.5h4" {...s} />
      <path d="M11 3.5l2 3 2-3" {...s} />
    </>
  ),
  bold: () => <path d="M4.5 2.5h4.2a2.8 2.8 0 010 5.6H4.5zM4.5 8.1h5a2.7 2.7 0 010 5.4h-5z" {...s} strokeWidth="1.7" />,
  italic: () => <path d="M6.5 2.5h6M3.5 13.5h6M9.5 2.5l-3 11" {...s} />,
  underline: () => <path d="M4.5 2.5v5a3.5 3.5 0 007 0v-5M3.5 14.5h9" {...s} />,
  strike: () => <path d="M3 8h10M11 4.5A3 3 0 008 2.5c-2 0-3 1-3 2.3S6 6.7 8 7M5 11.5a3 3 0 003 2c2 0 3-1 3-2.3" {...s} />,
  borders: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" {...s} strokeDasharray="1 1.5" />
      <path d="M2 13.5h12" stroke="currentColor" strokeWidth="1.6" />
    </>
  ),
  fillColor: () => (
    <>
      <path d="M3 7.5L7.5 3l4.5 4.5L7.5 12z" {...s} />
      <path d="M12.5 9s1.3 1.6 1.3 2.4a1.3 1.3 0 01-2.6 0c0-.8 1.3-2.4 1.3-2.4z" fill="currentColor" />
    </>
  ),
  fontColor: () => <path d="M4 12l4-10 4 10M5.5 8.5h5" {...s} />,
  // --- Alignment
  alignTop: () => <path d="M2.5 2.5h11M8 5v9M5.5 7.5L8 5l2.5 2.5" {...s} />,
  alignMiddle: () => <path d="M2.5 8h11M8 1.5v4M8 10.5v4M6 3.5l2 2 2-2M6 12.5l2-2 2 2" {...s} />,
  alignBottom: () => <path d="M2.5 13.5h11M8 2v9M5.5 8.5L8 11l2.5-2.5" {...s} />,
  orientation: () => (
    <>
      <path d="M3 12l3.5-8 3.5 8M4.3 9h4.4" {...s} />
      <path d="M11 13.5l2.5-2.5M13.5 13.5V11H11" {...s} />
    </>
  ),
  wrapText: () => <path d="M2 3.5h12M2 7.5h9.5a2 2 0 010 4H8M9.5 10L8 11.5 9.5 13M2 11.5h4" {...s} />,
  alignLeft: () => <path d="M2 3.5h12M2 6.5h8M2 9.5h12M2 12.5h8" {...s} />,
  alignCenter: () => <path d="M2 3.5h12M4 6.5h8M2 9.5h12M4 12.5h8" {...s} />,
  alignRight: () => <path d="M2 3.5h12M6 6.5h8M2 9.5h12M6 12.5h8" {...s} />,
  indentDecrease: () => <path d="M2 2.5h12M7 6h7M7 9.5h7M2 13h12M4.5 6L2 7.8l2.5 1.7" {...s} />,
  indentIncrease: () => <path d="M2 2.5h12M7 6h7M7 9.5h7M2 13h12M2 6l2.5 1.8L2 9.5" {...s} />,
  mergeCenter: () => (
    <>
      <rect x="1.5" y="3.5" width="13" height="9" {...s} />
      <path d="M4 8h8M5.5 6.5L4 8l1.5 1.5M10.5 6.5L12 8l-1.5 1.5" {...s} />
    </>
  ),
  mergeAcross: () => (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" {...s} />
      <path d="M1.5 8h13M4 5.3h8M4 10.7h8" {...s} />
    </>
  ),
  mergeCells: () => <rect x="1.5" y="3.5" width="13" height="9" {...s} />,
  unmerge: () => (
    <>
      <rect x="1.5" y="3.5" width="13" height="9" {...s} />
      <path d="M8 3.5v9M1.5 8h13" {...s} />
    </>
  ),
  // --- Number
  accounting: () => (
    <>
      <rect x="1.5" y="4.5" width="10" height="6" rx=".5" fill="#5EAA5E" stroke="#3d7a3d" />
      <circle cx="6.5" cy="7.5" r="1.5" fill="#d9f0d9" />
      <ellipse cx="11.5" cy="12" rx="3" ry="1.3" fill={Y} stroke="#b08a10" />
      <ellipse cx="11.5" cy="10.5" rx="3" ry="1.3" fill={Y} stroke="#b08a10" />
    </>
  ),
  percent: () => (
    <>
      <circle cx="4.5" cy="4.5" r="2" {...s} />
      <circle cx="11.5" cy="11.5" r="2" {...s} />
      <path d="M12.5 3L3.5 13" {...s} />
    </>
  ),
  comma: () => <path d="M8.2 9.5c.6 0 1 .5 1 1.2 0 1.5-1 2.8-2.5 3.3" {...s} strokeWidth="2" />,
  decimalIncrease: () => (
    <>
      <text x="0.5" y="7" fontSize="6" fill="currentColor">←0</text>
      <text x="3" y="14.5" fontSize="6" fill="currentColor">.00</text>
    </>
  ),
  decimalDecrease: () => (
    <>
      <text x="0.5" y="7" fontSize="6" fill="currentColor">.00</text>
      <text x="4" y="14.5" fontSize="6" fill="currentColor">→.0</text>
    </>
  ),
  // --- Editing
  autosum: () => <path d="M12 3.5H4L8.5 8 4 12.5h8" {...s} strokeWidth="1.3" />,
  fill: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1" {...s} />
      <path d="M8 5v6M5.5 8.5L8 11l2.5-2.5" stroke={B} strokeWidth="1.3" fill="none" />
    </>
  ),
  /** AutoFill Options tag: cells with a fill arrow. */
  autoFillOptions: () => (
    <>
      <path d="M1.5 2.5h8v8h-8zM1.5 6.5h8M5.5 2.5v8" {...s} />
      <path d="M11.5 6v7.5M9.5 11.5l2 2 2-2" stroke={G2} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  flashFill: () => (
    <>
      <path d="M2.5 3.5h5M2.5 7h5M2.5 10.5h3" {...s} />
      <path d="M11.5 1.5L8.5 8h3l-1.5 6.5 4.5-8h-3l1.5-5z" fill={Y} stroke={O} strokeWidth="0.8" strokeLinejoin="round" />
    </>
  ),
  series: () => (
    <>
      <path d="M2.5 2.5h5v11h-5zM2.5 6.2h5M2.5 9.8h5" {...s} />
      <path d="M10 4.5h1.5M10 8h3M10 11.5h4.5" stroke={B} strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </>
  ),
  clear: () => (
    <>
      <path d="M9 2.5l4.5 4.5-6 6H4.5L2.5 11z" {...s} />
      <path d="M5.5 6l4.5 4.5" stroke={R} strokeWidth="1.2" />
      <path d="M7.5 13h6" {...s} />
    </>
  ),
  sortAZ: () => (
    <>
      <text x="0" y="7" fontSize="6.5" fontWeight="700" fill="currentColor">A</text>
      <text x="0" y="15" fontSize="6.5" fontWeight="700" fill="currentColor">Z</text>
      <path d="M12 2v12M9.5 11.5L12 14l2.5-2.5" stroke={B} strokeWidth="1.3" fill="none" />
    </>
  ),
  sortZA: () => (
    <>
      <text x="0" y="7" fontSize="6.5" fontWeight="700" fill="currentColor">Z</text>
      <text x="0" y="15" fontSize="6.5" fontWeight="700" fill="currentColor">A</text>
      <path d="M12 2v12M9.5 11.5L12 14l2.5-2.5" stroke={B} strokeWidth="1.3" fill="none" />
    </>
  ),
  sortCustom: () => (
    <>
      <path d="M2 3.5h7M2 7.5h5M2 11.5h3" {...s} />
      <path d="M12 2v12M9.5 11.5L12 14l2.5-2.5" stroke={B} strokeWidth="1.3" fill="none" />
    </>
  ),
  filter: () => <path d="M2 2.5h12l-4.5 5.5v5l-3 1.5V8z" {...s} />,
  find: () => (
    <>
      <circle cx="6.5" cy="6.5" r="4" {...s} />
      <path d="M9.5 9.5l4.5 4.5" {...s} strokeWidth="1.6" />
    </>
  ),
  replace: () => (
    <>
      <path d="M2.5 4.5h7M7 2l2.5 2.5L7 7" {...s} />
      <path d="M13.5 11.5h-7M9 9l-2.5 2.5L9 14" {...s} />
    </>
  ),
  goto: () => <path d="M2 8h9M8 4.5L11.5 8 8 11.5M13.5 3v10" {...s} />,
  // --- Cells
  insertRow: () => (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" {...s} />
      <path d="M1.5 6h13M1.5 10h13" {...s} />
      <rect x="1.5" y="6" width="13" height="4" fill={B} opacity=".45" />
    </>
  ),
  insertCol: () => (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" {...s} />
      <path d="M6 1.5v13M10 1.5v13" {...s} />
      <rect x="6" y="1.5" width="4" height="13" fill={B} opacity=".45" />
    </>
  ),
  insertSheet: () => (
    <>
      <path d="M3.5 1.5h6l3 3v10h-9z" {...s} />
      <path d="M8 7v5M5.5 9.5h5" stroke={G} strokeWidth="1.3" />
    </>
  ),
  deleteRow: () => (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" {...s} />
      <path d="M1.5 6h13M1.5 10h13" {...s} />
      <path d="M5 6.5l6 3M11 6.5l-6 3" stroke={R} strokeWidth="1.3" />
    </>
  ),
  deleteCol: () => (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" {...s} />
      <path d="M6 1.5v13M10 1.5v13" {...s} />
      <path d="M6.5 5l3 6M9.5 5l-3 6" stroke={R} strokeWidth="1.3" />
    </>
  ),
  deleteSheet: () => (
    <>
      <path d="M3.5 1.5h6l3 3v10h-9z" {...s} />
      <path d="M6 7.5l4 4M10 7.5l-4 4" stroke={R} strokeWidth="1.3" />
    </>
  ),
  rowHeight: () => <path d="M1.5 3.5h13M1.5 12.5h13M8 5v6M6 6.5L8 5l2 1.5M6 9.5L8 11l2-1.5" {...s} />,
  colWidth: () => <path d="M3.5 1.5v13M12.5 1.5v13M5 8h6M6.5 6L5 8l1.5 2M9.5 6L11 8l-1.5 2" {...s} />,
  hide: () => (
    <>
      <path d="M1.5 8s2.5-4.5 6.5-4.5 6.5 4.5 6.5 4.5-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" {...s} />
      <path d="M2.5 13.5l11-11" {...s} />
    </>
  ),
  unhide: () => (
    <>
      <path d="M1.5 8s2.5-4.5 6.5-4.5 6.5 4.5 6.5 4.5-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" {...s} />
      <circle cx="8" cy="8" r="2" {...s} />
    </>
  ),
  rename: () => <path d="M2 13.5l.7-3L10.5 2.7l2.8 2.8-7.8 7.8zM9 4.2l2.8 2.8" {...s} />,
  tabColor: () => (
    <>
      <path d="M1.5 12.5V5h8l2 2v5.5" {...s} />
      <rect x="1.5" y="13" width="13" height="2" fill={R} />
    </>
  ),
  formatCells: () => (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" {...s} />
      <path d="M1.5 6h13M6 1.5v13" {...s} />
      <rect x="6" y="6" width="8.5" height="8.5" fill={B} opacity=".35" />
    </>
  ),
  duplicate: () => (
    <>
      <path d="M5.5 4.5h6l2.5 2.5v7.5h-8.5z" {...s} />
      <path d="M3.5 11.5h-1v-10h6l1 1" {...s} />
    </>
  ),
  lock: () => (
    <>
      <rect x="3.5" y="7" width="9" height="7" rx="1" {...s} />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" {...s} />
    </>
  ),
  // --- Border menu
  borderBottom: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" {...s} strokeDasharray="1 1.5" opacity=".6" />
      <path d="M2 13.5h12" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  borderTop: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" {...s} strokeDasharray="1 1.5" opacity=".6" />
      <path d="M2 2.5h12" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  borderLeft: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" {...s} strokeDasharray="1 1.5" opacity=".6" />
      <path d="M2.5 2v12" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  borderRight: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" {...s} strokeDasharray="1 1.5" opacity=".6" />
      <path d="M13.5 2v12" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  borderNone: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" {...s} strokeDasharray="1 1.5" opacity=".6" />
      <path d="M8 2.5v11M2.5 8h11" {...s} strokeDasharray="1 1.5" opacity=".6" />
    </>
  ),
  borderAll: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" {...s} />
      <path d="M8 2.5v11M2.5 8h11" {...s} />
    </>
  ),
  borderOutside: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" {...s} />
      <path d="M8 2.5v11M2.5 8h11" {...s} strokeDasharray="1 1.5" opacity=".6" />
    </>
  ),
  borderThickOutside: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 2.5v11M2.5 8h11" {...s} strokeDasharray="1 1.5" opacity=".6" />
    </>
  ),
  borderBottomDouble: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="10" {...s} strokeDasharray="1 1.5" opacity=".6" />
      <path d="M2 12h12M2 14h12" stroke="currentColor" />
    </>
  ),
  borderThickBottom: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" {...s} strokeDasharray="1 1.5" opacity=".6" />
      <path d="M2 13.2h12" stroke="currentColor" strokeWidth="2.4" />
    </>
  ),
  borderTopBottom: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" {...s} strokeDasharray="1 1.5" opacity=".6" />
      <path d="M2 2.5h12M2 13.5h12" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  borderTopThickBottom: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" {...s} strokeDasharray="1 1.5" opacity=".6" />
      <path d="M2 2.5h12" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 13.2h12" stroke="currentColor" strokeWidth="2.4" />
    </>
  ),
  borderTopDoubleBottom: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="10" {...s} strokeDasharray="1 1.5" opacity=".6" />
      <path d="M2 2.5h12M2 12h12M2 14h12" stroke="currentColor" />
    </>
  ),
  borderInside: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" {...s} strokeDasharray="1 1.5" opacity=".6" />
      <path d="M8 2.5v11M2.5 8h11" {...s} />
    </>
  ),
  // --- Conditional formatting
  highlightRules: () => (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" {...s} />
      <rect x="1.5" y="5.5" width="13" height="4" fill={R} opacity=".7" />
      <path d="M11 12.5l1.5-2 1.5 2" stroke={R} />
    </>
  ),
  topBottom: () => (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" {...s} />
      <rect x="1.5" y="1.5" width="13" height="4" fill={B} opacity=".7" />
      <text x="4" y="13" fontSize="6" fill="currentColor">10</text>
    </>
  ),
  dataBars: () => (
    <>
      <rect x="1.5" y="2" width="11" height="3" fill={B} />
      <rect x="1.5" y="6.5" width="7" height="3" fill={B} />
      <rect x="1.5" y="11" width="4" height="3" fill={B} />
    </>
  ),
  colorScales: () => (
    <>
      <rect x="1.5" y="1.5" width="13" height="4.3" fill="#63BE7B" />
      <rect x="1.5" y="5.8" width="13" height="4.3" fill="#FFEB84" />
      <rect x="1.5" y="10.1" width="13" height="4.3" fill="#F8696B" />
    </>
  ),
  iconSets: () => (
    <>
      <circle cx="4" cy="4" r="2.3" fill="#63BE7B" />
      <circle cx="4" cy="12" r="2.3" fill="#F8696B" />
      <path d="M8 4h6M8 12h6" {...s} />
      <circle cx="4" cy="8" r="2.3" fill={Y} />
      <path d="M8 8h6" {...s} />
    </>
  ),
  newRule: () => (
    <>
      <rect x="1.5" y="1.5" width="10" height="10" {...s} />
      <path d="M12.5 9.5v5M10 12h5" stroke={G} strokeWidth="1.4" />
    </>
  ),
  clearRules: () => (
    <>
      <rect x="1.5" y="1.5" width="10" height="10" {...s} />
      <path d="M10 10l4.5 4.5M14.5 10L10 14.5" stroke={R} strokeWidth="1.4" />
    </>
  ),
  manageRules: () => (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" {...s} />
      <path d="M4 5h8M4 8h8M4 11h5" {...s} />
    </>
  ),
  // --- Number format presets
  fmtGeneral: () => <text x="1" y="11.5" fontSize="7.5" fontWeight="700" fill="currentColor">ABC</text>,
  fmtNumber: () => <text x="0.5" y="11.5" fontSize="7.5" fontWeight="700" fill="currentColor">12</text>,
  fmtCurrency: () => <text x="3" y="12.5" fontSize="11" fill="currentColor">₹</text>,
  fmtAccounting: () => <text x="2" y="12.5" fontSize="10" fill="currentColor">₹₹</text>,
  fmtDate: () => (
    <>
      <rect x="2" y="3" width="12" height="11" rx="1" {...s} />
      <path d="M2 6.5h12M5 2v2.5M11 2v2.5" {...s} />
      <rect x="4.5" y="8.5" width="2" height="2" fill={B} />
    </>
  ),
  fmtTime: () => (
    <>
      <circle cx="8" cy="8" r="6" {...s} />
      <path d="M8 4.5V8l2.5 1.5" {...s} />
    </>
  ),
  fmtPercent: () => <text x="3" y="12" fontSize="10" fill="currentColor">%</text>,
  fmtFraction: () => <text x="2" y="12" fontSize="9" fill="currentColor">½</text>,
  fmtScientific: () => (
    <>
      <text x="1" y="12" fontSize="8" fill="currentColor">10</text>
      <text x="10" y="7" fontSize="5" fill="currentColor">2</text>
    </>
  ),
  fmtText: () => <text x="2" y="12" fontSize="9" fill="currentColor">ab</text>,
  // --- Misc
  fx: () => <text x="1.5" y="12" fontSize="10" fontStyle="italic" fontFamily="Cambria, Georgia, serif" fill="currentColor">fx</text>,
  calendar: () => (
    <>
      <rect x="2" y="3" width="12" height="11" rx="1" {...s} />
      <path d="M2 6.5h12M5 2v2.5M11 2v2.5" {...s} />
    </>
  ),
  clock: () => (
    <>
      <circle cx="8" cy="8" r="6" {...s} />
      <path d="M8 4.5V8l2.5 1.5" {...s} />
    </>
  ),
  omega: () => <path d="M3 13.5h3v-1.5A5 5 0 118 2.5a5 5 0 012 9.5v1.5h3" {...s} />,
  table: () => (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" {...s} />
      <rect x="1.5" y="2.5" width="13" height="3" fill={B} />
      <path d="M1.5 9h13M6 5.5v8M10 5.5v8" {...s} />
    </>
  ),
  tag: () => (
    <>
      <path d="M1.5 8.5l7-7h5v5l-7 7z" {...s} />
      <circle cx="11" cy="4.5" r="1" fill="currentColor" />
    </>
  ),
  calculator: () => (
    <>
      <rect x="3" y="1.5" width="10" height="13" rx="1" {...s} />
      <rect x="5" y="3.5" width="6" height="3" fill={G} />
      <path d="M5.5 9h1M9.5 9h1M5.5 12h1M9.5 12h1" {...s} />
    </>
  ),
  showFormulas: () => (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" {...s} />
      <text x="3.5" y="11" fontSize="7" fontStyle="italic" fill={G}>fx</text>
    </>
  ),
  freeze: () => (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" {...s} />
      <path d="M1.5 5.5h13M5.5 1.5v13" stroke={B} strokeWidth="1.4" />
    </>
  ),
  freezeRow: () => (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" {...s} />
      <path d="M1.5 5.5h13" stroke={B} strokeWidth="1.4" />
    </>
  ),
  freezeCol: () => (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" {...s} />
      <path d="M5.5 1.5v13" stroke={B} strokeWidth="1.4" />
    </>
  ),
  gridlines: () => (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" {...s} />
      <path d="M1.5 6h13M1.5 10.5h13M6 1.5v13M10.5 1.5v13" {...s} opacity=".6" />
    </>
  ),
  zoom: () => (
    <>
      <circle cx="6.5" cy="6.5" r="4.5" {...s} />
      <path d="M10 10l4.5 4.5M4.5 6.5h4M6.5 4.5v4" {...s} />
    </>
  ),
  normalView: () => (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" {...s} />
      <path d="M1.5 6h13M1.5 9.5h13M6 2.5v11M10 2.5v11" {...s} opacity=".7" />
    </>
  ),
  pageLayoutView: () => (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" {...s} />
      <rect x="3.5" y="4.5" width="9" height="7" {...s} />
    </>
  ),
  pageBreakView: () => (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" {...s} />
      <path d="M8 2.5v11" stroke={B} strokeDasharray="1.5 1.5" />
    </>
  ),
  keyboard: () => (
    <>
      <rect x="1" y="4" width="14" height="8.5" rx="1" {...s} />
      <path d="M3.5 6.5h1M6 6.5h1M8.5 6.5h1M11 6.5h1.5M5 10h6" {...s} />
    </>
  ),
  link: () => <path d="M6.5 9.5l3-3M7 4.5l1.3-1.3a2.5 2.5 0 013.5 3.5L10.5 8M9 11.5l-1.3 1.3a2.5 2.5 0 01-3.5-3.5L5.5 8" {...s} />,
  comment: () => <path d="M2 2.5h12v8.5H7l-3 2.5V11H2z" {...s} />,
  image: () => (
    <>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" {...s} />
      <circle cx="5.5" cy="6" r="1.3" fill={Y} />
      <path d="M1.5 12l4-4 3 3 2-2 4 4" {...s} />
    </>
  ),
  chart: () => (
    <>
      <rect x="2" y="8" width="3" height="6" fill={B} />
      <rect x="6.5" y="4" width="3" height="10" fill={O} />
      <rect x="11" y="6.5" width="3" height="7.5" fill={G} />
    </>
  ),
  spelling: () => (
    <>
      <text x="0.5" y="8" fontSize="7" fontWeight="700" fill="currentColor">abc</text>
      <path d="M6 12l2 2 5-5" stroke={B} strokeWidth="1.5" fill="none" />
    </>
  ),
  stats: () => <text x="0" y="11.5" fontSize="7" fontWeight="700" fill="currentColor">123</text>,
  database: () => (
    <>
      <ellipse cx="8" cy="3.5" rx="5.5" ry="2" {...s} />
      <path d="M2.5 3.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" {...s} />
    </>
  ),
  removeDuplicates: () => (
    <>
      <rect x="1.5" y="1.5" width="9" height="9" {...s} />
      <rect x="5.5" y="5.5" width="9" height="9" fill="var(--menu-bg, #2b2b2b)" stroke="currentColor" />
      <path d="M8 8l4 4M12 8l-4 4" stroke={R} strokeWidth="1.3" />
    </>
  ),
  textToColumns: () => (
    <>
      <rect x="1.5" y="2.5" width="5" height="11" {...s} />
      <rect x="9.5" y="2.5" width="5" height="11" {...s} />
      <path d="M6.5 8h3M8 6.5L9.5 8 8 9.5" stroke={B} fill="none" />
    </>
  ),
  addins: () => (
    <>
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx=".8" fill={R} />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx=".8" fill={R} opacity=".75" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx=".8" fill={R} opacity=".75" />
      <rect x="9" y="9" width="5.5" height="5.5" rx=".8" {...s} stroke={R} />
    </>
  ),
  accessibility: () => (
    <>
      <circle cx="8" cy="3" r="1.3" fill="currentColor" />
      <path d="M3 6h10M8 6v4M8 10l-2.5 4.5M8 10l2.5 4.5" {...s} />
    </>
  ),
  share: () => <path d="M10.5 2.5l3.5 3-3.5 3M14 5.5H8.5a4 4 0 00-4 4v1M2.5 7v6.5h10v-2" {...s} />,
  warning: () => (
    <>
      <path d="M8 2L1.5 13.5h13z" fill={Y} stroke="#8a6d00" strokeLinejoin="round" />
      <path d="M8 6v4" stroke="#222" strokeWidth="1.3" />
      <circle cx="8" cy="12" r=".7" fill="#222" />
    </>
  ),
  errorCircle: () => (
    <>
      <circle cx="8" cy="8" r="6.5" fill={R} />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" strokeWidth="1.4" />
    </>
  ),
  infoCircle: () => (
    <>
      <circle cx="8" cy="8" r="6.5" fill={B} />
      <path d="M8 7v4.5" stroke="#fff" strokeWidth="1.4" />
      <circle cx="8" cy="4.8" r=".8" fill="#fff" />
    </>
  ),
  questionCircle: () => (
    <>
      <circle cx="8" cy="8" r="6.5" fill={B} />
      <path d="M6.2 6.2a1.9 1.9 0 113.2 1.3c-.5.5-1.4.9-1.4 1.9" stroke="#fff" strokeWidth="1.3" fill="none" />
      <circle cx="8" cy="11.6" r=".8" fill="#fff" />
    </>
  ),
  training: () => (
    <>
      <path d="M1 6l7-3.5L15 6 8 9.5z" {...s} />
      <path d="M4 7.5v3.5c0 1 1.8 2 4 2s4-1 4-2V7.5M15 6v4" {...s} />
    </>
  ),
  themes: () => (
    <>
      <rect x="1.5" y="1.5" width="6" height="6" fill={B} />
      <rect x="8.5" y="1.5" width="6" height="6" fill={O} />
      <rect x="1.5" y="8.5" width="6" height="6" fill={G} />
      <rect x="8.5" y="8.5" width="6" height="6" fill={P} />
    </>
  ),
  margins: () => (
    <>
      <rect x="2.5" y="1.5" width="11" height="13" {...s} />
      <rect x="4.5" y="3.5" width="7" height="9" {...s} strokeDasharray="1 1" />
    </>
  ),
  print: () => (
    <>
      <path d="M4.5 5.5v-4h7v4" {...s} />
      <rect x="1.5" y="5.5" width="13" height="6" rx="1" {...s} />
      <path d="M4.5 9.5h7v5h-7z" {...s} />
    </>
  ),
  switchWindow: () => (
    <>
      <rect x="1.5" y="4.5" width="9" height="8" {...s} />
      <path d="M5.5 4.5v-2h9v8h-4" {...s} />
    </>
  ),
  newWindow: () => (
    <>
      <rect x="1.5" y="2.5" width="11" height="10" {...s} />
      <path d="M1.5 5h11M13 9.5v5M10.5 12h5" {...s} />
    </>
  ),
  splitView: () => (
    <>
      <rect x="1.5" y="1.5" width="13" height="13" {...s} />
      <path d="M8 1.5v13M1.5 8h13" {...s} />
    </>
  ),
  eraser: () => <path d="M9 2.5l4.5 4.5-6 6H4.5L2.5 11zM7.5 13h6" {...s} />,
  chartColumn: () => (
    <>
      <path d="M1.5 14.5h13" {...s} />
      <rect x="2.5" y="8" width="2.6" height="6" fill={B} />
      <rect x="6.7" y="4" width="2.6" height="10" fill={O} />
      <rect x="10.9" y="6" width="2.6" height="8" fill={G} />
    </>
  ),
  chartBar: () => (
    <>
      <path d="M1.5 1.5v13" {...s} />
      <rect x="2" y="2.5" width="8" height="2.6" fill={B} />
      <rect x="2" y="6.7" width="12" height="2.6" fill={O} />
      <rect x="2" y="10.9" width="6" height="2.6" fill={G} />
    </>
  ),
  chartLine: () => (
    <>
      <path d="M1.5 14.5h13M1.5 1.5v13" {...s} />
      <path d="M2.5 11l3.5-4 3 2.5 4.5-6" fill="none" stroke={B} strokeWidth="1.4" strokeLinejoin="round" />
    </>
  ),
  chartArea: () => (
    <>
      <path d="M1.5 14.5h13" {...s} />
      <path d="M1.5 14V9l4-4 3.5 3 5.5-5v11z" fill={B} fillOpacity="0.75" />
    </>
  ),
  chartPie: () => (
    <>
      <path d="M8 8V1.5A6.5 6.5 0 1 1 1.6 9.2z" fill={B} />
      <path d="M7 7V1.6A6.5 6.5 0 0 0 1.5 7z" fill={O} />
    </>
  ),
  chartDoughnut: () => (
    <>
      <circle cx="8" cy="8" r="5" fill="none" stroke={B} strokeWidth="3" />
      <path d="M8 3a5 5 0 0 1 5 5" fill="none" stroke={O} strokeWidth="3" />
    </>
  ),
  chartScatter: () => (
    <>
      <path d="M1.5 14.5h13M1.5 1.5v13" {...s} />
      <circle cx="4.5" cy="10.5" r="1.2" fill={B} />
      <circle cx="7" cy="7.5" r="1.2" fill={B} />
      <circle cx="10" cy="8.5" r="1.2" fill={O} />
      <circle cx="12" cy="4" r="1.2" fill={O} />
    </>
  ),
  transpose: () => <path d="M3 5.5h8l-2-2M13 10.5H5l2 2M11 5.5v6M5 10.5v-6" {...s} />,
  list: () => <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.5M2.5 8h.5M2.5 12h.5" {...s} />,
  health: () => (
    <>
      <path d="M8 1.5l5.5 2v4.2c0 3.2-2.4 5.6-5.5 6.8-3.1-1.2-5.5-3.6-5.5-6.8V3.5z" fill="none" stroke={G} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M5.3 8.2l1.9 1.9 3.6-3.8" fill="none" stroke={G} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  recover: () => (
    <>
      <path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2M4.8 2.3v2.5h2.5" {...s} />
      <path d="M8 5.5V8l2 1.5" {...s} />
    </>
  ),
  history: () => (
    <>
      <circle cx="8" cy="8" r="6" {...s} />
      <path d="M8 4.5V8l2.5 1.5" {...s} />
    </>
  ),
};

const large: Record<string, Draw> = {
  autosum: () => <path d="M25 5H7l10 11L7 27h18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />,
  paste: () => (
    <>
      <rect x="4" y="5" width="17" height="22" rx="1.5" fill="#C8A26E" stroke="#8a6b3f" />
      <rect x="8.5" y="2.5" width="8" height="5" rx="1" fill="#6d6d6d" stroke="#444" />
      <rect x="13" y="12.5" width="15" height="17" rx="1" fill={W} stroke="#8c8c8c" />
      <path d="M16 17h9M16 20.5h9M16 24h6" stroke="#9a9a9a" />
    </>
  ),
  conditionalFormatting: () => (
    <>
      <rect x="3.5" y="3.5" width="25" height="25" fill={W} stroke="#8c8c8c" />
      <path d="M3.5 11.8h25M3.5 20.2h25M11.8 3.5v25M20.2 3.5v25" stroke="#b5b5b5" />
      <rect x="12" y="4" width="8" height="7.5" fill={R} />
      <rect x="20.5" y="12" width="7.5" height="8" fill={Y} />
      <rect x="4" y="20.5" width="7.5" height="7.5" fill={B} />
      <rect x="20.5" y="20.5" width="7.5" height="7.5" fill={R} opacity=".75" />
    </>
  ),
  formatAsTable: () => (
    <>
      <rect x="3.5" y="4.5" width="25" height="23" fill={W} stroke="#5b8bd6" />
      <rect x="3.5" y="4.5" width="25" height="5.5" fill={B} />
      <rect x="3.5" y="15.5" width="25" height="5.5" fill="#bcd4f6" />
      <path d="M3.5 10h25M3.5 15.5h25M3.5 21h25M12 10v17.5M20.5 10v17.5" stroke="#5b8bd6" />
    </>
  ),
  cellStyles: () => (
    <>
      <rect x="3.5" y="5.5" width="25" height="21" fill={W} stroke="#8c8c8c" />
      <rect x="6" y="8" width="9" height="7" fill="#C6EFCE" stroke="#006100" strokeWidth=".6" />
      <rect x="17" y="8" width="9" height="7" fill="#FFC7CE" stroke="#9C0006" strokeWidth=".6" />
      <rect x="6" y="17" width="9" height="7" fill="#FFEB9C" stroke="#9C5700" strokeWidth=".6" />
      <rect x="17" y="17" width="9" height="7" fill="#F2F2F2" stroke="#7F7F7F" strokeWidth=".6" />
    </>
  ),
  insert: () => (
    <>
      <rect x="3.5" y="5.5" width="21" height="21" fill={W} stroke="#8c8c8c" />
      <path d="M3.5 12.5h21M3.5 19.5h21M10.5 5.5v21M17.5 5.5v21" stroke="#b5b5b5" />
      <rect x="3.5" y="12.5" width="21" height="7" fill="#9fc3f3" stroke="#5b8bd6" />
      <circle cx="25" cy="9" r="5.5" fill={G} />
      <path d="M25 6v6M22 9h6" stroke="#fff" strokeWidth="1.8" />
    </>
  ),
  delete: () => (
    <>
      <rect x="3.5" y="5.5" width="21" height="21" fill={W} stroke="#8c8c8c" />
      <path d="M3.5 12.5h21M3.5 19.5h21M10.5 5.5v21M17.5 5.5v21" stroke="#b5b5b5" />
      <rect x="3.5" y="12.5" width="21" height="7" fill="#f6b4ae" stroke={R} />
      <circle cx="25" cy="9" r="5.5" fill={R} />
      <path d="M22.5 6.5l5 5M27.5 6.5l-5 5" stroke="#fff" strokeWidth="1.8" />
    </>
  ),
  format: () => (
    <>
      <rect x="3.5" y="5.5" width="21" height="21" fill={W} stroke="#8c8c8c" />
      <path d="M3.5 12.5h21M3.5 19.5h21M10.5 5.5v21M17.5 5.5v21" stroke="#b5b5b5" />
      <rect x="10.5" y="12.5" width="7" height="7" fill="#9fc3f3" stroke="#5b8bd6" />
      <path d="M20 26l1-4 7-7 3 3-7 7z" fill={Y} stroke="#8a6d00" strokeLinejoin="round" />
    </>
  ),
  sortFilter: () => (
    <>
      <text x="2" y="13" fontSize="11" fontWeight="700" fill="currentColor">A</text>
      <text x="2" y="27" fontSize="11" fontWeight="700" fill="currentColor">Z</text>
      <path d="M15 5v21M11.5 22.5L15 26l3.5-3.5" stroke={B} strokeWidth="1.6" fill="none" />
      <path d="M19 9h11l-4.2 5.5v6.5l-2.6 1.5v-8z" fill={W} stroke="currentColor" strokeLinejoin="round" />
    </>
  ),
  findSelect: () => (
    <>
      <circle cx="13" cy="13" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M19.5 19.5l8.5 8.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="13" cy="13" r="6.5" fill="#bcd4f6" opacity=".6" />
    </>
  ),
  addins: () => (
    <>
      <rect x="3" y="3" width="11.5" height="11.5" rx="1.5" fill={R} />
      <rect x="17.5" y="3" width="11.5" height="11.5" rx="1.5" fill={R} opacity=".8" />
      <rect x="3" y="17.5" width="11.5" height="11.5" rx="1.5" fill={R} opacity=".8" />
      <rect x="18" y="18" width="10.5" height="10.5" rx="1.5" fill="none" stroke={R} strokeWidth="1.5" />
    </>
  ),
  table: () => (
    <>
      <rect x="3.5" y="4.5" width="25" height="23" fill={W} stroke="#5b8bd6" />
      <rect x="3.5" y="4.5" width="25" height="5.5" fill={B} />
      <path d="M3.5 10h25M3.5 15.8h25M3.5 21.6h25M12 10v17.5M20.5 10v17.5" stroke="#5b8bd6" />
    </>
  ),
  pivot: () => (
    <>
      <rect x="3.5" y="4.5" width="25" height="23" fill={W} stroke="#8c8c8c" />
      <rect x="3.5" y="4.5" width="25" height="5" fill="#bcd4f6" />
      <rect x="3.5" y="4.5" width="7" height="23" fill="#bcd4f6" />
      <path d="M16 15h9M20.5 15v9M13 21.5l3 3 3-3" stroke={B} strokeWidth="1.4" fill="none" />
    </>
  ),
  pictures: () => (
    <>
      <rect x="3.5" y="5.5" width="25" height="21" rx="1.5" fill={W} stroke="#8c8c8c" />
      <circle cx="11" cy="12" r="2.5" fill={Y} />
      <path d="M4 25l8-8 5 5 4-4 7 7" fill="#7cc27c" stroke="#3d7a3d" />
    </>
  ),
  charts: () => (
    <>
      <rect x="4" y="16" width="6" height="12" fill={B} />
      <rect x="13" y="7" width="6" height="21" fill={O} />
      <rect x="22" y="12" width="6" height="16" fill={G} />
      <path d="M2.5 28.5h27" stroke="currentColor" />
    </>
  ),
  fx: () => (
    <>
      <rect x="3.5" y="5.5" width="25" height="21" rx="1.5" fill="none" stroke="currentColor" />
      <text x="7" y="22" fontSize="15" fontStyle="italic" fontFamily="Cambria, Georgia, serif" fill="currentColor">fx</text>
    </>
  ),
  symbol: () => <text x="6" y="25" fontSize="22" fill="currentColor">Ω</text>,
  nameManager: () => (
    <>
      <path d="M3.5 16l11-11h10v10l-11 11z" fill="#bcd4f6" stroke="#5b8bd6" strokeLinejoin="round" />
      <circle cx="20.5" cy="9.5" r="2" fill={W} stroke="#5b8bd6" />
      <path d="M8 16h8M10 20h6" stroke="#2b5797" />
    </>
  ),
  getData: () => (
    <>
      <ellipse cx="13" cy="7" rx="9" ry="3.5" fill="#bcd4f6" stroke="#5b8bd6" />
      <path d="M4 7v16c0 2 4 3.5 9 3.5s9-1.5 9-3.5V7" fill="#bcd4f6" stroke="#5b8bd6" />
      <path d="M4 15c0 2 4 3.5 9 3.5s9-1.5 9-3.5" fill="none" stroke="#5b8bd6" />
      <rect x="18" y="17" width="11" height="12" fill={W} stroke={G} />
      <path d="M20.5 20l6 6M26.5 20l-6 6" stroke={G} strokeWidth="1.4" />
    </>
  ),
  sort: () => (
    <>
      <rect x="3.5" y="4.5" width="17" height="23" fill={W} stroke="#8c8c8c" />
      <text x="6" y="14" fontSize="8" fontWeight="700" fill="#333">A</text>
      <text x="6" y="24" fontSize="8" fontWeight="700" fill="#333">Z</text>
      <path d="M25 5v21M21.5 22.5L25 26l3.5-3.5" stroke={B} strokeWidth="1.8" fill="none" />
    </>
  ),
  filter: () => <path d="M3.5 5.5h25l-9.5 11v9l-6 3.5v-12.5z" fill={W} stroke="currentColor" strokeLinejoin="round" />,
  removeDuplicates: () => (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" fill={W} stroke="#8c8c8c" />
      <rect x="11.5" y="11.5" width="17" height="17" fill={W} stroke="#8c8c8c" />
      <path d="M15.5 15.5l9 9M24.5 15.5l-9 9" stroke={R} strokeWidth="2" />
    </>
  ),
  textToColumns: () => (
    <>
      <rect x="3.5" y="5.5" width="10" height="21" fill={W} stroke="#8c8c8c" />
      <rect x="18.5" y="5.5" width="10" height="21" fill={W} stroke="#8c8c8c" />
      <path d="M12 16h8M17 12.5l3.5 3.5-3.5 3.5" stroke={B} strokeWidth="1.8" fill="none" />
    </>
  ),
  spelling: () => (
    <>
      <text x="2" y="15" fontSize="12" fontWeight="700" fill="currentColor">abc</text>
      <path d="M11 22l4 4 10-10" stroke={B} strokeWidth="2.5" fill="none" />
    </>
  ),
  stats: () => (
    <>
      <rect x="3.5" y="4.5" width="25" height="23" rx="1.5" fill={W} stroke="#8c8c8c" />
      <text x="6" y="21" fontSize="11" fontWeight="700" fill="#2b5797">123</text>
    </>
  ),
  normalView: () => (
    <>
      <rect x="3.5" y="4.5" width="25" height="23" fill={W} stroke="#8c8c8c" />
      <path d="M3.5 10.5h25M3.5 16.5h25M3.5 22.5h25M11.5 4.5v23M19.5 4.5v23" stroke="#b5b5b5" />
    </>
  ),
  pageBreakView: () => (
    <>
      <rect x="3.5" y="4.5" width="25" height="23" fill={W} stroke="#8c8c8c" />
      <path d="M16 4.5v23" stroke={B} strokeWidth="1.8" strokeDasharray="3 2" />
      <text x="6" y="19" fontSize="7" fill="#999">1</text>
      <text x="20" y="19" fontSize="7" fill="#999">2</text>
    </>
  ),
  pageLayoutView: () => (
    <>
      <rect x="5.5" y="2.5" width="21" height="27" fill={W} stroke="#8c8c8c" />
      <rect x="8.5" y="6.5" width="15" height="19" fill="none" stroke="#b5b5b5" strokeDasharray="2 1.5" />
    </>
  ),
  zoom: () => (
    <>
      <circle cx="13" cy="13" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M19.5 19.5l8.5 8.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M9 13h8M13 9v8" stroke={B} strokeWidth="1.8" />
    </>
  ),
  zoom100: () => (
    <>
      <rect x="3.5" y="5.5" width="25" height="21" rx="1.5" fill={W} stroke="#8c8c8c" />
      <text x="5.5" y="20.5" fontSize="10" fontWeight="700" fill="#2b5797">100</text>
    </>
  ),
  zoomSelection: () => (
    <>
      <rect x="3.5" y="5.5" width="25" height="21" fill={W} stroke="#8c8c8c" />
      <rect x="9.5" y="11.5" width="13" height="9" fill="#bcd4f6" stroke={B} />
      <path d="M6 8.5h4M6 8.5v4M26 8.5h-4M26 8.5v4M6 23.5h4M6 23.5v-4M26 23.5h-4M26 23.5v-4" stroke={B} strokeWidth="1.4" />
    </>
  ),
  freeze: () => (
    <>
      <rect x="3.5" y="4.5" width="25" height="23" fill={W} stroke="#8c8c8c" />
      <path d="M3.5 11.5h25M11.5 4.5v23" stroke={B} strokeWidth="2" />
      <path d="M17 18h8M17 22h8" stroke="#b5b5b5" />
    </>
  ),
  newWindow: () => (
    <>
      <rect x="3.5" y="6.5" width="20" height="17" fill={W} stroke="#8c8c8c" />
      <rect x="3.5" y="6.5" width="20" height="4" fill={B} />
      <circle cx="24" cy="23" r="5.5" fill={G} />
      <path d="M24 20v6M21 23h6" stroke="#fff" strokeWidth="1.8" />
    </>
  ),
  switchWindows: () => (
    <>
      <rect x="8.5" y="4.5" width="20" height="16" fill={W} stroke="#8c8c8c" />
      <rect x="3.5" y="11.5" width="20" height="16" fill={W} stroke="#8c8c8c" />
      <rect x="3.5" y="11.5" width="20" height="4" fill={B} />
    </>
  ),
  help: () => (
    <>
      <circle cx="16" cy="16" r="12.5" fill={B} />
      <path d="M12 12.5a4 4 0 117 2.7c-1 1-3 1.8-3 3.8" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="16" cy="23" r="1.5" fill="#fff" />
    </>
  ),
  keyboard: () => (
    <>
      <rect x="2.5" y="8.5" width="27" height="16" rx="2" fill={W} stroke="#8c8c8c" />
      <path d="M6 13h2M10.5 13h2M15 13h2M19.5 13h2M24 13h2M6 17h2M10.5 17h2M15 17h2M19.5 17h6M9 21h14" stroke="#555" strokeWidth="1.6" />
    </>
  ),
  training: () => (
    <>
      <path d="M2 12l14-7 14 7-14 7z" fill="#bcd4f6" stroke="#5b8bd6" strokeLinejoin="round" />
      <path d="M8 15v7c0 2 3.6 4 8 4s8-2 8-4v-7" fill="none" stroke="#5b8bd6" />
      <path d="M30 12v8" stroke="#5b8bd6" strokeWidth="1.5" />
    </>
  ),
  about: () => (
    <>
      <circle cx="16" cy="16" r="12.5" fill={B} />
      <path d="M16 14v9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="9.5" r="1.7" fill="#fff" />
    </>
  ),
  feedback: () => (
    <>
      <path d="M4 5.5h24v16H14l-6 5v-5H4z" fill="#bcd4f6" stroke="#5b8bd6" strokeLinejoin="round" />
      <path d="M9 11h14M9 15.5h10" stroke="#2b5797" strokeWidth="1.5" />
    </>
  ),
  themes: () => (
    <>
      <rect x="3" y="3" width="12" height="12" rx="1" fill={B} />
      <rect x="17" y="3" width="12" height="12" rx="1" fill={O} />
      <rect x="3" y="17" width="12" height="12" rx="1" fill={G} />
      <rect x="17" y="17" width="12" height="12" rx="1" fill={P} />
    </>
  ),
  margins: () => (
    <>
      <rect x="5.5" y="2.5" width="21" height="27" fill={W} stroke="#8c8c8c" />
      <rect x="9.5" y="6.5" width="13" height="19" fill="none" stroke={B} strokeDasharray="2 1.5" />
    </>
  ),
  orientationPage: () => (
    <>
      <rect x="4.5" y="8.5" width="23" height="16" fill={W} stroke="#8c8c8c" />
      <rect x="10.5" y="2.5" width="11" height="27" fill="none" stroke={B} strokeDasharray="2 1.5" />
    </>
  ),
  size: () => (
    <>
      <rect x="6.5" y="2.5" width="19" height="27" fill={W} stroke="#8c8c8c" />
      <path d="M10 8h12M10 12h12M10 16h8" stroke="#b5b5b5" />
    </>
  ),
  print: () => (
    <>
      <path d="M9 11V3.5h14V11" fill={W} stroke="#8c8c8c" />
      <rect x="3.5" y="11" width="25" height="12" rx="2" fill="#9a9a9a" stroke="#6d6d6d" />
      <rect x="9" y="18" width="14" height="10.5" fill={W} stroke="#8c8c8c" />
    </>
  ),
  calculator: () => (
    <>
      <rect x="6.5" y="2.5" width="19" height="27" rx="2" fill="#9a9a9a" stroke="#6d6d6d" />
      <rect x="9.5" y="5.5" width="13" height="6" fill="#d8f5e2" />
      <path d="M11 16h2M16 16h2M21 16h.5M11 20.5h2M16 20.5h2M11 25h2M16 25h2M21 20.5v5" stroke="#fff" strokeWidth="2" />
    </>
  ),
  showFormulas: () => (
    <>
      <rect x="3.5" y="5.5" width="25" height="21" fill={W} stroke="#8c8c8c" />
      <text x="7" y="21" fontSize="12" fontStyle="italic" fontFamily="Cambria, Georgia, serif" fill={G2}>fx</text>
    </>
  ),
  book: () => (
    <>
      <path d="M5.5 4.5h17a3 3 0 013 3v20h-17a3 3 0 01-3-3z" fill="#bcd4f6" stroke="#5b8bd6" />
      <path d="M5.5 24.5a3 3 0 013-3h17" fill="none" stroke="#5b8bd6" />
    </>
  ),
  comment: () => <path d="M4 5.5h24v16H14l-6 5v-5H4z" fill="#fff3c4" stroke="#b08a10" strokeLinejoin="round" />,
  link: () => (
    <path
      d="M13 19l6-6M14 9.5l2.5-2.5a5 5 0 017 7L21 16.5M18 22.5L15.5 25a5 5 0 01-7-7L11 15.5"
      stroke={B}
      strokeWidth="2.2"
      fill="none"
      strokeLinecap="round"
    />
  ),
  textbox: () => (
    <>
      <rect x="3.5" y="5.5" width="25" height="21" fill={W} stroke="#8c8c8c" />
      <text x="9" y="22" fontSize="15" fontWeight="700" fill="#333">A</text>
    </>
  ),
  accessibility: () => (
    <>
      <circle cx="16" cy="6" r="2.5" fill="currentColor" />
      <path d="M6 11h20M16 11v8M16 19l-5 9M16 19l5 9" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  protect: () => (
    <>
      <rect x="7.5" y="14.5" width="17" height="13" rx="1.5" fill={Y} stroke="#8a6d00" />
      <path d="M11 14.5v-4a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" fill="none" />
    </>
  ),
  dateTime: () => (
    <>
      <rect x="3.5" y="5.5" width="20" height="19" rx="1.5" fill={W} stroke="#8c8c8c" />
      <path d="M3.5 10.5h20" stroke={R} strokeWidth="3" />
      <circle cx="23" cy="22" r="7" fill={W} stroke="#5b8bd6" strokeWidth="1.4" />
      <path d="M23 18v4l2.5 1.5" stroke="#2b5797" strokeWidth="1.4" fill="none" />
    </>
  ),
};

export type IconName = string;

export function Icon({
  name,
  size = 16,
  className,
  style,
  color,
}: {
  name: IconName;
  size?: 16 | 20 | 24 | 32 | number;
  className?: string;
  style?: CSSProperties;
  color?: string;
}) {
  const useLarge = size >= 24 && large[name];
  const draw = useLarge ? large[name] : small[name] ?? large[name];
  const box = useLarge || (!small[name] && large[name]) ? 32 : 16;
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      style={{ ...style, ...(color ? { color } : null) }}
      aria-hidden="true"
      focusable="false"
    >
      {draw ? draw() : <rect x="2" y="2" width={box - 4} height={box - 4} fill="none" stroke="currentColor" />}
    </svg>
  );
}

/** Split icons with a colour bar (fill colour, font colour, borders). */
export function ColorBarIcon({ name, color }: { name: string; color: string }) {
  return (
    <span className="color-bar-icon">
      <Icon name={name} size={16} />
      <span className="color-bar" style={{ background: color || "transparent" }} />
    </span>
  );
}
