//! Sheets — lightweight spreadsheet desktop app.
//!
//! Layers:
//! * `engine`    – workbook sessions on top of the IronCalc engine
//! * `storage`   – loading/saving (files today, database later)
//! * `templates` – template providers (built-in today, remote later)
//! * `sync`      – change stream hook for future database synchronisation
//! * `commands`  – Tauri IPC surface used by the frontend

mod commands;
mod engine;
mod error;
mod recent;
mod recovery;
mod settings;
mod state;
mod storage;
mod sync;
mod templates;

use std::time::Duration;

use tauri::Manager;

use commands::{app, cells, features, sheet, workbook};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // A second launch (e.g. double-clicking a file) hands the file to the
    // running instance instead of starting another process.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|handle, argv, _cwd| {
        let file = argv
            .iter()
            .skip(1)
            .find(|a| !a.starts_with('-') && std::path::Path::new(a).is_file());
        match file {
            Some(f) => app::deliver_open(handle, f.clone()),
            None => app::focus_any_window(handle),
        }
    }));
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let data_dir = app.path().app_local_data_dir().unwrap_or_else(|_| config_dir.clone());
            app.manage(state::AppState::new(&config_dir, &data_dir));
            // AutoRecover: snapshot changed workbooks in the background.
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(5));
                if let Some(state) = handle.try_state::<state::AppState>() {
                    state.autorecover_tick();
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<state::AppState>() {
                    state.window_destroyed(window.label());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            app::app_info,
            app::update_settings,
            app::list_recent,
            app::pin_recent,
            app::remove_recent,
            app::clear_recent,
            app::list_templates,
            app::template_preview,
            app::reveal_in_folder,
            app::bind_window,
            app::window_book,
            app::focus_book,
            app::open_book_window,
            app::list_book_windows,
            features::note_set,
            features::notes_delete,
            features::notes_list,
            features::chart_save,
            features::chart_delete,
            features::range_values,
            features::filter_toggle,
            features::filter_values,
            features::filter_set,
            features::filter_clear,
            features::filter_reapply,
            features::filter_sort,
            features::text_to_columns,
            features::pivot_create,
            features::health_check,
            features::recovery_list,
            features::recovery_open,
            features::recovery_discard,
            features::versions_list,
            features::version_open,
            workbook::workbook_new,
            workbook::workbook_open,
            workbook::workbook_info,
            workbook::workbook_save,
            workbook::workbook_save_as,
            workbook::workbook_export,
            workbook::workbook_close,
            workbook::workbook_undo,
            workbook::workbook_redo,
            workbook::workbook_stats,
            workbook::workbook_recalculate,
            workbook::format_is_lossy,
            sheet::sheet_layout,
            sheet::sheet_activate,
            sheet::sheet_add,
            sheet::sheet_delete,
            sheet::sheet_rename,
            sheet::sheet_move,
            sheet::sheet_duplicate,
            sheet::sheet_set_hidden,
            sheet::sheet_set_color,
            sheet::sheet_freeze,
            sheet::sheet_grid_lines,
            cells::cells_get,
            cells::cell_info,
            cells::cell_set,
            cells::range_set,
            cells::range_clear,
            cells::range_style,
            cells::range_borders,
            cells::range_decimals,
            cells::range_table_style,
            cells::range_merge,
            cells::rows_insert,
            cells::rows_delete,
            cells::cols_insert,
            cells::cols_delete,
            cells::cols_width,
            cells::cols_widths,
            cells::rows_height,
            cells::rows_heights,
            cells::axis_hidden,
            cells::clipboard_copy,
            cells::clipboard_clear,
            cells::clipboard_paste,
            cells::clipboard_paste_special,
            cells::current_region,
            cells::range_insert_cells,
            cells::range_delete_cells,
            cells::range_fill,
            cells::range_fill_extent,
            cells::range_fill_series,
            cells::range_flash_fill,
            cells::range_sort,
            cells::range_remove_duplicates,
            cells::find_all,
            cells::replace,
            cells::selection_stats,
            cells::navigate_edge,
            cells::cycle_reference,
            cells::format_preview,
            cells::names_list,
            cells::name_add,
            cells::name_update,
            cells::name_delete,
            cells::cf_list,
            cells::cf_add,
            cells::cf_delete,
            cells::cf_clear,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_handle, _event| {
            // macOS delivers files opened from Finder (double-click, "Open
            // With", drag onto the Dock icon) as an event, not as arguments.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = &_event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        app::deliver_open(_handle, path.to_string_lossy().to_string());
                    }
                }
            }
        });
}
