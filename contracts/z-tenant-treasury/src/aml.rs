use crate::host::interfaces::http_with_placeholders as hwp;
use serde_json::Value;

pub fn check_vendor(vendor_id: &str) -> Result<(), String> {
    let url = format!("https://api.opensanctions.org/search/default?q={}", vendor_id);
    
    let resp = hwp::call(&hwp::Request {
        method: hwp::Verb::Get,
        url,
        headers: None,
        payload: None,
    })
    .map_err(|e| {
        let msg = fmt_http_err(e);
        format!("AML API egress failed: {}", msg)
    })?;

    if resp.code / 100 != 2 {
        return Err(format!("AML API returned HTTP {}", resp.code));
    }

    let body: Value = serde_json::from_slice(&resp.payload).map_err(|e| e.to_string())?;
    
    // OpenSanctions API returns a "results" array. If it has matches, we block the vendor.
    if let Some(results) = body.get("results").and_then(|r| r.as_array()) {
        if !results.is_empty() {
            return Err(format!("AML/Sanctions check failed for vendor: {}. Found {} matching records.", vendor_id, results.len()));
        }
    }

    Ok(())
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
