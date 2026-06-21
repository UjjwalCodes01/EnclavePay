use crate::host::{interfaces::kv_store, tenant::tenant_context};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct MasterMandate {
    pub approved_vendors: Vec<String>,
    pub budget_remaining: u64,
    pub currency: String,
    pub expiry_unix: u64,
    pub require_milestone: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SubMandate {
    pub agent_did: String,
    pub vendor_id: String,
    pub budget_remaining: u64,
    pub currency: String,
    pub expiry_unix: u64,
    pub require_milestone: bool,
}

fn treasury_map() -> String {
    let tid = tenant_context::tenant_did();
    format!("z:{}:treasury", hex::encode(&tid))
}

pub fn load_master() -> Result<MasterMandate, String> {
    let bytes = kv_store::get(&treasury_map(), b"mandate")
        .map_err(|e| format!("kv read: {e}"))?
        .ok_or("no master mandate seeded in z:<tid>:treasury")?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

pub fn save_master(mandate: &MasterMandate) -> Result<(), String> {
    let bytes = serde_json::to_vec(mandate).map_err(|e| e.to_string())?;
    kv_store::put(&treasury_map(), b"mandate", &bytes).map_err(|e| format!("kv write: {e}"))
}

pub fn load_sub(agent_did: &str, vendor_id: &str) -> Result<SubMandate, String> {
    let key = format!("sub:{}:{}", agent_did, vendor_id);
    let bytes = kv_store::get(&treasury_map(), key.as_bytes())
        .map_err(|e| format!("kv read: {e}"))?
        .ok_or(format!("no sub mandate found for agent {} and vendor {}", agent_did, vendor_id))?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

pub fn save_sub(mandate: &SubMandate) -> Result<(), String> {
    let key = format!("sub:{}:{}", mandate.agent_did, mandate.vendor_id);
    let bytes = serde_json::to_vec(mandate).map_err(|e| e.to_string())?;
    kv_store::put(&treasury_map(), key.as_bytes(), &bytes).map_err(|e| format!("kv write: {e}"))
}

pub fn check_master(
    mandate: &MasterMandate,
    vendor_id: &str,
    amount: u64,
    now: u64,
) -> Result<(), String> {
    if now > mandate.expiry_unix {
        return Err(format!(
            "master mandate expired (now {now} > expiry {})",
            mandate.expiry_unix
        ));
    }
    if !mandate.approved_vendors.iter().any(|vendor| vendor == vendor_id) {
        return Err(format!("vendor not in master approved set: {vendor_id}"));
    }
    if amount > mandate.budget_remaining {
        return Err(format!(
            "master budget exceeded: requested {amount}, remaining {}",
            mandate.budget_remaining
        ));
    }
    Ok(())
}

pub fn check_sub(
    mandate: &SubMandate,
    amount: u64,
    now: u64,
    milestone_ok: bool,
) -> Result<(), String> {
    if now > mandate.expiry_unix {
        return Err(format!(
            "sub mandate expired (now {now} > expiry {})",
            mandate.expiry_unix
        ));
    }
    if amount > mandate.budget_remaining {
        return Err(format!(
            "sub budget exceeded: requested {amount}, remaining {}",
            mandate.budget_remaining
        ));
    }
    if mandate.require_milestone && !milestone_ok {
        return Err("milestone proof missing or invalid".into());
    }
    Ok(())
}
