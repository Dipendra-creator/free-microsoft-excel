use serde::{Serialize, Serializer};

/// Error type returned by every command. It is serialized as a plain string so
/// the frontend can show it directly in a message box.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Engine(String),
    #[error("The workbook is no longer open.")]
    WorkbookNotFound,
    #[error("{0}")]
    Io(String),
    #[error("{0}")]
    Invalid(String),
    #[error("{0}")]
    Unsupported(String),
}

impl From<String> for AppError {
    fn from(value: String) -> Self {
        AppError::Engine(value)
    }
}

impl From<&str> for AppError {
    fn from(value: &str) -> Self {
        AppError::Engine(value.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        use std::io::ErrorKind;
        let message = match value.kind() {
            ErrorKind::NotFound => "The file could not be found.".to_string(),
            ErrorKind::PermissionDenied => {
                "Access denied. The file may be open in another program or read-only.".to_string()
            }
            _ => {
                // Windows sharing violation (file open in Excel etc.)
                if value.raw_os_error() == Some(32) || value.raw_os_error() == Some(33) {
                    "The file is open in another program. Close it and try again.".to_string()
                } else {
                    value.to_string()
                }
            }
        };
        AppError::Io(message)
    }
}

impl From<ironcalc::error::XlsxError> for AppError {
    fn from(value: ironcalc::error::XlsxError) -> Self {
        AppError::Io(format!("Could not read the workbook: {value}"))
    }
}

impl From<tauri::Error> for AppError {
    fn from(value: tauri::Error) -> Self {
        AppError::Io(value.to_string())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
