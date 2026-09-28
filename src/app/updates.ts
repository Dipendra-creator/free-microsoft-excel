// Shared state of in-app updates. The backend checks, downloads and installs;
// every window mirrors its status through the "update-status" event.

import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { api, errorMessage, type UpdateStatus } from "../api";
import type { AskButton } from "./context";

let status: UpdateStatus | null = null;
let started = false;
const listeners = new Set<() => void>();
const panelListeners = new Set<() => void>();

function set(next: UpdateStatus) {
  status = next;
  for (const fn of listeners) fn();
}

function start() {
  if (started) return;
  started = true;
  api.updateStatus().then(set, () => {});
  listen<UpdateStatus>("update-status", (e) => set(e.payload)).catch(() => {});
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useUpdateStatus(): UpdateStatus | null {
  start();
  return useSyncExternalStore(subscribe, () => status);
}

/** Opens the update panel under the title-bar button. */
export function onOpenUpdatePanel(fn: () => void) {
  panelListeners.add(fn);
  return () => {
    panelListeners.delete(fn);
  };
}

export async function openUrl(url: string) {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export const updates = {
  async check(): Promise<UpdateStatus> {
    const s = await api.updateCheck();
    set(s);
    return s;
  },
  async download(): Promise<UpdateStatus> {
    const s = await api.updateDownload();
    set(s);
    return s;
  },
  /**
   * Restarts into the downloaded update after warning about unsaved
   * workbooks (they are kept and offered again after the restart).
   */
  async install(ask: (title: string, message: string, buttons: AskButton[], icon?: string) => Promise<string>): Promise<void> {
    const version = status?.version ?? "";
    const unsaved = await api.updateUnsaved().catch(() => [] as string[]);
    const list = unsaved.slice(0, 6).map((t) => `• ${t}`).join("\n") + (unsaved.length > 6 ? `\n• …and ${unsaved.length - 6} more` : "");
    const message = unsaved.length
      ? `Sheets will close and restart to install version ${version}.\n\nThese workbooks have unsaved changes:\n${list}\n\nThey are kept safely and offered again on the start screen right after the restart.`
      : `Sheets will close and restart to install version ${version}.`;
    const answer = await ask("Restart to update", message, [
      { label: "Restart and update", value: "ok", primary: true },
      { label: "Not now", value: "cancel" },
    ]);
    if (answer !== "ok") return;
    await api.updateInstall();
  },
  /** Help → Check for Updates: says the result instead of staying quiet. */
  async checkInteractive(ask: (title: string, message: string, buttons: AskButton[], icon?: string) => Promise<string>) {
    try {
      const s = await updates.check();
      if (s.phase === "available" || s.phase === "ready" || s.phase === "downloading") {
        for (const fn of panelListeners) fn();
      } else if (s.phase === "upToDate") {
        await ask("Check for Updates", `You're up to date. Sheets ${s.current} is the newest version.`, [{ label: "OK", value: "ok", primary: true }], "infoCircle");
      } else if (s.phase === "error") {
        await ask("Check for Updates", s.error ?? "Couldn't check for updates.", [{ label: "OK", value: "ok", primary: true }], "warning");
      }
    } catch (e) {
      await ask("Check for Updates", errorMessage(e), [{ label: "OK", value: "ok", primary: true }], "warning");
    }
  },
};

/** "What's new" is shown once per update. */
export function seenUpdateNote(version: string): boolean {
  try {
    return localStorage.getItem("sheets.updateNoteSeen") === version;
  } catch {
    return false;
  }
}

export function markUpdateNoteSeen(version: string) {
  try {
    localStorage.setItem("sheets.updateNoteSeen", version);
  } catch {
    /* storage unavailable: shown again next time */
  }
}
