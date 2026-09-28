//! Templates shipped with the application.

use ironcalc_base::{expressions::types::Area, BorderArea, Model, UserModel};
use serde_json::json;

use super::{TemplateMeta, TemplateProvider};
use crate::{
    engine::{
        a1::{parse_range, Rect},
        dto::{px_to_engine_col, px_to_engine_row},
        EngineConfig,
    },
    error::{AppError, AppResult},
};

pub struct BuiltinTemplates;

struct Def {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    category: &'static str,
    kind: &'static str,
    banner: Option<(&'static str, &'static str)>,
    icon: Option<&'static str>,
    build: fn(&mut Builder),
}

const DEFS: &[Def] = &[
    Def {
        id: "welcome",
        name: "Welcome to Sheets",
        description: "A quick tour of the basics: navigation, editing and shortcuts.",
        category: "Tutorials",
        kind: "tutorial",
        banner: Some(("", "Take a tour")),
        icon: Some("arrow"),
        build: welcome,
    },
    Def {
        id: "formula-tutorial",
        name: "Formula tutorial",
        description: "Learn SUM, AVERAGE, IF, XLOOKUP and more with live examples.",
        category: "Tutorials",
        kind: "tutorial",
        banner: Some(("Get started with", "Formulas")),
        icon: Some("fx"),
        build: formula_tutorial,
    },
    Def {
        id: "monthly-budget",
        name: "Personal monthly budget",
        description: "Track projected and actual income and expenses.",
        category: "Personal",
        kind: "template",
        banner: None,
        icon: None,
        build: monthly_budget,
    },
    Def {
        id: "invoice",
        name: "Service invoice",
        description: "Simple invoice with automatic totals and tax.",
        category: "Business",
        kind: "template",
        banner: None,
        icon: None,
        build: invoice,
    },
    Def {
        id: "todo",
        name: "To-do list",
        description: "Task list with priorities, due dates and status highlighting.",
        category: "Personal",
        kind: "template",
        banner: None,
        icon: None,
        build: todo,
    },
    Def {
        id: "project-tracker",
        name: "Project tracker",
        description: "Tasks, owners, dates and progress bars.",
        category: "Business",
        kind: "template",
        banner: None,
        icon: None,
        build: project_tracker,
    },
    Def {
        id: "loan-calculator",
        name: "Loan calculator",
        description: "Monthly payment and amortization schedule.",
        category: "Finance",
        kind: "template",
        banner: None,
        icon: None,
        build: loan_calculator,
    },
    Def {
        id: "weekly-schedule",
        name: "Weekly schedule",
        description: "Plan the week hour by hour.",
        category: "Personal",
        kind: "template",
        banner: None,
        icon: None,
        build: weekly_schedule,
    },
    Def {
        id: "sales-report",
        name: "Sales report",
        description: "Monthly sales by region with totals and a color scale.",
        category: "Business",
        kind: "template",
        banner: None,
        icon: None,
        build: sales_report,
    },
    Def {
        id: "expense-report",
        name: "Expense report",
        description: "Itemised expenses with categories and totals.",
        category: "Finance",
        kind: "template",
        banner: None,
        icon: None,
        build: expense_report,
    },
];

impl TemplateProvider for BuiltinTemplates {
    fn list(&self) -> Vec<TemplateMeta> {
        DEFS.iter()
            .map(|d| TemplateMeta {
                id: d.id.to_string(),
                name: d.name.to_string(),
                description: d.description.to_string(),
                category: d.category.to_string(),
                kind: d.kind.to_string(),
                banner: d.banner.map(|(a, b)| (a.to_string(), b.to_string())),
                icon: d.icon.map(|s| s.to_string()),
                source: "builtin".to_string(),
            })
            .collect()
    }

    fn build(&self, id: &str, config: &EngineConfig) -> Option<AppResult<Model<'static>>> {
        let def = DEFS.iter().find(|d| d.id == id)?;
        Some((|| {
            let mut b = Builder::new(config, def.name)?;
            (def.build)(&mut b);
            b.finish()
        })())
    }
}

