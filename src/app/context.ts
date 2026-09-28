import { createContext, useContext } from "react";
import type { AppInfo, RecentItem, Settings, TemplateMeta, WorkbookInfo } from "../api";

export interface AskButton {
  label: string;
  value: string;
  primary?: boolean;
}

export interface AppApi {
  info: AppInfo;
  settings: Settings;
  saveSettings: (s: Settings) => Promise<void>;
  recent: RecentItem[];
  refreshRecent: () => Promise<void>;
  setRecent: (r: RecentItem[]) => void;
  templates: TemplateMeta[];
  /** Workbook shown in this window, if any. */
  current: WorkbookInfo | null;
  newWorkbook: (template?: string) => Promise<void>;
  openPath: (path: string) => Promise<void>;
  browse: () => Promise<void>;
  ask: (title: string, message: string, buttons: AskButton[], icon?: string) => Promise<string>;
  error: (message: string) => void;
  /** Shows the start screen in this window (after closing its workbook). */
  showStart: () => void;
  openOptions: () => void;
}

export const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("AppContext missing");
  return ctx;
}

export const APP_NAME = "Sheets";
