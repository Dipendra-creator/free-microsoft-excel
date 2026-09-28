// Platform differences (macOS keeps native window buttons and uses ⌘).

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * Shortcut text for the current platform. The app treats ⌘ like Ctrl, so on
 * macOS "Ctrl+Shift+L" is shown as "⇧⌘L" (Apple's modifier order ⌥⇧⌘).
 */
export function keyLabel(text: string): string;
export function keyLabel(text: string | undefined): string | undefined;
export function keyLabel(text: string | undefined): string | undefined {
  if (!text || !isMac) return text;
  return text.replace(/\b((?:(?:Ctrl|Alt|Shift)\+)+)([^\s,)]+)/g, (_m, mods: string, key: string) => {
    const alt = mods.includes("Alt+") ? "⌥" : "";
    const shift = mods.includes("Shift+") ? "⇧" : "";
    const cmd = mods.includes("Ctrl+") ? "⌘" : "";
    return `${alt}${shift}${cmd}${key}`;
  });
}
