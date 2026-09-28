// Number format presets for the ribbon and the Format Cells dialog.

let dayFirst = true;
let currencySymbol = "₹";

const REGION_CURRENCY: Record<string, string> = {
  IN: "₹",
  US: "$",
  CA: "$",
  AU: "$",
  NZ: "$",
  SG: "$",
  GB: "£",
  JP: "¥",
  CN: "¥",
  AE: "AED ",
  DE: "€",
  FR: "€",
  ES: "€",
  IT: "€",
  NL: "€",
  IE: "€",
};

export function initLocale(dayFirstPref: boolean) {
  dayFirst = dayFirstPref;
  try {
    const locale = new Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.split("-")[1]?.toUpperCase();
    if (region && REGION_CURRENCY[region]) currencySymbol = REGION_CURRENCY[region];
    else if (!region) currencySymbol = dayFirst ? "₹" : "$";
  } catch {
    /* keep defaults */
  }
}

export function isDayFirst() {
  return dayFirst;
}

export function currency() {
  return currencySymbol;
}

export interface FormatPreset {
  id: string;
  label: string;
  code: () => string;
  icon: string;
}

export const shortDate = () => (dayFirst ? "dd-mm-yyyy" : "m/d/yyyy");
export const longDate = () => (dayFirst ? "dddd, d mmmm yyyy" : "dddd, mmmm d, yyyy");
export const currencyFmt = () => `"${currencySymbol}"#,##0.00`;
export const accountingFmt = () =>
  `_("${currencySymbol}"* #,##0.00_);_("${currencySymbol}"* (#,##0.00);_("${currencySymbol}"* "-"??_);_(@_)`;

export const FORMAT_PRESETS: FormatPreset[] = [
  { id: "general", label: "General", code: () => "general", icon: "fmtGeneral" },
  { id: "number", label: "Number", code: () => "0.00", icon: "fmtNumber" },
  { id: "currency", label: "Currency", code: currencyFmt, icon: "fmtCurrency" },
  { id: "accounting", label: "Accounting", code: accountingFmt, icon: "fmtAccounting" },
  { id: "shortDate", label: "Short Date", code: shortDate, icon: "fmtDate" },
  { id: "longDate", label: "Long Date", code: longDate, icon: "fmtDate" },
  { id: "time", label: "Time", code: () => "h:mm:ss AM/PM", icon: "fmtTime" },
  { id: "percent", label: "Percentage", code: () => "0.00%", icon: "fmtPercent" },
  { id: "scientific", label: "Scientific", code: () => "0.00E+00", icon: "fmtScientific" },
  { id: "text", label: "Text", code: () => "@", icon: "fmtText" },
];

/** Name shown in the ribbon's number format box for a format code. */
export function formatCategory(code: string): string {
  const c = (code || "general").toLowerCase();
  if (c === "general") return "General";
  if (c === "@") return "Text";
  for (const p of FORMAT_PRESETS) if (p.code().toLowerCase() === c) return p.label;
  if (c.includes("e+")) return "Scientific";
  if (c.includes("%")) return "Percentage";
  if (c.startsWith("_(") || c.includes("* ")) return "Accounting";
  if (/[₹$€£¥]/.test(code)) return "Currency";
  if (/(^|[^"])[hs]+[:]/.test(c) || c.includes("am/pm")) {
    return /[dmy]/.test(c.replace(/am\/pm/, "")) ? "Custom" : "Time";
  }
  if (/[dmy]/.test(c.replace(/"[^"]*"/g, ""))) return "Date";
  if (/[0#]/.test(c)) return "Number";
  return "Custom";
}

export interface CategoryDef {
  id: string;
  label: string;
  description: string;
  samples: string[];
}

export function categoryDefs(): CategoryDef[] {
  const cur = currencySymbol;
  return [
    { id: "general", label: "General", description: "General format cells have no specific number format.", samples: ["general"] },
    {
      id: "number",
      label: "Number",
      description: "Number is used for general display of numbers.",
      samples: ["0", "0.00", "#,##0", "#,##0.00", "#,##0.00;[Red]-#,##0.00", "0.00;[Red]-0.00"],
    },
    {
      id: "currency",
      label: "Currency",
      description: "Currency formats are used for general monetary values.",
      samples: [`"${cur}"#,##0`, `"${cur}"#,##0.00`, `"${cur}"#,##0.00;[Red]-"${cur}"#,##0.00`, `"$"#,##0.00`, `"€"#,##0.00`, `"£"#,##0.00`],
    },
    {
      id: "accounting",
      label: "Accounting",
      description: "Accounting formats line up the currency symbols and decimal points in a column.",
      samples: [accountingFmt(), `_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)`],
    },
    {
      id: "date",
      label: "Date",
      description: "Date formats display date serial numbers as date values.",
      samples: [shortDate(), "dd/mm/yyyy", "m/d/yyyy", "yyyy-mm-dd", "d-mmm", "d-mmm-yy", "dd-mmm-yyyy", "mmm-yy", "mmmm d, yyyy", longDate()],
    },
    {
      id: "time",
      label: "Time",
      description: "Time formats display date and time serial numbers as time values.",
      samples: ["h:mm", "h:mm:ss", "h:mm AM/PM", "h:mm:ss AM/PM", "[h]:mm:ss", `${shortDate()} h:mm`],
    },
    { id: "percent", label: "Percentage", description: "Percentage formats multiply the cell value by 100 and display the result with a percent symbol.", samples: ["0%", "0.0%", "0.00%"] },
    { id: "scientific", label: "Scientific", description: "Scientific notation.", samples: ["0.00E+00", "0.0E+00", "##0.0E+0"] },
    { id: "text", label: "Text", description: "Text format cells are treated as text even when a number is in the cell.", samples: ["@"] },
    { id: "custom", label: "Custom", description: "Type the number format code, using one of the existing codes as a starting point.", samples: ["general", "0", "0.00", "#,##0", "#,##0.00", "0%", "0.00%", "0.00E+00", "@", "yyyy-mm-dd", "h:mm:ss"] },
  ];
}

/** "9 September" / "Yesterday" / "Today" style date used in the Recent list. */
export function friendlyDate(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days === 0) return `Today at ${time}`;
  if (days === 1) return `Yesterday at ${time}`;
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear() ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" };
  return d.toLocaleDateString(dayFirst ? "en-GB" : "en-US", opts);
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Excel serial for today (for Ctrl+;). */
export function todayInput(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return dayFirst ? `${dd}-${mm}-${d.getFullYear()}` : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

export function nowTimeInput(): string {
  const d = new Date();
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")} ${ampm}`;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return n.toExponential(4);
  // General format: at most 10 significant digits, like Excel's status bar
  const rounded = Number(n.toPrecision(10));
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 9 }).format(rounded);
}
