//! Data transfer objects exchanged with the frontend, plus conversions from
//! IronCalc's internal representation (xlsx units, style structs) into
//! screen-ready values (Excel pixels, resolved `#RRGGBB` colors).

use ironcalc_base::{
    cf_types::{CfDataBar, CfIcon, CfRating},
    types::{BorderItem, Color, HorizontalAlignment, Style, Theme, VerticalAlignment},
    COLUMN_WIDTH_FACTOR, ROW_HEIGHT_FACTOR,
};
use serde::{Deserialize, Serialize};

/// Excel default column width (8.43 characters) in pixels.
pub const DEFAULT_COL_PX: f64 = 64.0;
/// Excel default row height (15pt) in pixels.
pub const DEFAULT_ROW_PX: f64 = 20.0;

/// Column width stored in xlsx "characters" -> pixels (Calibri/Aptos 11 digit width = 7px).
pub fn col_chars_to_px(width: f64) -> f64 {
    (width * 7.0).round().max(0.0)
}

/// Pixels -> IronCalc column width units (what `set_columns_width` expects).
pub fn px_to_engine_col(px: f64) -> f64 {
    px.max(0.0) / 7.0 * COLUMN_WIDTH_FACTOR
}

/// Row height stored in points -> pixels.
pub fn row_pt_to_px(points: f64) -> f64 {
    (points * 4.0 / 3.0).round().max(0.0)
}

/// Pixels -> IronCalc row height units (what `set_rows_height` expects).
pub fn px_to_engine_row(px: f64) -> f64 {
    px.max(0.0) * 0.75 * ROW_HEIGHT_FACTOR
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BorderDto {
    pub style: String,
    pub color: String,
}

/// Fully resolved cell style as consumed by the renderer and the ribbon.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StyleDto {
    /// Font family, `None` means the workbook default font.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font: Option<String>,
    /// Font size in points.
    pub size: f64,
    #[serde(skip_serializing_if = "is_false")]
    pub bold: bool,
    #[serde(skip_serializing_if = "is_false")]
    pub italic: bool,
    #[serde(skip_serializing_if = "is_false")]
    pub underline: bool,
    #[serde(skip_serializing_if = "is_false")]
    pub strike: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
    pub h_align: String,
    pub v_align: String,
    #[serde(skip_serializing_if = "is_false")]
    pub wrap: bool,
    pub num_fmt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border_top: Option<BorderDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border_right: Option<BorderDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border_bottom: Option<BorderDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border_left: Option<BorderDto>,
}

fn is_false(b: &bool) -> bool {
    !*b
}

/// Font information of the workbook default style (style index 0).
#[derive(Clone, Debug)]
pub struct DefaultFont {
    pub name: String,
    pub size: i32,
}

pub fn resolve_color(color: &Color, theme: &Theme) -> Option<String> {
    let rgb = color.to_rgb(theme);
    if rgb.is_empty() {
        None
    } else {
        Some(rgb.to_uppercase())
    }
}

fn border_dto(item: &Option<BorderItem>, theme: &Theme) -> Option<BorderDto> {
    item.as_ref().map(|b| BorderDto {
        style: b.style.to_string(),
        color: resolve_color(&b.color, theme).unwrap_or_else(|| "#000000".to_string()),
    })
}

fn h_align(a: &HorizontalAlignment) -> String {
    a.to_string()
}

fn v_align(a: &VerticalAlignment) -> String {
    a.to_string()
}

/// IronCalc's `Style::default()` uses "Inter" 12pt; cells that received it
/// (e.g. after a cut) are treated as the workbook default font.
pub fn is_engine_default_font(name: &str, size: i32) -> bool {
    name == "Inter" && size == 12
}

pub fn style_to_dto(style: &Style, theme: &Theme, default_font: &DefaultFont) -> StyleDto {
    let font = &style.font;
    let (font_name, size) = if is_engine_default_font(&font.name, font.sz) {
        (None, default_font.size as f64)
    } else if font.name == default_font.name || font.name.is_empty() {
        (None, font.sz as f64)
    } else {
        (Some(font.name.clone()), font.sz as f64)
    };
    let (h, v, wrap) = match &style.alignment {
        Some(a) => (h_align(&a.horizontal), v_align(&a.vertical), a.wrap_text),
        None => ("general".to_string(), "bottom".to_string(), false),
    };
    StyleDto {
        font: font_name,
        size,
        bold: font.b,
        italic: font.i,
        underline: font.u,
        strike: font.strike,
        color: resolve_color(&font.color, theme),
        fill: resolve_color(&style.fill.color, theme),
        h_align: h,
        v_align: v,
        wrap,
        num_fmt: style.num_fmt.clone(),
        border_top: border_dto(&style.border.top, theme),
        border_right: border_dto(&style.border.right, theme),
        border_bottom: border_dto(&style.border.bottom, theme),
        border_left: border_dto(&style.border.left, theme),
    }
}

