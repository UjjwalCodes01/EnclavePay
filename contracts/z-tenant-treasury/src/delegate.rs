use crate::{ledger, policy};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
struct DelegateReq {
    agent_did: String,
    vendor_id: String,
    amount: u64,
    currency: String,
    expiry_unix: u64,
    require_milestone: bool,
}

pub fn delegate_mandate(input: &[u8], context: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let req: DelegateReq = serde_json::from_slice(input).map_err(|e| e.to_string())?;
    let now = trusted_now(context)?;
    
    let mut master = policy::load_master()?;

    // Verify master policy can support this delegation
    if let Err(error) = policy::check_master(&master, &req.vendor_id, req.amount, now) {
        let _ = ledger::append(&format!("delegate:{}", req.agent_did), "BLOCKED", &error, "tenant-policy");
        return Err(error);
    }

    // Decrement master budget
    master.budget_remaining -= req.amount;
    policy::save_master(&master)?;

    // Create sub-mandate
    let sub = policy::SubMandate {
        agent_did: req.agent_did.clone(),
        vendor_id: req.vendor_id.clone(),
        budget_remaining: req.amount,
        currency: req.currency.clone(),
        expiry_unix: req.expiry_unix,
        require_milestone: req.require_milestone,
    };
    policy::save_sub(&sub)?;

    ledger::append(
        &format!("delegate:{}", req.agent_did),
        "DELEGATED",
        &format!("amount={} vendor={}", req.amount, req.vendor_id),
        "tenant-policy",
    )?;

    serde_json::to_vec(&json!({
        "delegated": true,
        "master_remaining_budget": master.budget_remaining,
        "sub_budget": req.amount
    }))
    .map_err(|e| e.to_string())
}

fn trusted_now(context: Option<&[u8]>) -> Result<u64, String> {
    #[derive(Deserialize)]
    struct Ctx {
        now_unix: u64,
    }

    let raw = context.ok_or("missing node context (no trusted time)")?;
    let ctx: Ctx = serde_json::from_slice(raw).map_err(|e| format!("ctx parse: {e}"))?;
    Ok(ctx.now_unix)
}