/// Small DSL to author templates with the engine API.
pub struct Builder {
    m: UserModel<'static>,
    sheet: u32,
    merges: Vec<(u32, String)>,
    error: Option<String>,
}

impl Builder {
    fn new(config: &EngineConfig, name: &str) -> AppResult<Builder> {
        let model = config.new_model(name)?;
        Ok(Builder {
            m: UserModel::from_model(model),
            sheet: 0,
            merges: vec![],
            error: None,
        })
    }

    fn record(&mut self, r: Result<(), String>) {
        if let Err(e) = r {
            if self.error.is_none() {
                self.error = Some(e);
            }
        }
    }

    fn area(&self, range: &str) -> Area {
        let r = parse_range(range).unwrap_or(Rect::cell(1, 1));
        Area {
            sheet: self.sheet,
            row: r.r1,
            column: r.c1,
            width: r.width(),
            height: r.height(),
        }
    }

    /// Sets a value or formula.
    fn v(&mut self, cell: &str, value: &str) -> &mut Self {
        let (row, col) = crate::engine::a1::parse_cell(cell).unwrap_or((1, 1));
        let r = self.m.set_user_input(self.sheet, row, col, value);
        self.record(r);
        self
    }

    /// Writes a row of values starting at `cell`.
    fn row(&mut self, cell: &str, values: &[&str]) -> &mut Self {
        let (row, col) = crate::engine::a1::parse_cell(cell).unwrap_or((1, 1));
        for (i, value) in values.iter().enumerate() {
            if value.is_empty() {
                continue;
            }
            let r = self.m.set_user_input(self.sheet, row, col + i as i32, value);
            self.record(r);
        }
        self
    }

    fn s(&mut self, range: &str, path: &str, value: &str) -> &mut Self {
        let area = self.area(range);
        let r = self.m.update_range_style(&area, path, value);
        self.record(r);
        self
    }

    fn bold(&mut self, range: &str) -> &mut Self {
        self.s(range, "font.b", "true")
    }

    fn size(&mut self, range: &str, pt: i32) -> &mut Self {
        self.s(range, "font.size", &pt.to_string())
    }

    fn color(&mut self, range: &str, color: &str) -> &mut Self {
        self.s(range, "font.color", color)
    }

    fn fill(&mut self, range: &str, color: &str) -> &mut Self {
        self.s(range, "fill.color", color)
    }

    fn fmt(&mut self, range: &str, fmt: &str) -> &mut Self {
        self.s(range, "num_fmt", fmt)
    }

    fn align(&mut self, range: &str, h: &str) -> &mut Self {
        self.s(range, "alignment.horizontal", h)
    }

    fn valign(&mut self, range: &str, v: &str) -> &mut Self {
        self.s(range, "alignment.vertical", v)
    }

    fn wrap(&mut self, range: &str) -> &mut Self {
        self.s(range, "alignment.wrap_text", "true")
    }

    fn border(&mut self, range: &str, kind: &str, style: &str, color: &str) -> &mut Self {
        let area = self.area(range);
        let border: Result<BorderArea, _> = serde_json::from_value(json!({
            "item": { "style": style, "color": color },
            "type": kind,
        }));
        match border {
            Ok(b) => {
                let r = self.m.set_area_with_border(&area, &b);
                self.record(r);
            }
            Err(e) => self.record(Err(e.to_string())),
        }
        self
    }

    fn width(&mut self, col: i32, px: f64) -> &mut Self {
        let r = self.m.set_columns_width(self.sheet, col, col, px_to_engine_col(px));
        self.record(r);
        self
    }

    fn widths(&mut self, px: &[f64]) -> &mut Self {
        for (i, w) in px.iter().enumerate() {
            self.width(i as i32 + 1, *w);
        }
        self
    }

