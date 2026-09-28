//! App-level commands: start screen data, settings, windows.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

use crate::{
    error::{AppError, AppResult},
    recent::RecentItem,
    settings::{initials, Settings},
    state::AppState,
    templates::{TemplateMeta, TemplatePreview},
};

pub const APP_NAME: &str = "Sheets";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub user_name: String,
    pub initials: String,
    pub settings: Settings,
    pub startup_file: Option<String>,
    pub day_first: bool,
}

/// Set once a window asked for `app_info`, i.e. the UI can receive events.
static FRONTEND_READY: AtomicBool = AtomicBool::new(false);

/// Opens a file in the running app: sent to the focused window (or any
/// window), or kept as the startup file when no UI is up yet.
pub fn deliver_open(app: &AppHandle, path: String) {
    let windows = app.webview_windows();
    let target = windows
        .values()
        .find(|w| w.is_focused().unwrap_or(false))
        .or_else(|| windows.get("main"))
        .or_else(|| windows.values().next());
    match target {
        Some(w) if FRONTEND_READY.load(Ordering::SeqCst) => {
            let _ = w.unminimize();
            let _ = w.set_focus();
            let _ = app.emit_to(w.label(), "open-file", path);
        }
        _ => {
            if let Some(state) = app.try_state::<AppState>() {
                *state.startup_file.lock().unwrap() = Some(path);
            }
        }
    }
}

pub fn focus_any_window(app: &AppHandle) {
    if let Some(w) = app.webview_windows().values().next() {
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookWindow {
    pub label: String,
    pub book: String,
    pub title: String,
    pub dirty: bool,
}

/// Open workbook windows (View > Switch Windows).
#[tauri::command(async)]
pub fn list_book_windows(state: State<'_, AppState>) -> AppResult<Vec<BookWindow>> {
    let mut out = Vec::new();
    for (label, book) in state.bound_windows() {
        if let Ok((title, dirty)) = state.read(&book, |s| Ok((s.title.clone(), s.dirty))) {
            out.push(BookWindow { label, book, title, dirty });
        }
    }
    out.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(out)
}

#[tauri::command(async)]
pub fn app_info(app: AppHandle, state: State<'_, AppState>) -> AppResult<AppInfo> {
    FRONTEND_READY.store(true, Ordering::SeqCst);
    let settings = state.settings.lock().unwrap().value.clone();
    Ok(AppInfo {
        name: APP_NAME.to_string(),
        version: app.package_info().version.to_string(),
        user_name: settings.user_name.clone(),
        initials: initials(&settings.user_name),
        settings,
        startup_file: state.startup_file.lock().unwrap().take(),
        day_first: state.config().day_first,
    })
}

#[tauri::command(async)]
pub fn update_settings(state: State<'_, AppState>, settings: Settings) -> AppResult<Settings> {
    let mut store = state.settings.lock().unwrap();
    let size = settings.default_font_size.clamp(1, 409);
    store.value = Settings {
        default_font_size: size,
        sheets_in_new_workbook: settings.sheets_in_new_workbook.clamp(1, 255),
        autorecover_seconds: settings.autorecover_seconds.min(3600),
        keep_versions: settings.keep_versions.min(200),
        ..settings
    };
    store.save();
    state.update_prefs(&store.value);
    Ok(store.value.clone())
}

#[tauri::command(async)]
pub fn list_recent(state: State<'_, AppState>) -> AppResult<Vec<RecentItem>> {
    Ok(state.recent.lock().unwrap().list())
}

#[tauri::command(async)]
pub fn pin_recent(state: State<'_, AppState>, path: String, pinned: bool) -> AppResult<Vec<RecentItem>> {
    let mut recent = state.recent.lock().unwrap();
    recent.set_pinned(&path, pinned);
    Ok(recent.list())
}

#[tauri::command(async)]
pub fn remove_recent(state: State<'_, AppState>, path: String) -> AppResult<Vec<RecentItem>> {
    let mut recent = state.recent.lock().unwrap();
    recent.remove(&path);
    Ok(recent.list())
}

#[tauri::command(async)]
pub fn clear_recent(state: State<'_, AppState>) -> AppResult<Vec<RecentItem>> {
    let mut recent = state.recent.lock().unwrap();
    recent.clear_unpinned();
    Ok(recent.list())
}

#[tauri::command(async)]
pub fn list_templates(state: State<'_, AppState>) -> AppResult<Vec<TemplateMeta>> {
    Ok(state.templates.list())
}

#[tauri::command(async)]
pub fn template_preview(state: State<'_, AppState>, id: String) -> AppResult<Option<TemplatePreview>> {
    let config = state.config();
    state.templates.preview(&id, &config)
}

#[tauri::command(async)]
pub fn reveal_in_folder(app: AppHandle, path: String) -> AppResult<()> {
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| AppError::Io(e.to_string()))
}

/// Associates the calling window with a workbook (None when it shows the start screen).
#[tauri::command(async)]
pub fn bind_window(window: WebviewWindow, state: State<'_, AppState>, book: Option<String>) -> AppResult<()> {
    state.bind_window(window.label(), book);
    Ok(())
}

/// Workbook currently bound to the calling window (restores it after a reload).
#[tauri::command(async)]
pub fn window_book(window: WebviewWindow, state: State<'_, AppState>) -> AppResult<Option<String>> {
    Ok(state.book_of_window(window.label()))
}

/// Brings the window showing `book` to the front. Returns false if none.
#[tauri::command(async)]
pub fn focus_book(app: AppHandle, state: State<'_, AppState>, book: String) -> AppResult<bool> {
    if let Some(label) = state.window_of(&book) {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.unminimize();
            window.set_focus()?;
            return Ok(true);
        }
    }
    Ok(false)
}

/// Opens a new top-level window for an already created workbook session.
#[tauri::command]
pub async fn open_book_window(app: AppHandle, state: State<'_, AppState>, book: String, title: String) -> AppResult<()> {
    let label = format!("book-{book}");
    if let Some(window) = app.get_webview_window(&label) {
        window.set_focus()?;
        return Ok(());
    }
    state.bind_window(&label, Some(book));
    let offset = (app.webview_windows().len() as f64 % 8.0) * 26.0;
    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title(format!("{title} - {APP_NAME}"))
        .inner_size(1400.0, 880.0)
        .min_inner_size(760.0, 480.0)
        .decorations(false)
        .background_color(tauri::window::Color(20, 20, 20, 255))
        .position(60.0 + offset, 40.0 + offset);
    builder.build()?;
    Ok(())
}
