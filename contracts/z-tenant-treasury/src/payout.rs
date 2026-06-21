use crate::host::interfaces::{http_with_placeholders as hwp, logging};
use crate::{aml, ledger, policy};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
struct PayReq {
    agent_did: String,
    invoice_id: String,
    vendor_id: String,
    amount: u64,
    currency: String,
    milestone_ok: Option<bool>,
}

pub fn pay_invoice(input: &[u8], context: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let req: PayReq = serde_json::from_slice(input).map_err(|e| e.to_string())?;
    let now = trusted_now(context)?;

    // 1. AML check
    if let Err(error) = aml::check_vendor(&req.vendor_id) {
        let _ = ledger::append(&req.invoice_id, "BLOCKED", &error, "aml-check");
        return Err(error);
    }

    // 2. Load SubMandate
    let mut mandate = policy::load_sub(&req.agent_did, &req.vendor_id)?;

    // 3. Check SubMandate
    if let Err(error) = policy::check_sub(
        &mandate,
        req.amount,
        now,
        req.milestone_ok.unwrap_or(false),
    ) {
        let _ = ledger::append(&req.invoice_id, "BLOCKED", &error, "tenant-policy");
        return Err(error);
    }

    let body = json!({
        "settlement_type": "sandbox_instruction",
        "invoice": {
            "id": req.invoice_id,
            "amount": req.amount,
            "currency": req.currency,
        },
        "vendor": {
            "id": req.vendor_id,
            "payout_ref": format!("{{{{profile.vendors.{}.payout_ref}}}}", req.vendor_id),
        },
        "metadata": {
            "rail": "terminal3-placeholder-egress",
            "purpose": "hackathon-sandbox-settlement"
        }
    });

    let resp = hwp::call(&hwp::Request {
        method: hwp::Verb::Post,
        url: "https://httpbin.org/post".to_string(),
        headers: Some(vec![
            ("Content-Type".into(), "application/json".into()),
        ]),
        payload: Some(serde_json::to_vec(&body).map_err(|e| e.to_string())?),
    })
    .map_err(|e| {
        let msg = fmt_http_err(e);
        let _ = ledger::append(&req.invoice_id, "EGRESS_FAILED", &msg, "t3-platform");
        msg
    })?;

    if resp.code / 100 != 2 {
        let body = String::from_utf8_lossy(&resp.payload).to_string();
        let _ = ledger::append(&req.invoice_id, "UPSTREAM_REJECT", &body, "t3-platform");
        return Err(format!("settlement sandbox HTTP {}: {body}", resp.code));
    }

    mandate.budget_remaining -= req.amount;
    policy::save_sub(&mandate)?;
    ledger::append(
        &req.invoice_id,
        "PAID",
        &format!("amount={} vendor={}", req.amount, req.vendor_id),
        "tenant-policy",
    )?;
    let _ = logging::info(&format!("paid {} for {}", req.amount, req.invoice_id));

    serde_json::to_vec(&json!({
        "paid": true,
        "invoice_id": req.invoice_id,
        "remaining_sub_budget": mandate.budget_remaining
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

fn fmt_http_err(error: hwp::HttpError) -> String {
    match error {
        hwp::HttpError::EgressDenied(host) => format!("egress denied for host {host}"),
        hwp::HttpError::PlaceholderDenied(marker) => {
            format!("placeholder not permitted: {marker}")
        }
        hwp::HttpError::PlaceholderUnknown(field) => format!("profile missing field: {field}"),
        hwp::HttpError::PlaceholderNoUserContext => "no user context for placeholder".into(),
        hwp::HttpError::UpstreamError(reason) => format!("upstream: {reason}"),
    }
}