    fn height(&mut self, row: i32, px: f64) -> &mut Self {
        let r = self.m.set_rows_height(self.sheet, row, row, px_to_engine_row(px));
        self.record(r);
        self
    }

    fn merge(&mut self, range: &str) -> &mut Self {
        self.merges.push((self.sheet, range.to_string()));
        self
    }

    fn cf(&mut self, range: &str, rule: serde_json::Value) -> &mut Self {
        match serde_json::from_value(rule) {
            Ok(rule) => {
                let r = self.m.add_conditional_formatting(self.sheet, range, rule);
                self.record(r);
            }
            Err(e) => self.record(Err(format!("cf: {e}"))),
        }
        self
    }

    fn freeze_rows(&mut self, rows: i32) -> &mut Self {
        let r = self.m.set_frozen_rows_count(self.sheet, rows);
        self.record(r);
        self
    }

    fn gridlines(&mut self, show: bool) -> &mut Self {
        let r = self.m.set_show_grid_lines(self.sheet, show);
        self.record(r);
        self
    }

    fn rename(&mut self, name: &str) -> &mut Self {
        let r = self.m.rename_sheet(self.sheet, name);
        self.record(r);
        self
    }

    /// Table look: header fill + banded rows + light borders.
    fn table(&mut self, header: &str, body: &str, accent: &str, band: &str) -> &mut Self {
        self.fill(header, accent).color(header, "#FFFFFF").bold(header);
        if let Some(r) = parse_range(body) {
            for row in (r.r1..=r.r2).step_by(2) {
                let line = Rect::new(row, r.c1, row, r.c2).to_a1();
                self.fill(&line, band);
            }
        }
        let all = {
            let h = parse_range(header).unwrap_or(Rect::cell(1, 1));
            let b = parse_range(body).unwrap_or(h);
            Rect::new(h.r1, h.c1, b.r2, b.c2).to_a1()
        };
        self.border(&all, "All", "thin", "#BFBFBF")
    }

    fn finish(mut self) -> AppResult<Model<'static>> {
        if let Some(e) = self.error.take() {
            return Err(AppError::Engine(format!("Template error: {e}")));
        }
        let _ = self.m.set_selected_sheet(0);
        let _ = self.m.set_selected_cell(1, 1);
        let bytes = self.m.to_bytes();
        let mut model = Model::from_bytes(&bytes, "en")?;
        for (sheet, range) in &self.merges {
            if let Some(ws) = model.workbook.worksheets.get_mut(*sheet as usize) {
                ws.merge_cells.push(range.clone());
            }
        }
        model.evaluate();
        Ok(model)
    }
}

// ----------------------------------------------------------------------
// Template definitions
// ----------------------------------------------------------------------

const TEAL: &str = "#1F4E78";
const BAND: &str = "#DDEBF7";
const GREEN: &str = "#217346";

fn welcome(b: &mut Builder) {
    b.rename("Welcome").gridlines(false);
    b.widths(&[24.0, 220.0, 360.0, 64.0]);
    b.v("B2", "Welcome to Sheets").size("B2", 24).bold("B2").color("B2", GREEN);
    b.height(2, 44.0);
    b.v("B3", "A lightweight, Excel-compatible spreadsheet. Here are the essentials.")
        .color("B3", "#595959");
    b.row("B5", &["Action", "How"]);
    let rows = [
        ("Edit a cell", "Start typing, or press F2 / double-click to edit the existing value"),
        ("Enter a formula", "Type = then a formula, e.g. =SUM(A1:A10). Click cells to insert references"),
        ("Fill a series", "Drag the small square at the bottom-right of the selection"),
        ("Absolute reference", "Press F4 while editing a reference to cycle $A$1, A$1, $A1"),
        ("Select a whole column/row", "Click its header, or Ctrl+Space / Shift+Space"),
        ("Jump to data edge", "Ctrl + Arrow keys (add Shift to select)"),
        ("Format cells", "Ctrl+1 opens the Format Cells dialog"),
        ("Undo / Redo", "Ctrl+Z / Ctrl+Y"),
        ("Find & Replace", "Ctrl+F / Ctrl+H"),
        ("Save", "Ctrl+S saves as .xlsx that opens in Microsoft Excel"),
    ];
    for (i, (a, h)) in rows.iter().enumerate() {
        let r = 6 + i as i32;
        b.v(&format!("B{r}"), a).v(&format!("C{r}"), h);
    }
    b.table("B5:C5", "B6:C15", GREEN, "#E2EFDA");
    b.wrap("C6:C15");
    b.v("B17", "Try it: type numbers in D6:D8 and see the total here →")
        .color("B17", "#595959");
    b.v("D17", "=SUM(D6:D8)").bold("D17");
}

