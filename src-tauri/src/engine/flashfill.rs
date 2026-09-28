//! Flash Fill: learns a text transformation from a few examples
//! ("John Smith" → "Smith, J.") and applies it to the other rows.
//!
//! A program is a sequence of atoms — constant text, or a piece of one of the
//! row's cells cut at word boundaries (the n-th word from the start or end,
//! the n-th number…), optionally re-cased or shortened to its first letters.
//! The search is a cheapest-first walk over the examples' outputs that keeps
//! every example consistent at each step, so the first complete program found
//! explains all examples with the fewest, most general atoms.

use std::{
    cmp::Reverse,
    collections::{BinaryHeap, HashMap},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum Class {
    Alpha,
    Digit,
}

#[derive(Clone, Debug)]
struct Token {
    start: usize,
    end: usize,
    class: Class,
}

/// Which token: the n-th of all tokens, or the n-th of one class
/// (negative = counted from the end).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum Pos {
    Nth(i32),
    Class(Class, i32),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum Case {
    Same,
    Upper,
    Lower,
    Title,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
enum Atom {
    Const(String),
    /// From the start of one token to the end of another (inclusive).
    Span { col: usize, from: Pos, to: Pos, case: Case },
    /// The first `len` characters of a token.
    Prefix { col: usize, tok: Pos, len: usize, case: Case },
    /// The whole cell, trimmed.
    Whole { col: usize, case: Case },
}

/// A learned transformation.
#[derive(Clone, Debug, PartialEq)]
pub struct Program(Vec<Atom>);

const CASES: [Case; 4] = [Case::Same, Case::Upper, Case::Lower, Case::Title];
const MAX_SPAN: usize = 8;
const MAX_CONST: usize = 40;
const MAX_STEPS: usize = 200_000;

fn tokens(s: &str) -> Vec<Token> {
    let mut out: Vec<Token> = Vec::new();
    for (i, ch) in s.char_indices() {
        let class = if ch.is_alphabetic() {
            Some(Class::Alpha)
        } else if ch.is_ascii_digit() {
            Some(Class::Digit)
        } else {
            None
        };
        match (class, out.last_mut()) {
            (Some(c), Some(last)) if last.class == c && last.end == i => last.end = i + ch.len_utf8(),
            (Some(c), _) => out.push(Token { start: i, end: i + ch.len_utf8(), class: c }),
            (None, _) => {}
        }
    }
    out
}

fn resolve(pos: Pos, toks: &[Token]) -> Option<usize> {
    let pick = |n: i32, len: usize| -> Option<usize> {
        let i = if n >= 0 { n as i64 } else { len as i64 + n as i64 };
        (0..len as i64).contains(&i).then_some(i as usize)
    };
    match pos {
        Pos::Nth(n) => pick(n, toks.len()),
        Pos::Class(c, n) => {
            let of: Vec<usize> = (0..toks.len()).filter(|&i| toks[i].class == c).collect();
            pick(n, of.len()).map(|k| of[k])
        }
    }
}

fn recase(s: &str, case: Case) -> String {
    match case {
        Case::Same => s.to_string(),
        Case::Upper => s.to_uppercase(),
        Case::Lower => s.to_lowercase(),
        Case::Title => {
            let mut out = String::with_capacity(s.len());
            let mut start = true;
            for ch in s.chars() {
                if ch.is_alphabetic() {
                    if start {
                        out.extend(ch.to_uppercase());
                    } else {
                        out.extend(ch.to_lowercase());
                    }
                    start = false;
                } else {
                    out.push(ch);
                    start = !ch.is_ascii_digit();
                }
            }
            out
        }
    }
}

/// A row's cells with their tokens.
struct Row<'a> {
    cells: Vec<(&'a str, Vec<Token>)>,
}

impl<'a> Row<'a> {
    fn new(inputs: &'a [String]) -> Row<'a> {
        Row { cells: inputs.iter().map(|s| (s.as_str(), tokens(s))).collect() }
    }

    fn eval(&self, atom: &Atom) -> Option<String> {
        match atom {
            Atom::Const(s) => Some(s.clone()),
            Atom::Span { col, from, to, case } => {
                let (text, toks) = self.cells.get(*col)?;
                let (a, b) = (resolve(*from, toks)?, resolve(*to, toks)?);
                (a <= b).then(|| recase(&text[toks[a].start..toks[b].end], *case))
            }
            Atom::Prefix { col, tok, len, case } => {
                let (text, toks) = self.cells.get(*col)?;
                let t = &toks[resolve(*tok, toks)?];
                let word = &text[t.start..t.end];
                (word.chars().count() > *len).then(|| recase(&word.chars().take(*len).collect::<String>(), *case))
            }
            Atom::Whole { col, case } => {
                let (text, _) = self.cells.get(*col)?;
                let t = text.trim();
                (!t.is_empty()).then(|| recase(t, *case))
            }
        }
    }
}

impl Program {
    /// The output for one row, or None when the row lacks a needed part.
    pub fn run(&self, inputs: &[String]) -> Option<String> {
        let row = Row::new(inputs);
        let mut out = String::new();
        for atom in &self.0 {
            out.push_str(&row.eval(atom)?);
        }
        Some(out)
    }
}

/// Ways to name token `i` of `toks`, with a cost that prefers the nearest end.
fn refs(i: usize, toks: &[Token]) -> Vec<(Pos, u32)> {
    let n = toks.len();
    let class = toks[i].class;
    let of: Vec<usize> = (0..n).filter(|&k| toks[k].class == class).collect();
    let k = of.iter().position(|&x| x == i).unwrap_or(0);
    let m = of.len();
    vec![
        (Pos::Nth(i as i32), 10 * i as u32),
        (Pos::Nth(i as i32 - n as i32), 10 * (n - 1 - i) as u32 + 5),
        (Pos::Class(class, k as i32), 40 + 10 * k as u32),
        (Pos::Class(class, k as i32 - m as i32), 45 + 10 * (m - 1 - k) as u32),
    ]
}

fn case_cost(case: Case) -> u32 {
    if case == Case::Same {
        0
    } else {
        150
    }
}

/// Atoms (with costs) that produce a non-empty prefix of `rest` for this row.
fn candidates(row: &Row, rest: &str) -> Vec<(Atom, u32)> {
    let mut out = Vec::new();
    for (col, (text, toks)) in row.cells.iter().enumerate() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            for case in CASES {
                if rest.starts_with(&recase(trimmed, case)) {
                    out.push((Atom::Whole { col, case }, 900 + case_cost(case)));
                }
            }
        }
        for a in 0..toks.len() {
            for b in a..toks.len().min(a + MAX_SPAN) {
                let piece = &text[toks[a].start..toks[b].end];
                for case in CASES {
                    if !rest.starts_with(&recase(piece, case)) {
                        continue;
                    }
                    for (from, fc) in refs(a, toks) {
                        for (to, tc) in refs(b, toks) {
                            let cost = 1000 + 50 * (b - a) as u32 + fc + tc + case_cost(case);
                            out.push((Atom::Span { col, from, to, case }, cost));
                        }
                    }
                }
            }
            let chars = text[toks[a].start..toks[a].end].chars().count();
            for len in 1..=4.min(chars.saturating_sub(1)) {
                let piece: String = text[toks[a].start..toks[a].end].chars().take(len).collect();
                for case in CASES {
                    if !rest.starts_with(&recase(&piece, case)) {
                        continue;
                    }
                    for (tok, rc) in refs(a, toks) {
                        let cost = 1300 + 100 * len as u32 + rc + case_cost(case);
                        out.push((Atom::Prefix { col, tok, len, case }, cost));
                    }
                }
            }
        }
    }
    let mut end = 0;
    for ch in rest.chars().take(MAX_CONST) {
        end += ch.len_utf8();
        let text = &rest[..end];
        // Letters and digits are far cheaper to take from the row than to type
        let cost = 500 + text.chars().map(|c| if c.is_alphanumeric() { 3000 } else { 150 }).sum::<u32>();
        out.push((Atom::Const(text.to_string()), cost));
    }
    out
}

/// Learns a program that maps every example's inputs to its output.
pub fn learn(examples: &[(Vec<String>, String)]) -> Option<Program> {
    let first = examples.first()?;
    let rows: Vec<Row> = examples.iter().map(|(inputs, _)| Row::new(inputs)).collect();
    let outputs: Vec<&str> = examples.iter().map(|(_, o)| o.as_str()).collect();
    if outputs.iter().any(|o| o.is_empty()) || first.0.is_empty() {
        return None;
    }
    // Cheapest-first search over the positions reached in every output
    let start = vec![0usize; examples.len()];
    let mut best: HashMap<Vec<usize>, u32> = HashMap::new();
    let mut programs: Vec<(Vec<Atom>, Vec<usize>)> = vec![(Vec::new(), start.clone())];
    let mut heap = BinaryHeap::new();
    heap.push(Reverse((0u32, 0usize)));
    best.insert(start, 0);
    let mut steps = 0;
    while let Some(Reverse((cost, id))) = heap.pop() {
        steps += 1;
        if steps > MAX_STEPS {
            return None;
        }
        let (atoms, positions) = programs[id].clone();
        if best.get(&positions).is_some_and(|&c| c < cost) {
            continue;
        }
        if positions.iter().zip(&outputs).all(|(&p, o)| p == o.len()) {
            return Some(Program(atoms));
        }
        let p0 = positions[0];
        if p0 >= outputs[0].len() {
            continue;
        }
        'atoms: for (atom, atom_cost) in candidates(&rows[0], &outputs[0][p0..]) {
            let mut next = positions.clone();
            for (e, row) in rows.iter().enumerate() {
                let rest = &outputs[e][positions[e]..];
                match row.eval(&atom) {
                    Some(t) if !t.is_empty() && rest.starts_with(&t) => next[e] += t.len(),
                    _ => continue 'atoms,
                }
            }
            let c = cost + atom_cost;
            if best.get(&next).is_some_and(|&old| old <= c) {
                continue;
            }
            best.insert(next.clone(), c);
            let mut program = atoms.clone();
            program.push(atom);
            programs.push((program, next));
            heap.push(Reverse((c, programs.len() - 1)));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ex(pairs: &[(&[&str], &str)]) -> Vec<(Vec<String>, String)> {
        pairs.iter().map(|(i, o)| (i.iter().map(|s| s.to_string()).collect(), o.to_string())).collect()
    }

    fn run(p: &Program, inputs: &[&str]) -> Option<String> {
        p.run(&inputs.iter().map(|s| s.to_string()).collect::<Vec<_>>())
    }

    #[test]
    fn first_and_last_names() {
        let p = learn(&ex(&[(&["John Smith"], "John")])).unwrap();
        assert_eq!(run(&p, &["Mary Lee"]).as_deref(), Some("Mary"));
        let p = learn(&ex(&[(&["John Smith"], "Smith")])).unwrap();
        assert_eq!(run(&p, &["Mary Ann Lee"]).as_deref(), Some("Lee"));
    }

    #[test]
    fn reorder_initials_and_case() {
        let p = learn(&ex(&[(&["john smith"], "Smith, J.")])).unwrap();
        assert_eq!(run(&p, &["mary lee"]).as_deref(), Some("Lee, M."));
        let p = learn(&ex(&[(&["John", "Smith"], "john.smith@example.com")])).unwrap();
        assert_eq!(run(&p, &["Ada", "Lovelace"]).as_deref(), Some("ada.lovelace@example.com"));
        let p = learn(&ex(&[(&["John Smith"], "JS")])).unwrap();
        assert_eq!(run(&p, &["Ada Lovelace"]).as_deref(), Some("AL"));
    }

    #[test]
    fn numbers_and_emails() {
        let p = learn(&ex(&[(&["Order #1234 (shipped)"], "1234")])).unwrap();
        assert_eq!(run(&p, &["Order #98 (pending)"]).as_deref(), Some("98"));
        let p = learn(&ex(&[(&["ada@example.com"], "example.com")])).unwrap();
        assert_eq!(run(&p, &["bob@mail.co.uk"]).as_deref(), Some("mail.co.uk"));
        let p = learn(&ex(&[(&["555-123-4567"], "(555) 123-4567")])).unwrap();
        assert_eq!(run(&p, &["020-555-0199"]).as_deref(), Some("(020) 555-0199"));
    }

    #[test]
    fn two_examples_disambiguate() {
        // One example could mean "second word" or "last word"
        let p = learn(&ex(&[(&["a b c"], "c"), (&["d e"], "e")])).unwrap();
        assert_eq!(run(&p, &["w x y z"]).as_deref(), Some("z"));
        assert!(learn(&ex(&[(&["abc"], "x"), (&["def"], "y")])).is_none());
    }
}
