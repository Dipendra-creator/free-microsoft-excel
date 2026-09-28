//! Local file storage: .xlsx (full fidelity) and .csv/.tsv (values of the active sheet).

use std::{
    fs,
    io::{BufWriter, Cursor, Write},
    path::Path,
};

use ironcalc::{export::save_xlsx_to_writer, import::load_from_xlsx_bytes};
use ironcalc_base::Model;

use super::{FileFormat, Location, WorkbookStore};
use crate::{
    engine::{EngineConfig, Session},
    error::{AppError, AppResult},
};

#[derive(Default)]
pub struct FileStore;

impl WorkbookStore for FileStore {
    fn load(&self, location: &Location, config: &EngineConfig) -> AppResult<Model<'static>> {
        let bytes = fs::read(&location.path)?;
        let name = location.display_name();
        match location.format {
            FileFormat::Xlsx => {
                let mut workbook =
                    load_from_xlsx_bytes(&bytes, &name, config.locale, config.timezone)?;
                workbook.name = name;
                Ok(Model::from_workbook(workbook, config.language)?)
            }
            FileFormat::Csv | FileFormat::Tsv => {
                let delimiter = if location.format == FileFormat::Tsv {
                    b'\t'
                } else {
                    sniff_delimiter(&bytes)
                };
                load_delimited(&bytes, delimiter, &name, config)
            }
        }
    }

    fn save(&self, session: &Session, location: &Location) -> AppResult<()> {
        let data = match location.format {
            FileFormat::Xlsx => {
                let model = session.export_model()?;
                let cursor = save_xlsx_to_writer(&model, Cursor::new(Vec::new()))?;
                cursor.into_inner()
            }
            FileFormat::Csv | FileFormat::Tsv => {
                let sheet = session.info().active_sheet;
                let values = session.sheet_values(sheet)?;
                let delimiter = if location.format == FileFormat::Tsv { b'\t' } else { b',' };
                let mut writer = csv::WriterBuilder::new()
                    .delimiter(delimiter)
                    .flexible(true)
                    .from_writer(Vec::new());
                for row in values {
                    writer
                        .write_record(row)
                        .map_err(|e| AppError::Io(e.to_string()))?;
                }
                writer
                    .into_inner()
                    .map_err(|e| AppError::Io(e.to_string()))?
            }
        };
        write_atomic(&location.path, &data)
    }
}

/// Writes to a temporary file first so a failure never corrupts the original.
fn write_atomic(path: &Path, data: &[u8]) -> AppResult<()> {
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default()
    ));
    {
        let file = fs::File::create(&tmp)?;
        let mut writer = BufWriter::new(file);
        writer.write_all(data)?;
        writer.flush()?;
    }
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

fn sniff_delimiter(bytes: &[u8]) -> u8 {
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(4096)]);
    let line = head.lines().next().unwrap_or_default();
    let candidates = [b',', b';', b'\t', b'|'];
    candidates
        .iter()
        .copied()
        .max_by_key(|d| line.matches(*d as char).count())
        .filter(|d| line.contains(*d as char))
        .unwrap_or(b',')
}

fn load_delimited(bytes: &[u8], delimiter: u8, name: &str, config: &EngineConfig) -> AppResult<Model<'static>> {
    // Strip UTF-8 BOM
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    let mut model = config.new_model(name)?;
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .has_headers(false)
        .flexible(true)
        .from_reader(bytes);
    for (i, record) in reader.byte_records().enumerate() {
        let record = record.map_err(|e| AppError::Io(format!("Invalid CSV: {e}")))?;
        let row = i as i32 + 1;
        if row > 1_048_576 {
            break;
        }
        for (j, field) in record.iter().enumerate() {
            if field.is_empty() {
                continue;
            }
            let value = String::from_utf8_lossy(field).to_string();
            model.set_user_input(0, row, j as i32 + 1, value)?;
        }
    }
    model.evaluate();
    Ok(model)
}