fn formula_tutorial(b: &mut Builder) {
    b.rename("Formulas").gridlines(false);
    b.widths(&[24.0, 150.0, 90.0, 90.0, 90.0, 24.0, 300.0]);
    b.v("B2", "Get started with formulas").size("B2", 22).bold("B2").color("B2", GREEN);
    b.height(2, 40.0);
    b.v("B3", "Every formula starts with =. Change the blue numbers and watch the results update.")
        .color("B3", "#595959");

    b.row("B5", &["Item", "Q1", "Q2", "Q3"]);
    b.row("B6", &["Apples", "120", "150", "90"]);
    b.row("B7", &["Oranges", "80", "60", "110"]);
    b.row("B8", &["Bananas", "200", "180", "210"]);
    b.table("B5:E5", "B6:E8", GREEN, "#E2EFDA");
    b.color("C6:E8", "#0070C0");

    let examples = [
        ("Total of Q1", "=SUM(C6:C8)", "=SUM(C6:C8) adds a range"),
        ("Average of Q2", "=AVERAGE(D6:D8)", "=AVERAGE(D6:D8) averages a range"),
        ("Best Q3", "=MAX(E6:E8)", "=MAX(E6:E8) returns the largest value"),
        ("Apples > 100 in Q1?", "=IF(C6>100,\"Yes\",\"No\")", "=IF(test, if true, if false)"),
        ("Q2 for Oranges", "=XLOOKUP(\"Oranges\",B6:B8,D6:D8)", "=XLOOKUP(what, where, return)"),
        ("Quarters above 100", "=COUNTIF(C6:E8,\">100\")", "=COUNTIF(range, criteria)"),
        ("Grand total", "=SUM(C6:E8)", "Ranges can span several columns"),
        ("Today", "=TODAY()", "Dates are numbers formatted as dates"),
    ];
    b.row("B10", &["Question", "Answer"]);
    b.v("G10", "How it works");
    for (i, (q, f, h)) in examples.iter().enumerate() {
        let r = 11 + i as i32;
        // A leading apostrophe keeps "=..." explanations as text.
        let help = if h.starts_with('=') { format!("'{h}") } else { h.to_string() };
        b.v(&format!("B{r}"), q).v(&format!("C{r}"), f).v(&format!("G{r}"), &help);
    }
    b.merge("C10:E10");
    b.table("B10:E10", "B11:E18", "#375623", "#F2F2F2");
    b.bold("G10").color("G11:G18", "#595959");
    b.fmt("C17", "#,##0").fmt("C18", "dd-mmm-yyyy");
}

