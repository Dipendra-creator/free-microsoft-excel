//! Excel-like interpretation of typed input that IronCalc keeps as text:
//! locale dates (28-09-2026, 28/09/2026, 2026-09-28, 28 Sep 2026), times
//! (3:45 PM, 15:45:30) and currency amounts (₹1,200.50, $5, €3).
//!
//! Returns the numeric input to store plus a number format suggestion.

#[derive(Debug, PartialEq)]
pub struct Parsed {
    pub value: String,
    pub format: String,
}

const MONTHS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

/// Days from 1899-12-30 (Excel serial) for a civil date.
fn serial(year: i64, month: i64, day: i64) -> Option<f64> {
    if !(1..=12).contains(&month) || day < 1 || !(1900..=9999).contains(&year) {
        return None;
    }
    let dim = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ => {
            if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 {
                29
            } else {
                28
            }
        }
    };
    if day > dim {
        return None;
    }
    // days_from_civil (Howard Hinnant)
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468; // days since 1970-01-01
    let s = days + 25569; // 1970-01-01 is serial 25569
    if s < 61 {
        // Excel's fictional 1900-02-29 shifts early dates; keep it simple
        return Some((s - 1) as f64);
    }
    Some(s as f64)
}

fn month_from_name(s: &str) -> Option<i64> {
    let l = s.to_ascii_lowercase();
    if l.len() < 3 {
        return None;
    }
    MONTHS
        .iter()
        .position(|m| l.starts_with(m))
        .map(|i| i as i64 + 1)
}

fn year4(y: i64, text: &str) -> i64 {
    if text.len() <= 2 {
        if y < 30 {
            2000 + y
        } else {
            1900 + y
        }
    } else {
        y
    }
}

fn parse_date(input: &str, day_first: bool) -> Option<Parsed> {
    let t = input.trim();
    let date_fmt = if day_first { "dd-mm-yyyy" } else { "m/d/yyyy" };
    // Numeric: a-b-c or a/b/c or a.b.c
    for sep in ['-', '/', '.'] {
        let parts: Vec<&str> = t.split(sep).collect();
        if parts.len() == 3 && parts.iter().all(|p| !p.is_empty()) {
            let nums: Vec<Option<i64>> = parts.iter().map(|p| p.parse::<i64>().ok()).collect();
            if nums.iter().all(|n| n.is_some()) {
                let n: Vec<i64> = nums.into_iter().map(|x| x.unwrap()).collect();
                let (y, m, d) = if parts[0].len() == 4 {
                    (n[0], n[1], n[2])
                } else if day_first {
                    (year4(n[2], parts[2]), n[1], n[0])
                } else {
                    (year4(n[2], parts[2]), n[0], n[1])
                };
                if sep == '.' && parts[0].len() != 4 && !day_first {
                    return None;
                }
                let s = serial(y, m, d)?;
                let fmt = if parts[0].len() == 4 { "yyyy-mm-dd" } else { date_fmt };
                return Some(Parsed { value: s.to_string(), format: fmt.to_string() });
            }
            // 28-Sep-2026 / 28-Sep-26
            if let (Ok(d), Some(m)) = (parts[0].parse::<i64>(), month_from_name(parts[1])) {
                if let Ok(y) = parts[2].parse::<i64>() {
                    let s = serial(year4(y, parts[2]), m, d)?;
                    return Some(Parsed { value: s.to_string(), format: "dd-mmm-yyyy".into() });
                }
            }
        }
        // 28-Sep (current year is unknown here; Excel uses the current year)
    }
    // "28 Sep 2026", "Sep 28, 2026", "28 September 2026"
    let words: Vec<&str> = t
        .split(|c: char| c.is_whitespace() || c == ',')
        .filter(|w| !w.is_empty())
        .collect();
    if words.len() == 3 {
        if let (Ok(d), Some(m), Ok(y)) = (words[0].parse::<i64>(), month_from_name(words[1]), words[2].parse::<i64>()) {
            let s = serial(year4(y, words[2]), m, d)?;
            return Some(Parsed { value: s.to_string(), format: "dd mmmm yyyy".into() });
        }
        if let (Some(m), Ok(d), Ok(y)) = (month_from_name(words[0]), words[1].parse::<i64>(), words[2].parse::<i64>()) {
            let s = serial(year4(y, words[2]), m, d)?;
            return Some(Parsed { value: s.to_string(), format: "mmmm d, yyyy".into() });
        }
    }
    None
}

