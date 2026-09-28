//! Spreadsheet engine layer built on IronCalc.

pub mod a1;
pub mod dto;
mod input;
pub mod merges;
mod session;
pub mod styling;

pub use session::format_preview;
pub use session::{
    ClipboardPayload, DefinedNameDto, EngineConfig, FindOptions, FoundCell, Session, SortKey,
    WorkbookStats,
};

#[cfg(test)]
pub fn test_config() -> EngineConfig {
    EngineConfig {
        locale: "en",
        timezone: "UTC",
        language: "en",
        font_name: "Aptos Narrow".to_string(),
        font_size: 11,
        day_first: true,
    }
}

#[cfg(test)]
mod tests;
