import { useEffect, useState } from "react";
import { api, errorMessage, type RecoveryItem, type VersionItem, type WorkbookStats } from "../api";
import { APP_NAME, useApp } from "../app/context";
import { Icon } from "../components/Icon";
import { friendlyDate, greeting } from "../lib/formats";
import type { WorkbookController } from "../workbook/controller";
import { printBook, type PrintOptions } from "../workbook/print";
import { RecentList } from "./RecentList";
import { TemplateTile } from "./TemplateTile";

export type BackstagePage = "home" | "new" | "open" | "info" | "export" | "print" | "account" | "feedback";

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Workbooks recovered after a crash, or closed without saving (last 7 days). */
function RecoveryPanel({ kind, title, text }: { kind: "crashed" | "unsaved"; title: string; text: string }) {
  const app = useApp();
  const [items, setItems] = useState<RecoveryItem[]>([]);
  useEffect(() => {
    api
      .recoveryList()
      .then((list) => setItems(list.filter((i) => i.kind === kind)))
      .catch(() => {});
  }, [kind]);
  if (!items.length) return kind === "unsaved" ? <div className="recent-empty">No unsaved workbooks from the last 7 days.</div> : null;
  return (
    <div className="recovery-panel">
      <h2>
        <Icon name="recover" /> {title}
      </h2>
      <p className="muted small">{text}</p>
      {items.map((item) => (
        <div key={item.file} className="recovery-row">
          <Icon name="xlsx" size={24} />
          <div className="rr-name">
            <b title={item.originalPath ?? item.title}>{item.title}</b>
            <span className="muted small">
              {friendlyDate(item.savedAt)} · {fileSize(item.size)}
              {item.originalPath ? ` · ${item.originalPath}` : " · never saved"}
            </span>
          </div>
          <button
            className="btn primary"
            onClick={async () => {
              try {
                const info = await api.recoveryOpen(item.file);
                setItems((list) => list.filter((i) => i.file !== item.file));
                await app.showBook(info);
              } catch (e) {
                app.error(errorMessage(e));
              }
            }}
          >
            Open
          </button>
          <button
            className="btn"
            onClick={async () => {
              const answer = await app.ask(APP_NAME, `Delete the recovered copy of '${item.title}'? This can't be undone.`, [
                { label: "Delete", value: "delete", primary: true },
                { label: "Cancel", value: "cancel" },
              ]);
              if (answer !== "delete") return;
              const list = await api.recoveryDiscard(item.file);
              setItems(list.filter((i) => i.kind === kind));
            }}
          >
            Discard
          </button>
        </div>
      ))}
    </div>
  );
}

export interface BookActions {
  ctl: WorkbookController;
  back: () => void;
  save: () => Promise<boolean>;
  saveAs: () => Promise<boolean>;
  exportAs: (ext: "csv" | "tsv" | "xlsx") => Promise<void>;
  close: () => Promise<void>;
}

function HomePage({ onMore }: { onMore: () => void }) {
  const app = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<"recent" | "pinned">("recent");
  const tiles = app.templates.slice(0, 8);
  return (
    <div className="bs-page home-page">
      <h1 className="bs-greeting">{greeting()}</h1>
      <RecoveryPanel
        kind="crashed"
        title="Document Recovery"
        text="Sheets closed unexpectedly. These workbooks were recovered from the last AutoRecover snapshot. Open them and save the versions you want to keep."
      />
      <button className="bs-section-toggle" onClick={() => setCollapsed(!collapsed)}>
        <Icon name={collapsed ? "chevronRight" : "chevronDown"} size={12} />
        <span>New</span>
      </button>
      {!collapsed && (
        <>
          <div className="tile-row">
            <TemplateTile blank selected onOpen={() => app.newWorkbook()} />
            {tiles.map((t) => (
              <TemplateTile key={t.id} meta={t} onOpen={() => app.newWorkbook(t.id)} />
            ))}
          </div>
          <div className="more-templates">
            <button className="link-btn" onClick={onMore}>
              More templates <Icon name="arrowRight" size={14} />
            </button>
          </div>
        </>
      )}
      <div className="bs-tabs">
        <button className={tab === "recent" ? "active" : ""} onClick={() => setTab("recent")}>
          Recent
        </button>
        <button className={tab === "pinned" ? "active" : ""} onClick={() => setTab("pinned")}>
          Pinned
        </button>
      </div>
      <RecentList filter={tab === "pinned" ? "pinned" : undefined} />
    </div>
  );
}