fn parse_time(input: &str) -> Option<Parsed> {
    let t = input.trim().to_ascii_lowercase();
    let (body, pm) = if let Some(b) = t.strip_suffix("pm").or_else(|| t.strip_suffix("p")) {
        (b.trim(), Some(true))
    } else if let Some(b) = t.strip_suffix("am").or_else(|| t.strip_suffix("a")) {
        (b.trim(), Some(false))
    } else {
        (t.as_str(), None)
    };
    let parts: Vec<&str> = body.split(':').collect();
    if parts.len() < 2 || parts.len() > 3 || parts.iter().any(|p| p.is_empty() || p.len() > 2 && !p.contains('.')) {
        return None;
    }
    let h: i64 = parts[0].parse().ok()?;
    let m: i64 = parts[1].parse().ok()?;
    let s: f64 = if parts.len() == 3 { parts[2].parse().ok()? } else { 0.0 };
    if m > 59 || s >= 60.0 {
        return None;
    }
    let hours = match pm {
        Some(true) if (1..=12).contains(&h) => h % 12 + 12,
        Some(false) if (1..=12).contains(&h) => h % 12,
        Some(_) => return None,
        None if (0..=23).contains(&h) => h,
        None => return None,
    };
    let value = (hours as f64 * 3600.0 + m as f64 * 60.0 + s) / 86400.0;
    let format = match (pm.is_some(), parts.len()) {
        (true, 3) => "h:mm:ss AM/PM",
        (true, _) => "h:mm AM/PM",
        (false, 3) => "h:mm:ss",
        (false, _) => "h:mm",
    };
    Some(Parsed { value: format!("{value}"), format: format.to_string() })
}

fn parse_currency(input: &str) -> Option<Parsed> {
    let t = input.trim();
    let (negative, t) = match t.strip_prefix('-') {
        Some(rest) => (true, rest.trim()),
        None => (false, t),
    };
    for symbol in ["₹", "€", "£", "¥", "$", "Rs.", "Rs"] {
        if let Some(rest) = t.strip_prefix(symbol) {
            let digits = rest.trim().replace(',', "");
            let n: f64 = digits.parse().ok()?;
            let decimals = if digits.contains('.') { ".00" } else { "" };
            let sym = if symbol.starts_with("Rs") { "₹" } else { symbol };
            let value = if negative { -n } else { n };
            return Some(Parsed {
                value: format!("{value}"),
                format: format!("\"{sym}\"#,##0{decimals}"),
            });
        }
    }
    None
}

/// Interprets typed input. Returns None when IronCalc's own parsing is fine.
pub fn interpret(input: &str, day_first: bool) -> Option<Parsed> {
    let t = input.trim();
    if t.is_empty() || t.starts_with('=') || t.starts_with('\'') || t.len() > 40 {
        return None;
    }
    // Plain numbers are handled by the engine.
    if t.replace(',', "").parse::<f64>().is_ok() {
        return None;
    }
    parse_currency(t)
        .or_else(|| parse_date(t, day_first))
        .or_else(|| parse_time(t))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates() {
        assert_eq!(interpret("28-09-2026", true).unwrap().value, "46293");
        assert_eq!(interpret("28/09/2026", true).unwrap().value, "46293");
        assert_eq!(interpret("9/28/2026", false).unwrap().value, "46293");
        assert_eq!(interpret("2026-09-28", false).unwrap().value, "46293");
        assert_eq!(interpret("28 Sep 2026", true).unwrap().value, "46293");
        assert_eq!(interpret("28-Sep-26", true).unwrap().value, "46293");
        assert_eq!(interpret("1/1/2000", false).unwrap().value, "36526");
        assert!(interpret("31/02/2026", true).is_none());
        assert!(interpret("hello", true).is_none());
        assert!(interpret("1,234", true).is_none());
    }

    #[test]
    fn times_and_currency() {
        assert_eq!(interpret("3:45 PM", true).unwrap().value, format!("{}", (15.0 * 3600.0 + 45.0 * 60.0) / 86400.0));
        assert_eq!(interpret("12:00 am", true).unwrap().value, "0");
        assert_eq!(interpret("15:30:15", true).unwrap().format, "h:mm:ss");
        let c = interpret("₹1,200.50", true).unwrap();
        assert_eq!(c.value, "1200.5");
        assert_eq!(c.format, "\"₹\"#,##0.00");
        assert_eq!(interpret("-$5", true).unwrap().value, "-5");
    }
}
