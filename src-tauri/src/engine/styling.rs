//! Applying [`StylePatch`]es to IronCalc [`Style`]s.

use ironcalc_base::types::{
    Alignment, BorderItem, BorderStyle, Color, HorizontalAlignment, Style, VerticalAlignment,
};

use super::dto::{BorderDto, StylePatch};

pub fn parse_color(value: &str) -> Result<Color, String> {
    Color::from_param(&value.to_uppercase()).or_else(|_| Color::from_param(value))
}

pub fn parse_border_style(value: &str) -> Option<BorderStyle> {
    Some(match value.to_ascii_lowercase().as_str() {
        "thin" => BorderStyle::Thin,
        "medium" => BorderStyle::Medium,
        "thick" => BorderStyle::Thick,
        "double" => BorderStyle::Double,
        "dotted" | "hair" => BorderStyle::Dotted,
        "dashed" | "mediumdashed" => BorderStyle::MediumDashed,
        "dashdot" | "mediumdashdot" => BorderStyle::MediumDashDot,
        "dashdotdot" | "mediumdashdotdot" => BorderStyle::MediumDashDotDot,
        "slantdashdot" => BorderStyle::SlantDashDot,
        _ => return None,
    })
}

fn border_item(dto: &BorderDto) -> Result<Option<BorderItem>, String> {
    if dto.style == "none" || dto.style.is_empty() {
        return Ok(None);
    }
    let style = parse_border_style(&dto.style)
        .ok_or_else(|| format!("Unknown border style '{}'", dto.style))?;
    let color = if dto.color.is_empty() {
        Color::Rgb("#000000".to_string())
    } else {
        parse_color(&dto.color)?
    };
    Ok(Some(BorderItem { style, color }))
}

pub fn parse_h_align(value: &str) -> Result<HorizontalAlignment, String> {
    Ok(match value {
        "general" => HorizontalAlignment::General,
        "left" => HorizontalAlignment::Left,
        "center" => HorizontalAlignment::Center,
        "right" => HorizontalAlignment::Right,
        "fill" => HorizontalAlignment::Fill,
        "justify" => HorizontalAlignment::Justify,
        "centerContinuous" => HorizontalAlignment::CenterContinuous,
        "distributed" => HorizontalAlignment::Distributed,
        _ => return Err(format!("Unknown alignment '{value}'")),
    })
}

pub fn parse_v_align(value: &str) -> Result<VerticalAlignment, String> {
    Ok(match value {
        "top" => VerticalAlignment::Top,
        "center" => VerticalAlignment::Center,
        "bottom" => VerticalAlignment::Bottom,
        "justify" => VerticalAlignment::Justify,
        "distributed" => VerticalAlignment::Distributed,
        _ => return Err(format!("Unknown alignment '{value}'")),
    })
}

/// Where a cell sits inside the target range; used for outer/inner borders.
#[derive(Clone, Copy, Debug)]
pub struct Edges {
    pub top: bool,
    pub bottom: bool,
    pub left: bool,
    pub right: bool,
}

pub fn apply_patch(style: &mut Style, patch: &StylePatch, edges: Edges) -> Result<(), String> {
    if let Some(name) = &patch.font_name {
        style.font.name = name.clone();
    }
    if let Some(size) = patch.font_size {
        style.font.sz = (size.round() as i32).clamp(1, 409);
    }
    if let Some(delta) = patch.font_size_delta {
        style.font.sz = (style.font.sz + delta).clamp(1, 409);
    }
    if let Some(v) = patch.bold {
        style.font.b = v;
    }
    if let Some(v) = patch.italic {
        style.font.i = v;
    }
    if let Some(v) = patch.underline {
        style.font.u = v;
    }
    if let Some(v) = patch.strike {
        style.font.strike = v;
    }
    if let Some(c) = &patch.color {
        style.font.color = parse_color(c)?;
    }
    if let Some(c) = &patch.fill {
        style.fill.color = parse_color(c)?;
    }
    if patch.h_align.is_some() || patch.v_align.is_some() || patch.wrap.is_some() {
        let mut alignment = style.alignment.clone().unwrap_or_else(Alignment::default);
        if let Some(h) = &patch.h_align {
            alignment.horizontal = parse_h_align(h)?;
        }
        if let Some(v) = &patch.v_align {
            alignment.vertical = parse_v_align(v)?;
        }
        if let Some(w) = patch.wrap {
            alignment.wrap_text = w;
        }
        style.alignment = if alignment == Alignment::default() {
            None
        } else {
            Some(alignment)
        };
    }
    if let Some(f) = &patch.num_fmt {
        style.num_fmt = f.clone();
    }
    // Borders: outer edges use the edge patch, inner edges the inside patch.
    let pick = |outer: &Option<BorderDto>, inner: &Option<BorderDto>, is_edge: bool| {
        if is_edge {
            outer.clone()
        } else {
            inner.clone()
        }
    };
    if let Some(b) = pick(&patch.border_top, &patch.border_inside_h, edges.top) {
        style.border.top = border_item(&b)?;
    }
    if let Some(b) = pick(&patch.border_bottom, &patch.border_inside_h, edges.bottom) {
        style.border.bottom = border_item(&b)?;
    }
    if let Some(b) = pick(&patch.border_left, &patch.border_inside_v, edges.left) {
        style.border.left = border_item(&b)?;
    }
    if let Some(b) = pick(&patch.border_right, &patch.border_inside_v, edges.right) {
        style.border.right = border_item(&b)?;
    }
    Ok(())
}