fn monthly_budget(b: &mut Builder) {
    b.rename("Budget").gridlines(false);
    b.widths(&[24.0, 190.0, 110.0, 110.0, 110.0]);
    b.v("B2", "Personal Monthly Budget").size("B2", 22).bold("B2").color("B2", TEAL);
    b.height(2, 40.0);

    b.row("B4", &["Income", "Projected", "Actual"]);
    b.row("B5", &["Income 1", "4000", "4000"]);
    b.row("B6", &["Income 2", "1500", "1650"]);
    b.row("B7", &["Extra income", "300", "220"]);
    b.row("B8", &["Total income", "=SUM(C5:C7)", "=SUM(D5:D7)"]);
    b.table("B4:D4", "B5:D7", TEAL, BAND);
    b.bold("B8:D8").border("B8:D8", "Top", "double", TEAL);

    b.row("B10", &["Expenses", "Projected", "Actual", "Difference"]);
    let items = [
        ("Housing", "1500", "1500"),
        ("Transportation", "350", "410"),
        ("Insurance", "200", "200"),
        ("Food", "600", "680"),
        ("Utilities", "220", "195"),
        ("Personal care", "120", "90"),
        ("Entertainment", "200", "260"),
        ("Loans", "400", "400"),
        ("Savings", "800", "700"),
        ("Gifts & donations", "100", "60"),
    ];
    for (i, (name, p, a)) in items.iter().enumerate() {
        let r = 11 + i as i32;
        b.row(&format!("B{r}"), &[name, p, a, &format!("=C{r}-D{r}")]);
    }
    b.row("B21", &["Total expenses", "=SUM(C11:C20)", "=SUM(D11:D20)", "=SUM(E11:E20)"]);
    b.table("B10:E10", "B11:E20", TEAL, BAND);
    b.bold("B21:E21").border("B21:E21", "Top", "double", TEAL);

    b.row("B23", &["Balance", "=C8-C21", "=D8-D21"]);
    b.bold("B23:D23").size("B23:D23", 13).fill("B23:D23", "#FFF2CC");
    b.fmt("C5:E23", "#,##0.00");
    b.cf(
        "E11:E20",
        json!({"type":"CellIs","operator":"LessThan","formula":"0","formula2":null,
               "format":{"font":{"color":"#9C0006"},"fill":{"color":"#FFC7CE"}},"stop_if_true":false}),
    );
}

fn invoice(b: &mut Builder) {
    b.rename("Invoice").gridlines(false);
    b.widths(&[24.0, 260.0, 70.0, 100.0, 110.0]);
    b.v("B2", "INVOICE").size("B2", 26).bold("B2").color("B2", TEAL);
    b.height(2, 44.0);
    b.v("B3", "Your Company Name").bold("B3");
    b.v("B4", "123 Business Road, City");
    b.v("B5", "billing@company.com");
    b.row("D3", &["Invoice #", "INV-0001"]);
    b.row("D4", &["Date", "=TODAY()"]);
    b.row("D5", &["Due", "=E4+30"]);
    b.bold("D3:D5").fmt("E4:E5", "dd-mmm-yyyy").align("E3:E5", "right");

    b.v("B7", "Bill to").bold("B7").color("B7", TEAL);
    b.v("B8", "Customer name");
    b.v("B9", "Customer address");

    b.row("B11", &["Description", "Qty", "Unit price", "Amount"]);
    let lines = [
        ("Consulting services", "10", "2500"),
        ("Implementation", "1", "18000"),
        ("Support (monthly)", "3", "1500"),
        ("", "", ""),
        ("", "", ""),
    ];
    for (i, (d, q, p)) in lines.iter().enumerate() {
        let r = 12 + i as i32;
        b.row(&format!("B{r}"), &[d, q, p]);
        b.v(&format!("E{r}"), &format!("=IF(C{r}=\"\",\"\",C{r}*D{r})"));
    }
    b.table("B11:E11", "B12:E16", TEAL, BAND);
    b.row("D18", &["Subtotal", "=SUM(E12:E16)"]);
    b.row("D19", &["Tax rate", "18%"]);
    b.row("D20", &["Tax", "=E18*E19"]);
    b.row("D21", &["Total", "=E18+E20"]);
    b.bold("D18:D21").bold("E21").size("D21:E21", 13).fill("D21:E21", "#FFF2CC");
    b.border("D21:E21", "Top", "double", TEAL);
    b.fmt("D12:E16", "#,##0.00").fmt("E18", "#,##0.00").fmt("E20:E21", "#,##0.00").fmt("E19", "0%");
    b.v("B23", "Thank you for your business!").color("B23", "#7F7F7F");
}

