import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage, type AppInfo, type RecentItem, type Settings, type TemplateMeta, type WorkbookInfo } from "./api";
import { AppContext, APP_NAME, type AppApi, type AskButton } from "./app/context";
import { OptionsDialog } from "./app/OptionsDialog";
import { TitleBar } from "./app/TitleBar";
import { Backstage } from "./backstage/Backstage";
import { MessageBox } from "./components/Dialog";
import { Icon } from "./components/Icon";
import { initLocale } from "./lib/formats";
import { WorkbookView } from "./workbook/WorkbookView";

interface Ask {
  title: string;
  message: string;
  buttons: AskButton[];
  icon?: string;
  resolve: (v: string) => void;
}

function applyTheme(theme: Settings["theme"]) {
  const resolved = theme === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : theme;
  document.documentElement.dataset.theme = resolved;
}

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [book, setBook] = useState<WorkbookInfo | null>(null);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [options, setOptions] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const bookRef = useRef<WorkbookInfo | null>(null);
  bookRef.current = book;
  const settingsRef = useRef<Settings | null>(null);
  settingsRef.current = settings;

  const ask = useCallback(
    (title: string, message: string, buttons: AskButton[], icon?: string) =>
      new Promise<string>((resolve) => setAsks((a) => [...a, { title, message, buttons, icon, resolve }])),
    [],
  );
  const error = useCallback(
    (message: string) => {
      ask(APP_NAME, message, [{ label: "OK", value: "ok", primary: true }], "errorCircle");
    },
    [ask],
  );

  const refreshRecent = useCallback(async () => {
    setRecent(await api.listRecent());
  }, []);

  // Route a created/opened workbook to this window or a new one (like Excel)
  const show = useCallback(
    async (wb: WorkbookInfo, alreadyOpen: boolean) => {
      const current = bookRef.current;
      if (alreadyOpen) {
        if (current?.id === wb.id) return;
        if (await api.focusBook(wb.id)) return;
      }
      if (!current) {
        setBook(wb);
        return;
      }
      // Replace an untouched blank workbook, otherwise open a new window
      const latest = await api.info(current.id).catch(() => null);
      if (latest && latest.untouched && !latest.dirty) {
        await api.close(current.id).catch(() => {});
        setBook(wb);
        return;
      }
      await api.openBookWindow(wb.id, wb.title);
    },
    [],
  );

  const newWorkbook = useCallback(
    async (template?: string) => {
      try {
        const wb = await api.newWorkbook(template);
        await show(wb, false);
      } catch (e) {
        error(errorMessage(e));
      }
    },
    [show, error],
  );

  const openPath = useCallback(
    async (path: string) => {
      try {
        const res = await api.openWorkbook(path);
        await show(res.info, res.alreadyOpen);
        refreshRecent();
        if (res.warning) ask(APP_NAME, res.warning, [{ label: "OK", value: "ok", primary: true }], "warning");
      } catch (e) {
        error(errorMessage(e));
        refreshRecent();
      }
    },
    [show, error, refreshRecent, ask],
  );

  const openPathRef = useRef(openPath);
  openPathRef.current = openPath;

  const browse = useCallback(async () => {
    const path = await openDialog({
      title: "Open",
      multiple: false,
      directory: false,
      filters: [
        { name: "All Workbooks", extensions: ["xlsx", "xlsm", "csv", "tsv", "txt"] },
        { name: "Excel Workbook", extensions: ["xlsx", "xlsm"] },
        { name: "CSV / Text", extensions: ["csv", "tsv", "txt"] },
      ],
    });
    if (typeof path === "string") await openPath(path);
  }, [openPath]);

  const saveSettings = useCallback(async (s: Settings) => {
    try {
      const saved = await api.updateSettings(s);
      setSettings(saved);
      applyTheme(saved.theme);
      const fresh = await api.appInfo();
      setInfo((old) => (old ? { ...fresh, startupFile: null } : fresh));
      initLocale(fresh.dayFirst);
    } catch (e) {
      error(errorMessage(e));
    }
  }, [error]);

  // Startup
  useEffect(() => {
    (async () => {
      try {
        const appInfo = await api.appInfo();
        applyTheme(appInfo.settings.theme);
        initLocale(appInfo.dayFirst);
        api.listTemplates().then(setTemplates).catch(() => {});
        refreshRecent().catch(() => {});
        // Decide what this window shows before rendering (and before binding it)
        const label = getCurrentWindow().label;
        const bound = await api.windowBook().catch(() => null);
        let initial: WorkbookInfo | null = null;
        if (bound) {
          // e.g. after a reload: keep showing the same workbook
          initial = await api.info(bound);
        } else if (label.startsWith("book-")) {
          initial = await api.info(label.slice(5));
        } else if (appInfo.startupFile) {
          const res = await api.openWorkbook(appInfo.startupFile);
          initial = res.info;
          if (res.warning) ask(APP_NAME, res.warning, [{ label: "OK", value: "ok", primary: true }], "warning");
        } else if (!appInfo.settings.showStartScreen) {
          initial = await api.newWorkbook();
        }
        setBook(initial);
        setSettings(appInfo.settings);
        setInfo(appInfo);
      } catch (e) {
        setFatal(errorMessage(e));
      }
    })();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => settingsRef.current?.theme === "system" && applyTheme("system");
    mq.addEventListener("change", onChange);
    // Block the browser context menu / reload shortcuts in production
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F5" && !e.ctrlKey) e.preventDefault();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key.toLowerCase() === "r" || e.key.toLowerCase() === "p")) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Drop .xlsx / .csv files onto the window to open them
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const files = event.payload.paths.filter((p) => /\.(xlsx|xlsm|csv|tsv|txt)$/i.test(p));
        files.forEach((p) => openPathRef.current(p));
      })
      .then((u) => (unlisten = u))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  // Files opened from the OS while the app runs (Finder / Explorer / Dock)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebviewWindow()
      .listen<string>("open-file", (event) => openPathRef.current(event.payload))
      .then((u) => (unlisten = u))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  // Tell the backend which workbook this window shows (after startup decided)
  useEffect(() => {
    if (!info) return;
    api.bindWindow(book?.id ?? null).catch(() => {});
    if (!book) getCurrentWindow().setTitle(APP_NAME).catch(() => {});
  }, [book?.id, info === null]);

  const ctx: AppApi | null = useMemo(
    () =>
      info && settings
        ? {
            info,
            settings,
            saveSettings,
            recent,
            refreshRecent,
            setRecent,
            templates,
            current: book,
            newWorkbook,
            showBook: (wb: WorkbookInfo) => show(wb, false),
            openPath,
            browse,
            ask,
            error,
            showStart: () => {
              setBook(null);
              refreshRecent();
            },
            openOptions: () => setOptions(true),
          }
        : null,
    [info, settings, recent, templates, book, saveSettings, refreshRecent, newWorkbook, show, openPath, browse, ask, error],
  );

  if (fatal) {
    return (
      <div className="fatal">
        <Icon name="errorCircle" size={32} />
        <p>{fatal}</p>
      </div>
    );
  }
  if (!ctx) return <div className="app-loading" />;

  const top = asks[0];
  return (
    <AppContext.Provider value={ctx}>
      {book ? (
        <WorkbookView key={book.id} info={book} />
      ) : (
        <div className="start-window">
          <TitleBar
            title={APP_NAME}
            right={
              <>
                <button className="tb-icon" title="Feedback" onClick={() => undefined}>
                  <Icon name="feedback" />
                </button>
                <button className="tb-icon" title="Help" onClick={() => undefined}>
                  <Icon name="help" />
                </button>
              </>
            }
          />
          <Backstage />
        </div>
      )}
      {options && <OptionsDialog settings={settings!} onSave={saveSettings} onClose={() => setOptions(false)} />}
      {top && (
        <MessageBox
          title={top.title}
          message={top.message.split("\n").map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          icon={top.icon}
          buttons={top.buttons}
          onClose={(value) => {
            top.resolve(value);
            setAsks((a) => a.slice(1));
          }}
        />
      )}
    </AppContext.Provider>
  );
}