/// Conditional-formatting extras that are not plain style overrides.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CfExtraDto {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_bar: Option<DataBarDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<IconDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rating: Option<RatingDto>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DataBarDto {
    pub positive_color: String,
    pub negative_color: String,
    pub gradient: bool,
    pub value: f64,
    pub axis: f64,
    pub show_value: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IconDto {
    pub icon: String,
    pub color: String,
    pub show_value: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RatingDto {
    pub icon: String,
    pub count: u32,
    pub max: u32,
    pub color: String,
    pub show_value: bool,
}

fn icon_name<T: std::fmt::Debug>(icon: &T) -> String {
    format!("{icon:?}")
}

pub fn cf_extra(
    data_bar: &Option<CfDataBar>,
    icon: &Option<CfIcon>,
    rating: &Option<CfRating>,
    theme: &Theme,
) -> Option<CfExtraDto> {
    if data_bar.is_none() && icon.is_none() && rating.is_none() {
        return None;
    }
    Some(CfExtraDto {
        data_bar: data_bar.as_ref().map(|d| DataBarDto {
            positive_color: resolve_color(&d.positive_color, theme)
                .unwrap_or_else(|| "#638EC6".to_string()),
            negative_color: resolve_color(&d.negative_color, theme)
                .unwrap_or_else(|| "#FF0000".to_string()),
            gradient: d.is_gradient,
            value: d.value,
            axis: d.axis_position,
            show_value: d.show_value,
        }),
        icon: icon.as_ref().map(|i| IconDto {
            icon: icon_name(&i.icon),
            color: resolve_color(&i.color, theme).unwrap_or_else(|| "#808080".to_string()),
            show_value: i.show_value,
        }),
        rating: rating.as_ref().map(|r| RatingDto {
            icon: icon_name(&r.icon),
            count: r.count,
            max: r.max,
            color: resolve_color(&r.color, theme).unwrap_or_else(|| "#FFC000".to_string()),
            show_value: r.show_value,
        }),
    })
}

/// Cell kinds sent to the renderer (drives default alignment and overflow).
pub mod kind {
    pub const EMPTY: u8 = 0;
    pub const NUMBER: u8 = 1;
    pub const TEXT: u8 = 2;
    pub const BOOLEAN: u8 = 3;
    pub const ERROR: u8 = 4;
    /// Bit flag OR-ed into the kind when the cell holds a formula.
    pub const FORMULA: u8 = 8;
}

/// `[row, column, text, kind, styleIndex, extras]`
pub type CellDto = (i32, i32, String, u8, u32, Option<CfExtraDto>);

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CellsChunk {
    pub sheet: u32,
    pub r1: i32,
    pub c1: i32,
    pub r2: i32,
    pub c2: i32,
    pub cells: Vec<CellDto>,
    /// Style table referenced by `CellDto.4`. Index 0 is always the default style.
    pub styles: Vec<StyleDto>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SheetLayout {
    pub sheet: u32,
    pub version: u64,
    pub default_row_px: f64,
    pub default_col_px: f64,
    /// `[row, px]` for rows whose height differs from the default (0 = hidden).
    pub rows: Vec<(i32, f64)>,
    /// `[firstColumn, lastColumn, px]` for columns whose width differs from the default.
    pub cols: Vec<(i32, i32, f64)>,
    /// `[r1, c1, r2, c2]`
    pub merges: Vec<[i32; 4]>,
    pub frozen_rows: i32,
    pub frozen_cols: i32,
    pub max_row: i32,
    pub max_col: i32,
    pub show_grid_lines: bool,
    /// `[row, styleIndex]` row-level formats (fills etc. on empty cells).
    pub row_styles: Vec<(i32, u32)>,
    /// `[firstColumn, lastColumn, styleIndex]` column-level formats.
    pub col_styles: Vec<(i32, i32, u32)>,
    pub styles: Vec<StyleDto>,
    /// `[row, col]` of cells with a note (red corner indicator).
    pub notes: Vec<[i32; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<FilterDto>,
    pub charts: Vec<super::extras::ChartSpec>,
}

/// AutoFilter buttons shown on the header row.
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FilterDto {
    pub r1: i32,
    pub c1: i32,
    pub r2: i32,
    pub c2: i32,
    /// Columns with active criteria.
    pub active: Vec<i32>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SheetInfo {
    pub index: u32,
    pub sheet_id: u32,
    pub name: String,
    pub hidden: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookInfo {
    pub id: String,
    pub title: String,
    pub path: Option<String>,
    pub format: Option<String>,
    /// Original file of a workbook that must be saved elsewhere (.xlsm).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
    pub dirty: bool,
    pub untouched: bool,
    pub sheets: Vec<SheetInfo>,
    pub active_sheet: u32,
    pub can_undo: bool,
    pub can_redo: bool,
    pub layout_version: u64,
    pub default_font: String,
    pub default_font_size: f64,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CellInfo {
    pub row: i32,
    pub col: i32,
    /// What the formula bar shows (formula or raw input).
    pub content: String,
    pub formatted: String,
    pub kind: u8,
    pub style: StyleDto,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge: Option<[i32; 4]>,
    /// Anchor `[row, col]` if the cell is part of a spilled / array range.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub array_anchor: Option<[i32; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<super::extras::Note>,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SelectionStats {
    pub count: u64,
    pub numeric_count: u64,
    pub sum: f64,
    pub min: Option<f64>,
    pub max: Option<f64>,
}

/// Partial style update sent by the ribbon / Format Cells dialog.
/// Colors: `""` resets to automatic / no fill.
#[derive(Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct StylePatch {
    pub font_name: Option<String>,
    pub font_size: Option<f64>,
    pub font_size_delta: Option<i32>,
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    pub underline: Option<bool>,
    pub strike: Option<bool>,
    pub color: Option<String>,
    pub fill: Option<String>,
    pub h_align: Option<String>,
    pub v_align: Option<String>,
    pub wrap: Option<bool>,
    pub num_fmt: Option<String>,
    /// Per-edge borders; `style: "none"` removes the edge.
    pub border_top: Option<BorderDto>,
    pub border_right: Option<BorderDto>,
    pub border_bottom: Option<BorderDto>,
    pub border_left: Option<BorderDto>,
    /// Borders on the internal edges of a range (Format Cells "Inside").
    pub border_inside_h: Option<BorderDto>,
    pub border_inside_v: Option<BorderDto>,
}

impl StylePatch {
    fn simple_fields(&self) -> usize {
        [
            self.font_size.is_some(),
            self.font_size_delta.is_some(),
            self.bold.is_some(),
            self.italic.is_some(),
            self.underline.is_some(),
            self.strike.is_some(),
            self.color.is_some(),
            self.fill.is_some(),
            self.h_align.is_some(),
            self.v_align.is_some(),
            self.wrap.is_some(),
            self.num_fmt.is_some(),
        ]
        .iter()
        .filter(|b| **b)
        .count()
    }

    fn complex_fields(&self) -> bool {
        self.font_name.is_some()
            || self.border_top.is_some()
            || self.border_right.is_some()
            || self.border_bottom.is_some()
            || self.border_left.is_some()
            || self.border_inside_h.is_some()
            || self.border_inside_v.is_some()
    }

    /// When the patch only touches one attribute that IronCalc can update
    /// natively, returns the `(style_path, value)` pair for `update_range_style`.
    pub fn as_single_path(&self) -> Option<(&'static str, String)> {
        if self.complex_fields() || self.simple_fields() != 1 {
            return None;
        }
        if let Some(v) = self.font_size {
            return Some(("font.size", format!("{}", v.round() as i32)));
        }
        if let Some(v) = self.font_size_delta {
            return Some(("font.size_delta", v.to_string()));
        }
        if let Some(v) = self.bold {
            return Some(("font.b", v.to_string()));
        }
        if let Some(v) = self.italic {
            return Some(("font.i", v.to_string()));
        }
        if let Some(v) = self.underline {
            return Some(("font.u", v.to_string()));
        }
        if let Some(v) = self.strike {
            return Some(("font.strike", v.to_string()));
        }
        if let Some(v) = &self.color {
            return Some(("font.color", v.clone()));
        }
        if let Some(v) = &self.fill {
            return Some(("fill.color", v.clone()));
        }
        if let Some(v) = &self.h_align {
            return Some(("alignment.horizontal", v.clone()));
        }
        if let Some(v) = &self.v_align {
            return Some(("alignment.vertical", v.clone()));
        }
        if let Some(v) = self.wrap {
            return Some(("alignment.wrap_text", v.to_string()));
        }
        if let Some(v) = &self.num_fmt {
            return Some(("num_fmt", v.clone()));
        }
        None
    }
}
