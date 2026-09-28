//! Persistence of workbooks.
//!
//! Everything goes through the [`WorkbookStore`] trait so a database-backed
//! store can be added later (e.g. `DatabaseStore` that loads a workbook by id
//! and saves snapshots / diffs) without touching the commands or the engine.

mod file;

use std::path::{Path, PathBuf};

use ironcalc_base::Model;

use crate::{
    engine::{EngineConfig, Session},
    error::{AppError, AppResult},
};

pub use file::{write_atomic, FileStore};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FileFormat {
    Xlsx,
    Csv,
    Tsv,
}

impl FileFormat {
    pub fn from_path(path: &Path) -> AppResult<FileFormat> {
        let ext = path
            .extension()
            .map(|e| e.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        match ext.as_str() {
            "xlsx" | "xlsm" => Ok(FileFormat::Xlsx),
            "csv" => Ok(FileFormat::Csv),
            "tsv" | "txt" => Ok(FileFormat::Tsv),
            "xls" => Err(AppError::Unsupported(
                "The legacy .xls format is not supported. Save it as .xlsx in Excel first.".into(),
            )),
            _ => Err(AppError::Unsupported(format!(
                "Files of type '.{ext}' are not supported."
            ))),
        }
    }

    pub fn extension(&self) -> &'static str {
        match self {
            FileFormat::Xlsx => "xlsx",
            FileFormat::Csv => "csv",
            FileFormat::Tsv => "tsv",
        }
    }

    /// Formats that only keep the values of the active sheet.
    pub fn is_lossy(&self) -> bool {
        !matches!(self, FileFormat::Xlsx)
    }
}

/// Where a workbook lives. Today only files; a future variant could be
/// `Remote { workbook_id }` handled by a database store.
#[derive(Clone, Debug)]
pub struct Location {
    pub path: PathBuf,
    pub format: FileFormat,
}

impl Location {
    pub fn from_path(path: impl Into<PathBuf>) -> AppResult<Location> {
        let path = path.into();
        let format = FileFormat::from_path(&path)?;
        Ok(Location { path, format })
    }

    /// A location Sheets may write to. Macro-enabled workbooks are refused:
    /// Sheets does not keep VBA projects, and writing a macro-free workbook
    /// under an `.xlsm` name makes Excel reject the file.
    pub fn for_save(path: impl Into<PathBuf>) -> AppResult<Location> {
        let location = Location::from_path(path)?;
        if location.is_macro_enabled() {
            return Err(AppError::Unsupported(
                "Sheets doesn't keep macros, so it can't save macro-enabled workbooks (.xlsm). Save it as an Excel Workbook (.xlsx) instead.".into(),
            ));
        }
        Ok(location)
    }

    pub fn is_macro_enabled(&self) -> bool {
        self.path
            .extension()
            .map(|e| e.eq_ignore_ascii_case("xlsm"))
            .unwrap_or(false)
    }

    pub fn display_name(&self) -> String {
        self.path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "Book".to_string())
    }
}

pub trait WorkbookStore: Send + Sync {
    /// Loads a model from a location.
    fn load(&self, location: &Location, config: &EngineConfig) -> AppResult<Model<'static>>;
    /// Persists the session at a location.
    fn save(&self, session: &Session, location: &Location, config: &EngineConfig) -> AppResult<()>;
}