function NewPage() {
  const app = useApp();
  const [q, setQ] = useState("");
  const list = app.templates.filter((t) => !q || `${t.name} ${t.description} ${t.category}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="bs-page">
      <h1 className="bs-title">New</h1>
      <div className="tile-row wrap">
        <TemplateTile blank selected onOpen={() => app.newWorkbook()} />
      </div>
      <div className="bs-search">
        <Icon name="search" />
        <input placeholder="Search for templates" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="tile-row wrap">
        {list.map((t) => (
          <TemplateTile key={t.id} meta={t} onOpen={() => app.newWorkbook(t.id)} />
        ))}
        {list.length === 0 && <div className="recent-empty">No templates match your search.</div>}
      </div>
      <p className="muted small bs-note">
        Organisation templates will appear here once the template library is connected to the database.
      </p>
    </div>
  );
}

function OpenPage() {
  const app = useApp();
  const [source, setSource] = useState<"recent" | "unsaved">("recent");
  return (
    <div className="bs-page">
      <h1 className="bs-title">Open</h1>
      <div className="open-layout">
        <div className="open-sources">
          <button className={`open-source ${source === "recent" ? "active" : ""}`} onClick={() => setSource("recent")}>
            <Icon name="clock" size={20} />
            <span>Recent</span>
          </button>
          <button className="open-source" onClick={() => app.browse()}>
            <Icon name="open" size={20} />
            <span>Browse</span>
          </button>
          <button className={`open-source ${source === "unsaved" ? "active" : ""}`} onClick={() => setSource("unsaved")}>
            <Icon name="recover" size={20} />
            <span>Recover Unsaved Workbooks</span>
          </button>
        </div>
        <div className="open-list">
          {source === "recent" ? (
            <RecentList />
          ) : (
            <RecoveryPanel
              kind="unsaved"
              title="Recover Unsaved Workbooks"
              text="Workbooks you closed without saving are kept here for 7 days."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function VersionHistory({ book }: { book: BookActions }) {
  const app = useApp();
  const path = book.ctl.info.path;
  const [items, setItems] = useState<VersionItem[] | null>(null);
  useEffect(() => {
    if (path) api.versions(path).then(setItems).catch(() => setItems([]));
  }, [path]);
  if (!path) return null;
  return (
    <>
      <h2 className="bs-subtitle">Version History</h2>
      {!items?.length ? (
        <p className="muted">No previous versions yet. Each time you save, the previous version of the file is kept here.</p>
      ) : (
        <div className="recent-table version-list">
          {items.map((v) => (
            <div
              key={v.file}
              className="rt-row"
              title="Open this version as a new workbook"
              onClick={async () => {
                try {
                  const stamp = new Date(v.savedAt).toLocaleString();
                  const info = await api.versionOpen(v.file, `${book.ctl.info.title} (version ${stamp})`);
                  await app.showBook(info);
                } catch (e) {
                  app.error(errorMessage(e));
                }
              }}
            >
              <span className="rt-icon">
                <Icon name="history" size={20} />
              </span>
              <span className="rt-name">
                <span className="rt-file">{new Date(v.savedAt).toLocaleString()}</span>
                <span className="rt-folder">{fileSize(v.size)}</span>
              </span>
              <span className="rt-date">{friendlyDate(v.savedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function PrintPage({ book }: { book: BookActions }) {
  const [opts, setOpts] = useState<PrintOptions>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("sheets.print") ?? "null");
      if (saved) return { ...saved, what: "sheet" };
    } catch {
      /* ignore */
    }
    return { what: "sheet", landscape: false, gridlines: false, headings: false, fitWidth: true };
  });
  const [busy, setBusy] = useState(false);
  const r = book.ctl.range;
  const multi = r.r1 !== r.r2 || r.c1 !== r.c2;
  const update = (o: PrintOptions) => {
    setOpts(o);
    try {
      localStorage.setItem("sheets.print", JSON.stringify(o));
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="bs-page">
      <h1 className="bs-title">Print</h1>
      <div className="print-options">
        <button
          className="btn primary big"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await printBook(book.ctl, opts);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="print" /> {busy ? "Preparing…" : "Print / Save as PDF"}
        </button>
        <p className="muted small">Choose "Save as PDF" (Windows: Microsoft Print to PDF) in the print dialog to create a PDF.</p>
        <label>
          <span>Print:</span>
          <select value={opts.what} onChange={(e) => update({ ...opts, what: e.target.value as PrintOptions["what"] })}>
            <option value="sheet">Active Sheet</option>
            <option value="selection" disabled={!multi}>
              Selection
            </option>
            <option value="workbook">Entire Workbook</option>
          </select>
        </label>
        <label>
          <span>Orientation:</span>
          <select value={opts.landscape ? "l" : "p"} onChange={(e) => update({ ...opts, landscape: e.target.value === "l" })}>
            <option value="p">Portrait</option>
            <option value="l">Landscape</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={opts.fitWidth} onChange={(e) => update({ ...opts, fitWidth: e.target.checked })} />
          Fit all columns on one page
        </label>
        <label>
          <input type="checkbox" checked={opts.gridlines} onChange={(e) => update({ ...opts, gridlines: e.target.checked })} />
          Print gridlines
        </label>
        <label>
          <input type="checkbox" checked={opts.headings} onChange={(e) => update({ ...opts, headings: e.target.checked })} />
          Print row and column headings
        </label>
      </div>
    </div>
  );
}

function InfoPage({ book }: { book: BookActions }) {
  const app = useApp();
  const info = book.ctl.info;
  const [stats, setStats] = useState<WorkbookStats | null>(null);
  useEffect(() => {
    api.stats(book.ctl.id).then(setStats).catch(() => {});
  }, [book.ctl.id]);
  return (
    <div className="bs-page">
      <h1 className="bs-title">Info</h1>
      <div className="info-name">
        <Icon name="xlsx" size={32} />
        <div>
          <div className="info-title">{info.title}</div>
          <div className="muted">{info.path ?? "Not saved yet"}</div>
        </div>
      </div>
      <div className="info-actions">
        <button className="info-card" disabled={!info.path} onClick={() => info.path && api.revealInFolder(info.path).catch((e) => app.error(String(e)))}>
          <Icon name="open" size={24} />
          <span>Open File Location</span>
        </button>
        <button className="info-card" onClick={() => book.saveAs()}>
          <Icon name="saveAs" size={24} />
          <span>Save a Copy / Save As</span>
        </button>
      </div>
      <h2 className="bs-subtitle">Properties</h2>
      <div className="props">
        <div>
          <span>Sheets</span>
          <span>{info.sheets.length}</span>
        </div>
        <div>
          <span>Cells with data</span>
          <span>{stats?.cellsWithData ?? "…"}</span>
        </div>
        <div>
          <span>Formulas</span>
          <span>{stats?.formulas ?? "…"}</span>
        </div>
        <div>
          <span>Format</span>
          <span>{info.format ? info.format.toUpperCase() : "—"}</span>
        </div>
        <div>
          <span>Status</span>
          <span>{info.dirty ? "Unsaved changes" : "All changes saved"}</span>
        </div>
        <div>
          <span>Author</span>
          <span>{app.settings.userName}</span>
        </div>
      </div>
      <VersionHistory book={book} />
    </div>
  );
}

function ExportPage({ book }: { book: BookActions }) {
  const items: { ext: "csv" | "tsv" | "xlsx"; title: string; desc: string }[] = [
    { ext: "xlsx", title: "Excel Workbook (*.xlsx)", desc: "Save a copy that opens in Microsoft Excel." },
    { ext: "csv", title: "CSV (Comma delimited) (*.csv)", desc: "Saves only the active sheet's values." },
    { ext: "tsv", title: "Text (Tab delimited) (*.txt)", desc: "Saves only the active sheet's values." },
  ];
  return (
    <div className="bs-page">
      <h1 className="bs-title">Export</h1>
      <h2 className="bs-subtitle">Change File Type</h2>
      <div className="export-list">
        {items.map((i) => (
          <button key={i.ext} className="export-item" onClick={() => book.exportAs(i.ext)}>
            <Icon name={i.ext === "xlsx" ? "xlsx" : "csv"} size={32} />
            <div>
              <b>{i.title}</b>
              <div className="muted">{i.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function AccountPage() {
  const app = useApp();
  const [name, setName] = useState(app.settings.userName);
  return (
    <div className="bs-page">
      <h1 className="bs-title">Account</h1>
      <div className="account-grid">
        <div>
          <h2 className="bs-subtitle">User Information</h2>
          <div className="user-card">
            <div className="avatar big">{app.info.initials}</div>
            <div>
              <input
                className="plain-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name.trim() && name !== app.settings.userName && app.saveSettings({ ...app.settings, userName: name.trim() })}
              />
              <div className="muted small">Local profile</div>
            </div>
          </div>
          <h2 className="bs-subtitle">Office Theme</h2>
          <select
            className="bs-select"
            value={app.settings.theme}
            onChange={(e) => app.saveSettings({ ...app.settings, theme: e.target.value as "dark" })}
          >
            <option value="dark">Black</option>
            <option value="light">White</option>
            <option value="system">Use system setting</option>
          </select>
        </div>
        <div>
          <h2 className="bs-subtitle">Product Information</h2>
          <div className="product">
            <Icon name="logo" size={40} />
            <div>
              <b>{APP_NAME}</b>
              <div className="muted">Version {app.info.version}</div>
              <div className="muted small">Spreadsheet engine: IronCalc · Shell: Tauri 2</div>
            </div>
          </div>
          <h2 className="bs-subtitle">Connected services</h2>
          <p className="muted">Database sync is not configured. Workbooks are stored as local files.</p>
        </div>
      </div>
    </div>
  );
}

function FeedbackPage() {
  return (
    <div className="bs-page">
      <h1 className="bs-title">Feedback</h1>
      <div className="export-list">
        <div className="export-item static">
          <Icon name="feedback" size={32} />
          <div>
            <b>I like something</b>
            <div className="muted">Tell the internal tools team what works well.</div>
          </div>
        </div>
        <div className="export-item static">
          <Icon name="comment" size={32} />
          <div>
            <b>I don't like something / I have a suggestion</b>
            <div className="muted">Share ideas for the next version (templates, database sync, charts...).</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Backstage({ initial, book, onPageChange }: { initial?: BackstagePage; book?: BookActions; onPageChange?: (p: BackstagePage) => void }) {
  const app = useApp();
  const [page, setPage] = useState<BackstagePage>(initial ?? "home");
  useEffect(() => {
    if (initial) setPage(initial);
  }, [initial]);
  const go = (p: BackstagePage) => {
    setPage(p);
    onPageChange?.(p);
  };
  // Esc returns to the workbook, like Excel's File menu
  useEffect(() => {
    if (!book) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".dialog-backdrop")) {
        e.preventDefault();
        book.back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [book]);
  const item = (p: BackstagePage, icon: string, label: string) => (
    <button className={`bs-nav ${page === p ? "active" : ""}`} onClick={() => go(p)}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  );
  return (
    <div className={`backstage ${book ? "in-book" : ""}`}>
      <nav className="bs-sidebar">
        {book && (
          <button className="bs-back" title="Back" onClick={book.back}>
            <Icon name="back" size={28} />
          </button>
        )}
        {item("home", "home", "Home")}
        {item("new", "newDoc", "New")}
        {item("open", "open", "Open")}
        {book && (
          <>
            <div className="bs-divider" />
            <button className={`bs-nav text ${page === "info" ? "active" : ""}`} onClick={() => go("info")}>
              Info
            </button>
            <button className="bs-nav text" onClick={() => book.save().then((ok) => ok && book.back())}>
              Save
            </button>
            <button className="bs-nav text" onClick={() => book.saveAs().then((ok) => ok && book.back())}>
              Save As
            </button>
            <button className={`bs-nav text ${page === "print" ? "active" : ""}`} onClick={() => go("print")}>
              Print
            </button>
            <button className={`bs-nav text ${page === "export" ? "active" : ""}`} onClick={() => go("export")}>
              Export
            </button>
            <button className="bs-nav text" onClick={() => book.close()}>
              Close
            </button>
          </>
        )}
        <div className="bs-spacer" />
        <div className="bs-divider" />
        <button className={`bs-nav text ${page === "account" ? "active" : ""}`} onClick={() => go("account")}>
          Account
        </button>
        <button className={`bs-nav text ${page === "feedback" ? "active" : ""}`} onClick={() => go("feedback")}>
          Feedback
        </button>
        <button className="bs-nav text" onClick={() => app.openOptions()}>
          Options
        </button>
      </nav>
      <main className="bs-main">
        {page === "home" && <HomePage onMore={() => go("new")} />}
        {page === "new" && <NewPage />}
        {page === "open" && <OpenPage />}
        {page === "info" && book && <InfoPage book={book} />}
        {page === "export" && book && <ExportPage book={book} />}
        {page === "print" && book && <PrintPage book={book} />}
        {page === "account" && <AccountPage />}
        {page === "feedback" && <FeedbackPage />}
      </main>
    </div>
  );
}
