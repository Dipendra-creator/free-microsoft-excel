//! Spreadsheet engine layer built on IronCalc.

pub mod a1;
pub mod dto;
pub mod extras;
mod input;
pub mod merges;
mod meta;
mod session;
pub mod styling;

pub use input::protect_literal;
pub use session::format_preview;
pub use session::{
    ClipboardPayload, DefinedNameDto, EngineConfig, FilterValue, FindOptions, FoundCell, HealthReport, PivotSpec,
    RangeValues, Session, SortKey, SplitOptions, WorkbookStats,
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
        preserve_literals: true,
        csv_bom: true,
    }
}

#[cfg(test)]
mod tests;
