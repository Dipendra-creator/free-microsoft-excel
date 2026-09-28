//! Synchronisation hook for the future database layer.
//!
//! Every mutation of a workbook produces an IronCalc diff batch
//! (`UserModel::flush_send_queue`, bitcode encoded). Those batches are handed to
//! the configured [`SyncBackend`]. A database implementation can persist them
//! and fan them out to other clients, which apply them with
//! `Session::apply_remote_diffs` (IronCalc `apply_external_diffs`).

pub trait SyncBackend: Send + Sync {
    /// Called after each local change with the encoded diff batch.
    fn publish(&self, workbook_id: &str, diffs: &[u8]);
    /// Called when a workbook is closed.
    fn closed(&self, _workbook_id: &str) {}
}

/// Default backend: local-only, nothing is sent anywhere.
pub struct LocalOnly;

impl SyncBackend for LocalOnly {
    fn publish(&self, _workbook_id: &str, _diffs: &[u8]) {}
}
