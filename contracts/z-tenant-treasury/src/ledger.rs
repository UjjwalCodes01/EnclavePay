use crate::host::{interfaces::kv_store, tenant::tenant_context};
use serde_json::json;

fn ledger_map() -> String {
    format!("z:{}:ledger", hex::encode(tenant_context::tenant_did()))
}

pub fn append(invoice_id: &str, status: &str, detail: &str, layer: &str) -> Result<(), String> {
    let map = ledger_map();
    let seq = kv_store::get(&map, b"_seq")
        .ok()
        .flatten()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0)
        + 1;
    let row = json!({
        "seq": seq,
        "invoice_id": invoice_id,
        "status": status,
        "detail": detail,
        "layer": layer
    });

    kv_store::put(&map, format!("row:{seq:08}").as_bytes(), row.to_string().as_bytes())
        .map_err(|e| format!("ledger write: {e}"))?;
    kv_store::put(&map, b"_seq", seq.to_string().as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_ledger(_input: &[u8]) -> Result<Vec<u8>, String> {
    let map = ledger_map();
    let seq = kv_store::get(&map, b"_seq")
        .map_err(|e| e.to_string())?
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let mut rows = Vec::new();
    for i in 1..=seq {
        if let Some(bytes) =
            kv_store::get(&map, format!("row:{i:08}").as_bytes()).map_err(|e| e.to_string())?
        {
            rows.push(serde_json::from_slice::<serde_json::Value>(&bytes).unwrap_or_default());
        }
    }
    serde_json::to_vec(&rows).map_err(|e| e.to_string())
}

