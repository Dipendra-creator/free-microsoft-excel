//! In-app updates.
//!
//! Sheets looks for a newer release shortly after it starts and every few
//! hours (Options → "Check for updates automatically"), or when asked
//! (Help → Check for Updates). The result is shared by every window: the
//! title bar shows an Update button while one is available.
//!
//! * **Signed updates.** Releases built with the project's signing key carry a
//!   `latest.json` manifest and minisign signatures. Those are downloaded and
//!   verified by the Tauri updater and installed from inside the app.
//! * **Unsigned releases.** When a newer release has no signed update files,
//!   it is still announced (from the GitHub releases API) and the Update
//!   button opens its download page instead.
//!
//! Before an update restarts the app, every workbook with unsaved changes is
//! kept and offered again on the start screen afterwards.

use std::{
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

const REPO: &str = "Dipendra-creator/free-microsoft-excel";
const FIRST_CHECK: Duration = Duration::from_secs(8);
const CHECK_EVERY: Duration = Duration::from_secs(6 * 3600);
pub const EVENT: &str = "update-status";

#[derive(Serialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    #[default]
    Idle,
    Checking,
    UpToDate,
    Available,
    Downloading,
    /// Downloaded and verified: restart to install.
    Ready,
    Installing,
    Error,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub phase: Phase,
    /// Version running now.
    pub current: String,
    /// Version available.
    pub version: Option<String>,
    pub notes: Option<String>,
    /// Release date (Unix ms).
    pub date: Option<i64>,
    /// Installs from inside the app (signed update); otherwise `page` is
    /// opened to download it.
    pub installable: bool,
    /// Release page.
    pub page: Option<String>,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub error: Option<String>,
    /// When the last check finished (Unix ms).
    pub checked_at: Option<u64>,
    /// After an update: the version Sheets was updated from.
    pub updated_from: Option<String>,
}

pub struct Updates {
    status: Mutex<UpdateStatus>,
    pending: Mutex<Option<Update>>,
    bytes: Mutex<Option<Vec<u8>>>,
}

impl Updates {
    pub fn new(current: String, updated_from: Option<String>) -> Updates {
        Updates {
            status: Mutex::new(UpdateStatus { current, updated_from, ..Default::default() }),
            pending: Mutex::new(None),
            bytes: Mutex::new(None),
        }
    }

    pub fn status(&self) -> UpdateStatus {
        self.status.lock().unwrap().clone()
    }

    fn set(&self, app: &AppHandle, f: impl FnOnce(&mut UpdateStatus)) -> UpdateStatus {
        let snapshot = {
            let mut s = self.status.lock().unwrap();
            f(&mut s);
            s.clone()
        };
        let _ = app.emit(EVENT, &snapshot);
        snapshot
    }