fn todo(b: &mut Builder) {
    b.rename("To-do");
    b.widths(&[40.0, 280.0, 80.0, 100.0, 100.0, 100.0]);
    b.v("A1", "To-do list").size("A1", 22).bold("A1").color("A1", "#833C0B");
    b.height(1, 40.0);
    b.row("A3", &["#", "Task", "Priority", "Status", "Start", "Due"]);
    let tasks = [
        ("Prepare quarterly report", "High", "In progress", "0", "3"),
        ("Book team offsite venue", "Medium", "Not started", "1", "10"),
        ("Review pull requests", "High", "Done", "-2", "0"),
        ("Update onboarding docs", "Low", "Not started", "2", "14"),
        ("Plan sprint backlog", "Medium", "Done", "-5", "-1"),
        ("Renew software licences", "High", "Not started", "0", "5"),
    ];
    for (i, (t, p, s, start, due)) in tasks.iter().enumerate() {
        let r = 4 + i as i32;
        b.row(
            &format!("A{r}"),
            &[&(i + 1).to_string(), t, p, s, &format!("=TODAY()+{start}"), &format!("=TODAY()+{due}")],
        );
    }
    b.table("A3:F3", "A4:F13", "#C55A11", "#FBE5D6");
    b.fmt("E4:F13", "dd-mmm").align("A4:A13", "center").align("C4:D13", "center");
    b.freeze_rows(3);
    b.cf(
        "D4:D13",
        json!({"type":"Text","operator":"Equals","value":"Done",
               "format":{"font":{"color":"#006100"},"fill":{"color":"#C6EFCE"}},"stop_if_true":false}),
    );
    b.cf(
        "C4:C13",
        json!({"type":"Text","operator":"Equals","value":"High",
               "format":{"font":{"color":"#9C0006","b":true}},"stop_if_true":false}),
    );
}

fn project_tracker(b: &mut Builder) {
    b.rename("Projects");
    b.widths(&[240.0, 110.0, 95.0, 95.0, 60.0, 120.0, 110.0]);
    b.v("A1", "Project tracker").size("A1", 22).bold("A1").color("A1", "#375623");
    b.height(1, 40.0);
    b.row("A3", &["Task", "Owner", "Start", "End", "Days", "% Complete", "Status"]);
    let rows = [
        ("Requirements", "Asha", "0", "6", "1"),
        ("Design", "Ravi", "5", "15", "0.8"),
        ("Development", "Meera", "12", "40", "0.45"),
        ("Testing", "John", "35", "50", "0.1"),
        ("Deployment", "Ravi", "50", "55", "0"),
        ("Training", "Asha", "52", "60", "0"),
    ];
    for (i, (t, o, s, e, p)) in rows.iter().enumerate() {
        let r = 4 + i as i32;
        b.row(
            &format!("A{r}"),
            &[
                t,
                o,
                &format!("=DATE(2026,1,5)+{s}"),
                &format!("=DATE(2026,1,5)+{e}"),
                &format!("=D{r}-C{r}"),
                p,
                &format!("=IF(F{r}>=1,\"Complete\",IF(F{r}>0,\"In progress\",\"Not started\"))"),
            ],
        );
    }
    b.table("A3:G3", "A4:G9", "#548235", "#E2EFDA");
    b.fmt("C4:D9", "dd-mmm-yy").fmt("F4:F9", "0%").align("E4:E9", "center");
    b.freeze_rows(3);
    b.cf(
        "F4:F9",
        json!({"type":"DataBar","min":{"Number":0.0},"max":{"Number":1.0},"positive_color":"#63BE7B",
               "negative_color":"#F8696B","is_gradient":true,"show_value":true}),
    );
}

