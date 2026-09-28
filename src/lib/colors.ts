// Office colour palette used by the Fill / Font colour pickers.

// Office 2023+ theme (the one paired with the Aptos font)
export const THEME_BASE = [
  { name: "White, Background 1", hex: "#FFFFFF" },
  { name: "Black, Text 1", hex: "#000000" },
  { name: "Light Gray, Background 2", hex: "#E8E8E8" },
  { name: "Dark Blue, Text 2", hex: "#0E2841" },
  { name: "Blue, Accent 1", hex: "#156082" },
  { name: "Orange, Accent 2", hex: "#E97132" },
  { name: "Green, Accent 3", hex: "#196B24" },
  { name: "Blue, Accent 4", hex: "#0F9ED5" },
  { name: "Purple, Accent 5", hex: "#A02B93" },
  { name: "Green, Accent 6", hex: "#4EA72E" },
];

export const STANDARD_COLORS = [
  { name: "Dark Red", hex: "#C00000" },
  { name: "Red", hex: "#FF0000" },
  { name: "Orange", hex: "#FFC000" },
  { name: "Yellow", hex: "#FFFF00" },
  { name: "Light Green", hex: "#92D050" },
  { name: "Green", hex: "#00B050" },
  { name: "Light Blue", hex: "#00B0F0" },
  { name: "Blue", hex: "#0070C0" },
  { name: "Dark Blue", hex: "#002060" },
  { name: "Purple", hex: "#7030A0" },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
}

/** tint > 0 lightens, tint < 0 darkens (Office semantics). */
export function tint(hex: string, t: number): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const nl = t >= 0 ? l + (1 - l) * t : l * (1 + t);
  return rgbToHex(...hslToRgb(h, s, nl));
}

/** 6 rows x 10 columns, like the Office colour picker. */
export function themeGrid(): { name: string; hex: string }[][] {
  const rows: { name: string; hex: string }[][] = [THEME_BASE];
  const variants = (i: number): [string, number][] => {
    if (i === 0)
      return [
        ["Darker 5%", -0.05],
        ["Darker 15%", -0.15],
        ["Darker 25%", -0.25],
        ["Darker 35%", -0.35],
        ["Darker 50%", -0.5],
      ];
    if (i === 1)
      return [
        ["Lighter 50%", 0.5],
        ["Lighter 35%", 0.35],
        ["Lighter 25%", 0.25],
        ["Lighter 15%", 0.15],
        ["Lighter 5%", 0.05],
      ];
    if (i === 2)
      return [
        ["Darker 10%", -0.1],
        ["Darker 25%", -0.25],
        ["Darker 50%", -0.5],
        ["Darker 75%", -0.75],
        ["Darker 90%", -0.9],
      ];
    if (i === 3)
      return [
        ["Lighter 90%", 0.9],
        ["Lighter 75%", 0.75],
        ["Lighter 50%", 0.5],
        ["Lighter 25%", 0.25],
        ["Darker 50%", -0.5],
      ];
    return [
      ["Lighter 80%", 0.8],
      ["Lighter 60%", 0.6],
      ["Lighter 40%", 0.4],
      ["Darker 25%", -0.25],
      ["Darker 50%", -0.5],
    ];
  };
  for (let row = 0; row < 5; row++) {
    rows.push(
      THEME_BASE.map((base, i) => {
        const [label, t] = variants(i)[row];
        return { name: `${base.name}, ${label}`, hex: tint(base.hex, t) };
      }),
    );
  }
  return rows;
}

export function isDark(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}