    fn busy(&self) -> bool {
        matches!(
            self.status.lock().unwrap().phase,
            Phase::Checking | Phase::Downloading | Phase::Installing
        )
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// `a` is newer than `b` (semantic versions, a leading "v" allowed).
pub fn is_newer(a: &str, b: &str) -> bool {
    let parse = |v: &str| semver::Version::parse(v.trim().trim_start_matches('v')).ok();
    match (parse(a), parse(b)) {
        (Some(a), Some(b)) => a > b,
        _ => false,
    }
}

/// The "What's new" part of a release description (the download tables are
/// of no use inside the app).
pub fn whats_new(body: &str) -> String {
    let start = body.find("## What's new").map(|i| body[i..].find('\n').map(|n| i + n + 1).unwrap_or(i));
    let text = match start {
        Some(i) => &body[i..],
        None => body,
    };
    let end = text.find("\nSee the [README]").unwrap_or(text.len());
    text[..end].trim().to_string()
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    #[serde(default)]
    body: Option<String>,
    html_url: String,
    #[serde(default)]
    published_at: Option<String>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

/// The newest published release, from the GitHub API (no signature needed:
/// only used to announce the release and open its page).
async fn latest_github_release() -> Result<GithubRelease, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .user_agent(concat!("Sheets/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(format!("https://api.github.com/repos/{REPO}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("GitHub answered {}", response.status()));
    }
    response.json::<GithubRelease>().await.map_err(|e| e.to_string())
}

fn release_page(version: &str) -> String {
    format!("https://github.com/{REPO}/releases/tag/v{}", version.trim_start_matches('v'))
}

fn updater(app: &AppHandle) -> tauri_plugin_updater::Result<tauri_plugin_updater::Updater> {
    let mut builder = app.updater_builder();
    // Test hook for development builds: point at a local manifest.
    if cfg!(debug_assertions) {
        if let Ok(url) = std::env::var("SHEETS_UPDATE_URL") {
            if let Ok(url) = url.parse() {
                builder = builder.endpoints(vec![url])?;
            }
        }
    }
    builder.build()
}

/// Looks for a newer version. Returns the new status.
pub async fn check(app: &AppHandle) -> UpdateStatus {
    let updates = app.state::<Updates>();
    if updates.busy() || updates.status().phase == Phase::Ready {
        return updates.status();
    }
    updates.set(app, |s| {
        s.phase = Phase::Checking;
        s.error = None;
    });
    let current = updates.status().current;

    // 1. Signed update manifest (installable in the app)
    let signed = match updater(app) {
        Ok(u) => u.check().await.map_err(|e| e.to_string()),
        Err(e) => Err(e.to_string()),
    };
    if let Ok(Some(update)) = &signed {
        let version = update.version.clone();
        let notes = update.body.clone().map(|b| whats_new(&b));
        let date = update.date.map(|d| d.unix_timestamp() * 1000);
        *updates.pending.lock().unwrap() = Some(update.clone());
        return updates.set(app, |s| {
            s.phase = Phase::Available;
            s.page = Some(release_page(&version));
            s.version = Some(version);
            s.notes = notes;
            s.date = date;
            s.installable = true;
            s.downloaded = 0;
            s.total = None;
            s.checked_at = Some(now_ms());
        });
    }

    // 2. No signed manifest (or none newer): ask GitHub for the latest release
    match latest_github_release().await {
        Ok(r) if !r.draft && !r.prerelease && is_newer(&r.tag_name, &current) => {
            let version = r.tag_name.trim_start_matches('v').to_string();
            let date = r.published_at.as_deref().and_then(parse_utc);
            updates.set(app, |s| {
                s.phase = Phase::Available;
                s.version = Some(version);
                s.notes = r.body.as_deref().map(whats_new);
                s.date = date;
                s.installable = false;
                s.page = Some(r.html_url);
                s.checked_at = Some(now_ms());
            })
        }
        Ok(_) => updates.set(app, |s| {
            s.phase = Phase::UpToDate;
            s.version = None;
            s.notes = None;
            s.installable = false;
            s.checked_at = Some(now_ms());
        }),
        Err(e) => {
            // The signed check's error is the more useful one when both failed
            let message = match signed {
                Err(signed_err) => format!("{e} ({signed_err})"),
                Ok(_) => e,
            };
            updates.set(app, |s| {
                s.phase = Phase::Error;
                s.error = Some(format!("Couldn't check for updates: {message}"));
                s.checked_at = Some(now_ms());
            })
        }
    }
}

/// Downloads (and verifies) the pending signed update.
pub async fn download(app: &AppHandle) -> AppResult<UpdateStatus> {
    let updates = app.state::<Updates>();
    let update = updates
        .pending
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| AppError::Invalid("There is no update to download. Check for updates first.".into()))?;
    if updates.status().phase == Phase::Ready {
        return Ok(updates.status());
    }
    updates.set(app, |s| {
        s.phase = Phase::Downloading;
        s.downloaded = 0;
        s.total = None;
        s.error = None;
    });
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();
    let handle = app.clone();
    let result = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                if last_emit.elapsed() >= Duration::from_millis(200) {
                    last_emit = Instant::now();
                    handle.state::<Updates>().set(&handle, |s| {
                        s.downloaded = downloaded;
                        s.total = total;
                    });
                }
            },
            || {},
        )
        .await;
    match result {
        Ok(bytes) => {
            let size = bytes.len() as u64;
            *updates.bytes.lock().unwrap() = Some(bytes);
            Ok(updates.set(app, |s| {
                s.phase = Phase::Ready;
                s.downloaded = size;
                s.total = Some(size);
            }))
        }
        Err(e) => {
            let status = updates.set(app, |s| {
                s.phase = Phase::Error;
                s.error = Some(format!("The update could not be downloaded: {e}"));
            });
            Err(AppError::Invalid(status.error.unwrap_or_default()))
        }
    }
}