fn loan_calculator(b: &mut Builder) {
    b.rename("Loan").gridlines(false);
    b.widths(&[24.0, 170.0, 120.0, 120.0, 120.0, 130.0]);
    b.v("B2", "Loan calculator").size("B2", 22).bold("B2").color("B2", TEAL);
    b.height(2, 40.0);
    b.row("B4", &["Loan amount", "500000"]);
    b.row("B5", &["Annual interest rate", "8.5%"]);
    b.row("B6", &["Term (years)", "5"]);
    b.row("B7", &["Monthly payment", "=PMT(C5/12,C6*12,-C4)"]);
    b.row("B8", &["Total interest", "=C7*C6*12-C4"]);
    b.fill("C4:C6", "#FFF2CC").color("C4:C6", "#0070C0").bold("B7:C7");
    b.border("B4:C8", "All", "thin", "#BFBFBF");
    b.fmt("C4", "#,##0").fmt("C5", "0.00%").fmt("C7:C8", "#,##0.00");

    b.row("B10", &["Month", "Payment", "Principal", "Interest", "Balance"]);
    for m in 1..=12 {
        let r = 10 + m;
        let prev = if m == 1 { "$C$4".to_string() } else { format!("F{}", r - 1) };
        b.row(
            &format!("B{r}"),
            &[
                &m.to_string(),
                "=$C$7",
                &format!("=PPMT($C$5/12,B{r},$C$6*12,-$C$4)"),
                &format!("=IPMT($C$5/12,B{r},$C$6*12,-$C$4)"),
                &format!("={prev}-D{r}"),
            ],
        );
    }
    b.table("B10:F10", "B11:F22", TEAL, BAND);
    b.fmt("C11:F22", "#,##0.00").align("B11:B22", "center");
}

