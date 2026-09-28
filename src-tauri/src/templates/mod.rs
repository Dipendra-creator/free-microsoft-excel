//! Workbook templates.
//!
//! Templates come from [`TemplateProvider`]s. Today there is a single built-in
//! provider; a database-backed provider can be registered later so users can
//! pick organisation templates and keep them in sync.

mod builtin;

use std::{collections::HashMap, sync::Mutex};

use ironcalc_base::{types::Cell, Model};
use serde::Serialize;

use crate::{
    engine::{
        dto::{col_chars_to_px, resolve_color, row_pt_to_px, DEFAULT_COL_PX, DEFAULT_ROW_PX},
        EngineConfig,
    },
    error::AppResult,
};

pub use builtin::BuiltinTemplates;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TemplateMeta {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    /// "tutorial" tiles are drawn with a banner, "template" with a sheet preview.
    pub kind: String,
    /// Tutorial banner caption, e.g. "Get started with / Formulas".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub banner: Option<(String, String)>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// Where the template comes from ("builtin" today, "remote" later).
    pub source: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PreviewCell {
    pub r: i32,
    pub c: i32,
    pub t: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub bold: bool,
    pub size: f64,
    pub align: String,
}

/// A thumbnail-sized snapshot of a template's first sheet.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TemplatePreview {
    pub cols: Vec<f64>,
    pub rows: Vec<f64>,
    pub cells: Vec<PreviewCell>,
    pub merges: Vec<[i32; 4]>,
}

pub trait TemplateProvider: Send + Sync {
    fn list(&self) -> Vec<TemplateMeta>;
    /// Builds a fresh model for the template, `None` if the id is unknown.
    fn build(&self, id: &str, config: &EngineConfig) -> Option<AppResult<Model<'static>>>;
}

pub struct TemplateRegistry {
    providers: Vec<Box<dyn TemplateProvider>>,
    previews: Mutex<HashMap<String, TemplatePreview>>,
}

impl TemplateRegistry {
    pub fn new(providers: Vec<Box<dyn TemplateProvider>>) -> Self {
        TemplateRegistry {
            providers,
            previews: Mutex::new(HashMap::new()),
        }
    }

    pub fn list(&self) -> Vec<TemplateMeta> {
        self.providers.iter().flat_map(|p| p.list()).collect()
    }

    pub fn build(&self, id: &str, config: &EngineConfig) -> Option<AppResult<Model<'static>>> {
        self.providers.iter().find_map(|p| p.build(id, config))
    }

    pub fn name_of(&self, id: &str) -> Option<String> {
        self.list().into_iter().find(|t| t.id == id).map(|t| t.name)
    }

    pub fn preview(&self, id: &str, config: &EngineConfig) -> AppResult<Option<TemplatePreview>> {
        if let Some(p) = self.previews.lock().unwrap().get(id) {
            return Ok(Some(p.clone()));
        }
        let Some(model) = self.build(id, config) else {
            return Ok(None);
        };
        let model = model?;
        let preview = make_preview(&model, 18, 9);
        self.previews
            .lock()
            .unwrap()
            .insert(id.to_string(), preview.clone());
        Ok(Some(preview))
    }
}

fn make_preview(model: &Model, max_rows: i32, max_cols: i32) -> TemplatePreview {
    let theme = &model.workbook.theme;
    let Some(ws) = model.workbook.worksheets.first() else {
        return TemplatePreview { cols: vec![], rows: vec![], cells: vec![], merges: vec![] };
    };
    let mut cols = vec![DEFAULT_COL_PX; max_cols as usize];
    for c in &ws.cols {
        for col in c.min..=c.max.min(max_cols) {
            if col >= 1 && c.custom_width {
                cols[(col - 1) as usize] = if c.hidden { 0.0 } else { col_chars_to_px(c.width) };
            }
        }
    }
    let mut rows = vec![DEFAULT_ROW_PX; max_rows as usize];
    for r in &ws.rows {
        if r.r >= 1 && r.r <= max_rows && r.custom_height {
            rows[(r.r - 1) as usize] = row_pt_to_px(r.height);
        }
    }
    let mut cells = Vec::new();
    for row in 1..=max_rows {
        for col in 1..=max_cols {
            let cell = ws.cell(row, col);
            let style = model.get_style_for_cell(0, row, col).ok();
            let text = match cell {
                Some(Cell::EmptyCell { .. }) | None => String::new(),
                Some(_) => model.get_formatted_cell_value(0, row, col).unwrap_or_default(),
            };
            let Some(style) = style else { continue };
            let fill = resolve_color(&style.fill.color, theme);
            if text.is_empty() && fill.is_none() {
                continue;
            }
            let numeric = matches!(
                cell,
                Some(Cell::NumberCell { .. }) | Some(Cell::CellFormula { .. })
            ) && text.chars().any(|c| c.is_ascii_digit());
            let align = style
                .alignment
                .as_ref()
                .map(|a| a.horizontal.to_string())
                .filter(|a| a != "general")
                .unwrap_or_else(|| if numeric { "right".into() } else { "left".into() });
            cells.push(PreviewCell {
                r: row,
                c: col,
                t: text.chars().take(40).collect(),
                fill,
                color: resolve_color(&style.font.color, theme),
                bold: style.font.b,
                size: style.font.sz as f64,
                align,
            });
        }
    }
    let merges = ws
        .merge_cells
        .iter()
        .filter_map(|m| crate::engine::a1::parse_range(m))
        .map(|r| r.to_array())
        .collect();
    TemplatePreview { cols, rows, cells, merges }
}