/// Installs the downloaded update and restarts Sheets. Workbooks with unsaved
/// changes are kept and offered again after the restart.
pub fn install(app: &AppHandle) -> AppResult<()> {
    let updates = app.state::<Updates>();
    let update = updates
        .pending
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| AppError::Invalid("There is no update to install.".into()))?;
    let bytes = updates
        .bytes
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| AppError::Invalid("The update has not been downloaded yet.".into()))?;
    let state = app.state::<AppState>();
    let kept = state.keep_for_restart(&update.version);
    updates.set(app, |s| s.phase = Phase::Installing);
    // On Windows this starts the installer and exits the app.
    match update.install(&bytes) {
        Ok(()) => {
            app.restart();
        }
        Err(e) => {
            state.undo_keep_for_restart(&kept);
            *updates.bytes.lock().unwrap() = Some(bytes);
            let status = updates.set(app, |s| {
                s.phase = Phase::Error;
                s.error = Some(format!("The update could not be installed: {e}"));
            });
            Err(AppError::Invalid(status.error.unwrap_or_default()))
        }
    }
}

/// Checks shortly after start and then every few hours, when enabled.
pub fn start_background_checks(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK);
        loop {
            let enabled = app
                .try_state::<AppState>()
                .map(|s| s.settings.lock().unwrap().value.check_updates)
                .unwrap_or(false);
            if enabled {
                tauri::async_runtime::block_on(check(&app));
            }
            std::thread::sleep(CHECK_EVERY);
        }
    });
}

/// "2026-09-28T12:35:39Z" → Unix ms.
fn parse_utc(text: &str) -> Option<i64> {
    let b = text.as_bytes();
    if b.len() < 19 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' {
        return None;
    }
    let n = |r: std::ops::Range<usize>| text.get(r)?.parse::<i64>().ok();
    let (y, m, d) = (n(0..4)?, n(5..7)?, n(8..10)?);
    let (hh, mm, ss) = (n(11..13)?, n(14..16)?, n(17..19)?);
    // days_from_civil (Howard Hinnant)
    let y2 = if m <= 2 { y - 1 } else { y };
    let era = if y2 >= 0 { y2 } else { y2 - 399 } / 400;
    let yoe = y2 - era * 400;
    let doy = (153 * ((m + 9) % 12) + 2) / 5 + d - 1;
    let days = era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719468;
    Some(((days * 24 + hh) * 60 + mm) * 60_000 + ss * 1000)
}

// ----------------------------------------------------------------------
// Commands
// ----------------------------------------------------------------------

#[tauri::command]
pub fn update_status(updates: State<'_, Updates>) -> UpdateStatus {
    updates.status()
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> AppResult<UpdateStatus> {
    Ok(check(&app).await)
}

#[tauri::command]
pub async fn update_download(app: AppHandle) -> AppResult<UpdateStatus> {
    download(&app).await
}

#[tauri::command]
pub async fn update_install(app: AppHandle) -> AppResult<()> {
    install(&app)
}

/// Workbooks with unsaved changes (titles), to warn before restarting.
#[tauri::command]
pub fn update_unsaved(state: State<'_, AppState>) -> Vec<String> {
    state.unsaved_titles()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions() {
        assert!(is_newer("v0.4.0", "0.3.0"));
        assert!(is_newer("0.3.1", "0.3.0"));
        assert!(is_newer("1.0.0", "0.9.9"));
        assert!(!is_newer("v0.3.0", "0.3.0"));
        assert!(!is_newer("0.2.9", "0.3.0"));
        assert!(!is_newer("nightly", "0.3.0"));
    }

    #[test]
    fn dates() {
        assert_eq!(parse_utc("1970-01-02T00:00:01Z"), Some(86_401_000));
        assert_eq!(parse_utc("2026-09-28T12:35:39Z"), Some(1_790_598_939_000));
        assert_eq!(parse_utc("soon"), None);
    }

    #[test]
    fn release_notes() {
        let body = "## Download Sheets 0.4.0\n| a | b |\n\n---\n\n## What's new in 0.4.0\n\n**Updates**\n- In-app updates\n\nSee the [README](x) for details.\n";
        assert_eq!(whats_new(body), "**Updates**\n- In-app updates");
        assert_eq!(whats_new("Just text"), "Just text");
    }
}
