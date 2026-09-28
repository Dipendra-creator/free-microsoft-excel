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
mod settings;
mod state;
mod storage;
mod sync;
mod templates;

use tauri::Manager;

use commands::{app, cells, sheet, workbook};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_config_dir()?;
            app.manage(state::AppState::new(&dir));
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
            cells::current_region,
            cells::range_insert_cells,
            cells::range_delete_cells,
            cells::range_fill,
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