/// Builds the number format that results from pressing Increase/Decrease Decimal
/// on a cell with format `fmt` currently displaying `shown`.
pub fn change_decimals(fmt: &str, shown: &str, delta: i32) -> String {
    let is_general = fmt.eq_ignore_ascii_case("general") || fmt.is_empty();
    if is_general {
        let shown = shown.trim();
        let decimals = shown
            .split(['E', 'e'])
            .next()
            .and_then(|mantissa| mantissa.split_once('.'))
            .map(|(_, d)| d.chars().take_while(|c| c.is_ascii_digit()).count() as i32)
            .unwrap_or(0);
        let new = (decimals + delta).max(0);
        return if new == 0 {
            "0".to_string()
        } else {
            format!("0.{}", "0".repeat(new as usize))
        };
    }
    fmt.split(';')
        .map(|section| change_section_decimals(section, delta))
        .collect::<Vec<_>>()
        .join(";")
}

fn change_section_decimals(section: &str, delta: i32) -> String {
    // Leave pure text sections alone
    if !section.contains(['0', '#', '?']) {
        return section.to_string();
    }
    let chars: Vec<char> = section.chars().collect();
    // Find the last digit placeholder outside quotes/brackets
    let mut in_quote = false;
    let mut in_bracket = false;
    let mut last_digit = None;
    let mut dot = None;
    for (i, c) in chars.iter().enumerate() {
        match c {
            '"' => in_quote = !in_quote,
            '[' if !in_quote => in_bracket = true,
            ']' if !in_quote => in_bracket = false,
            '0' | '#' | '?' if !in_quote && !in_bracket => last_digit = Some(i),
            '.' if !in_quote && !in_bracket && dot.is_none() => dot = Some(i),
            _ => {}
        }
    }
    let Some(last) = last_digit else {
        return section.to_string();
    };
    let mut out: Vec<char> = chars.clone();
    if delta > 0 {
        match dot {
            Some(_) => {
                out.insert(last + 1, '0');
            }
            None => {
                out.insert(last + 1, '0');
                out.insert(last + 1, '.');
            }
        }
    } else if let Some(d) = dot {
        if last > d {
            out.remove(last);
            // Remove the dot if no decimals remain
            if last == d + 1 {
                out.remove(d);
            }
        }
    }
    out.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decimals() {
        assert_eq!(change_decimals("general", "3.14159", 1), "0.000000");
        assert_eq!(change_decimals("general", "3.14159", -1), "0.0000");
        assert_eq!(change_decimals("general", "12", 1), "0.0");
        assert_eq!(change_decimals("#,##0.00", "1", 1), "#,##0.000");
        assert_eq!(change_decimals("#,##0.00", "1", -1), "#,##0.0");
        assert_eq!(change_decimals("#,##0.0", "1", -1), "#,##0");
        assert_eq!(change_decimals("0%", "1", 1), "0.0%");
        assert_eq!(
            change_decimals("\"$\"#,##0.00;[Red]-\"$\"#,##0.00", "1", 1),
            "\"$\"#,##0.000;[Red]-\"$\"#,##0.000"
        );
    }
}