fn weekly_schedule(b: &mut Builder) {
    b.rename("Schedule");
    b.widths(&[90.0, 110.0, 110.0, 110.0, 110.0, 110.0, 110.0, 110.0]);
    b.v("A1", "Weekly schedule").size("A1", 22).bold("A1").color("A1", "#7030A0");
    b.height(1, 40.0);
    b.row("A3", &["Time", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    for i in 0..11 {
        let r = 4 + i;
        b.v(&format!("A{r}"), &format!("=TIME({},0,0)", 8 + i));
    }
    b.row("B4", &["Stand-up", "Stand-up", "Stand-up", "Stand-up", "Stand-up"]);
    b.row("C6", &["Design review"]);
    b.row("E8", &["1:1s"]);
    b.row("F12", &["Demo"]);
    b.row("G5", &["Gym"]);
    b.table("A3:H3", "A4:H14", "#7030A0", "#E4DFEC");
    b.fmt("A4:A14", "h:mm AM/PM").align("A4:A14", "center").align("B3:H3", "center");
    b.freeze_rows(3);
}

fn sales_report(b: &mut Builder) {
    b.rename("Sales");
    b.widths(&[110.0, 80.0, 80.0, 80.0, 80.0, 80.0, 80.0, 100.0]);
    b.v("A1", "Sales report").size("A1", 22).bold("A1").color("A1", TEAL);
    b.height(1, 40.0);
    b.row("A3", &["Region", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Total"]);
    let data = [
        ("North", [120, 135, 150, 160, 158, 171]),
        ("South", [98, 102, 97, 110, 125, 131]),
        ("East", [143, 139, 152, 149, 161, 170]),
        ("West", [87, 92, 101, 99, 108, 115]),
        ("Central", [110, 118, 121, 130, 128, 140]),
    ];
    for (i, (region, values)) in data.iter().enumerate() {
        let r = 4 + i as i32;
        let mut row: Vec<String> = vec![region.to_string()];
        row.extend(values.iter().map(|v| (v * 1000).to_string()));
        row.push(format!("=SUM(B{r}:G{r})"));
        let refs: Vec<&str> = row.iter().map(|s| s.as_str()).collect();
        b.row(&format!("A{r}"), &refs);
    }
    b.row(
        "A9",
        &["Total", "=SUM(B4:B8)", "=SUM(C4:C8)", "=SUM(D4:D8)", "=SUM(E4:E8)", "=SUM(F4:F8)", "=SUM(G4:G8)", "=SUM(H4:H8)"],
    );
    b.table("A3:H3", "A4:H8", TEAL, BAND);
    b.bold("A9:H9").border("A9:H9", "Top", "double", TEAL);
    b.fmt("B4:H9", "#,##0");
    b.cf(
        "B4:G8",
        json!({"type":"ColorScale","thresholds":[
            {"cfvo":"Min","color":"#F8696B"},
            {"cfvo":{"Percentile":50.0},"color":"#FFEB84"},
            {"cfvo":"Max","color":"#63BE7B"}]}),
    );
    b.v("A11", "Best month").v("B11", "=INDEX(B3:G3,MATCH(MAX(B9:G9),B9:G9,0))").bold("A11");
    b.v("A12", "Average / region").v("B12", "=AVERAGE(H4:H8)").fmt("B12", "#,##0").bold("A12");
}

fn expense_report(b: &mut Builder) {
    b.rename("Expenses");
    b.widths(&[100.0, 260.0, 130.0, 110.0]);
    b.v("A1", "Expense report").size("A1", 22).bold("A1").color("A1", "#C00000");
    b.height(1, 40.0);
    b.row("A2", &["Employee", "Your name"]);
    b.row("A3", &["Period", "=TEXT(TODAY(),\"mmmm yyyy\")"]);
    b.bold("A2:A3");
    b.row("A5", &["Date", "Description", "Category", "Amount"]);
    let items = [
        ("-20", "Client lunch", "Meals", "1850"),
        ("-18", "Taxi to airport", "Travel", "740"),
        ("-18", "Flight to Mumbai", "Travel", "6400"),
        ("-17", "Hotel (2 nights)", "Lodging", "9800"),
        ("-12", "Conference ticket", "Training", "5000"),
        ("-6", "Office supplies", "Supplies", "620"),
    ];
    for (i, (d, desc, cat, amt)) in items.iter().enumerate() {
        let r = 6 + i as i32;
        b.row(&format!("A{r}"), &[&format!("=TODAY(){d}"), desc, cat, amt]);
    }
    b.table("A5:D5", "A6:D13", "#C00000", "#FCE4D6");
    b.row("C15", &["Total", "=SUM(D6:D13)"]);
    b.bold("C15:D15").border("C15:D15", "Top", "double", "#C00000");
    b.fmt("A6:A13", "dd-mmm-yyyy").fmt("D6:D15", "#,##0.00");
    b.freeze_rows(5);
    b.cf(
        "D6:D13",
        json!({"type":"DataBar","min":null,"max":null,"positive_color":"#FF7C80",
               "negative_color":"#FF0000","is_gradient":true,"show_value":true}),
    );
    b.valign("A5:D5", "center");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_templates_build() {
        let cfg = crate::engine::test_config();
        for def in DEFS {
            let model = BuiltinTemplates
                .build(def.id, &cfg)
                .unwrap()
                .unwrap_or_else(|e| panic!("{}: {e}", def.id));
            assert!(!model.workbook.worksheets.is_empty());
            // No formula should produce #NAME? / #ERROR!
            let ws = &model.workbook.worksheets[0];
            for (r, row) in &ws.sheet_data {
                for c in row.keys() {
                    let v = model.get_formatted_cell_value(0, *r, *c).unwrap();
                    assert!(
                        !v.starts_with("#NAME") && !v.starts_with("#ERROR") && !v.starts_with("#VALUE"),
                        "{} {}:{} -> {}",
                        def.id,
                        r,
                        c,
                        v
                    );
                }
            }
        }
    }
}
