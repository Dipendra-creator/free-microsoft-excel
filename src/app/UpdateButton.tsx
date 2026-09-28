// Title-bar Update button: appears when a new version of Sheets is
// available, shows download progress, and restarts into the update.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { errorMessage, type UpdateStatus } from "../api";
import { Icon } from "../components/Icon";
import { Popup } from "../components/Popup";
import { friendlyDate } from "../lib/formats";
import { APP_NAME, useApp } from "./context";
import { markUpdateNoteSeen, onOpenUpdatePanel, openUrl, seenUpdateNote, updates, useUpdateStatus } from "./updates";

const SHOWN: UpdateStatus["phase"][] = ["available", "downloading", "ready", "installing"];

function percent(s: UpdateStatus): number | null {
  if (!s.total) return null;
  return Math.max(0, Math.min(100, Math.round((s.downloaded / s.total) * 100)));
}

/** Release notes are Markdown; show headings, bullets, **bold** and `code`. */
function Notes({ text }: { text: string }) {
  const inline = (line: string): ReactNode[] =>
    line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <b key={i}>{part.slice(2, -2)}</b>
      ) : part.startsWith("`") && part.endsWith("`") ? (
        <code key={i}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={blocks.length}>
          {bullets.map((b, i) => (
            <li key={i}>{inline(b)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^[-*] /.test(line)) {
      bullets.push(line.slice(2));
      continue;
    }
    flush();
    if (!line || /^-{3,}$/.test(line)) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    blocks.push(heading ? <h4 key={blocks.length}>{inline(heading[1])}</h4> : <p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="update-notes">{blocks}</div>;
}

export function UpdateButton() {
  const app = useApp();
  const s = useUpdateStatus();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [noteSeen, setNoteSeen] = useState(() => (s ? seenUpdateNote(s.current) : false));
  const ref = useRef<HTMLButtonElement>(null);

  // Help → Check for Updates opens the panel when something was found
  useEffect(
    () =>
      onOpenUpdatePanel(() => {
        requestAnimationFrame(() => {
          const r = ref.current?.getBoundingClientRect();
          if (r) setAnchor(r);
        });
      }),
    [],
  );

  if (!s) return null;
  const updated = !!s.updatedFrom && !noteSeen && !seenUpdateNote(s.current);
  const active = SHOWN.includes(s.phase) || (s.phase === "error" && !!s.version);
  if (!active && !updated) return null;

  const pct = percent(s);
  let label = "Update available";
  let icon = "update";
  if (s.phase === "downloading") label = pct === null ? "Downloading update…" : `Downloading ${pct}%`;
  else if (s.phase === "ready") label = "Restart to update";
  else if (s.phase === "installing") label = "Installing…";
  else if (s.phase === "error") label = "Update failed";
  else if (!active && updated) {
    label = `Updated to ${s.current}`;
    icon = "check";
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      app.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const closeNote = () => {
    markUpdateNoteSeen(s.current);
    setNoteSeen(true);
    setAnchor(null);
  };

  const page = s.page ?? `https://github.com/Dipendra-creator/sheets-desktop/releases/tag/v${s.version ?? s.current}`;

  return (
    <>
      <button
        ref={ref}
        className={`update-btn phase-${active ? s.phase : "updated"}`}
        aria-label={active ? `${APP_NAME} ${s.version} is available` : `${APP_NAME} was updated to ${s.current}`}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
      >
        <Icon name={icon} size={14} />
        <span>{label}</span>
        {s.phase === "downloading" && pct !== null && (
          <span className="update-btn-bar" style={{ width: `${pct}%` }} aria-hidden />
        )}
      </button>
      {anchor && (
        <Popup anchor={anchor} placement="bottom-end" onClose={() => setAnchor(null)}>
          <div className="menu flyout update-panel">
            {active ? (
              <>
                <div className="up-head">
                  <Icon name="logo" size={32} />
                  <div>
                    <b>
                      {s.phase === "ready"
                        ? `${APP_NAME} ${s.version} is ready to install`
                        : `${APP_NAME} ${s.version} is available`}
                    </b>
                    <div className="muted small">
                      You have {s.current}
                      {s.date ? ` · released ${friendlyDate(s.date)}` : ""}
                    </div>
                  </div>
                </div>
                {s.notes && <Notes text={s.notes} />}
                {s.phase === "downloading" && (
                  <div className="up-progress">
                    <div className="up-progress-bar" style={{ width: `${pct ?? 5}%` }} />
                  </div>
                )}
                {s.phase === "error" && s.error && <p className="up-error">{s.error}</p>}
                {!s.installable &&
                  (s.portable ? (
                    <p className="muted small">
                      You're using the portable version of {APP_NAME}. Download the new portable .exe from the release
                      page and use it instead of this one; your settings and recent files are kept.
                    </p>
                  ) : (
                    <p className="muted small">
                      This release can't be installed from inside the app. Download it from the release page and run
                      the installer; your settings and recent files are kept.
                    </p>
                  ))}
                <div className="up-actions">
                  <button className="btn link" onClick={() => openUrl(page).catch((e) => app.error(errorMessage(e)))}>
                    Release notes
                  </button>
                  <span className="spacer" />
                  <button className="btn" onClick={() => setAnchor(null)}>
                    Later
                  </button>
                  {!s.installable ? (
                    <button
                      className="btn primary"
                      onClick={() => {
                        setAnchor(null);
                        openUrl(page).catch((e) => app.error(errorMessage(e)));
                      }}
                    >
                      Download
                    </button>
                  ) : s.phase === "ready" ? (
                    <button
                      className="btn primary"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setAnchor(null);
                          await updates.install(app.ask);
                        })
                      }
                    >
                      Restart now
                    </button>
                  ) : (
                    <button
                      className="btn primary"
                      disabled={busy || s.phase === "downloading" || s.phase === "installing"}
                      onClick={() => run(() => updates.download())}
                    >
                      {s.phase === "downloading" ? "Downloading…" : s.phase === "error" ? "Try again" : "Update now"}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="up-head">
                  <Icon name="logo" size={32} />
                  <div>
                    <b>
                      {APP_NAME} was updated to {s.current}
                    </b>
                    <div className="muted small">from version {s.updatedFrom}</div>
                  </div>
                </div>
                <div className="up-actions">
                  <button
                    className="btn link"
                    onClick={() => {
                      closeNote();
                      openUrl(page).catch((e) => app.error(errorMessage(e)));
                    }}
                  >
                    What's new
                  </button>
                  <span className="spacer" />
                  <button className="btn primary" onClick={closeNote}>
                    OK
                  </button>
                </div>
              </>
            )}
          </div>
        </Popup>
      )}
    </>
  );
}
