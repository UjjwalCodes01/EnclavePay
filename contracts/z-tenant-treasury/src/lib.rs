wit_bindgen::generate!({
    world: "tenant-treasury",
    path: "wit",
    additional_derives: [serde::Deserialize, serde::Serialize],
    generate_all,
});

mod aml;
mod delegate;
mod ledger;
mod payout;
mod policy;

struct Component;

#[cfg(target_arch = "wasm32")]
impl exports::z::tenant_treasury::contracts::Guest for Component {
    fn pay_invoice(
        req: exports::z::tenant_treasury::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        let input = req.input.ok_or("pay-invoice: missing input")?;
        payout::pay_invoice(&input, req.context.as_deref())
    }

    fn read_ledger(
        req: exports::z::tenant_treasury::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        ledger::read_ledger(req.input.as_deref().unwrap_or(b"{}"))
    }

    fn delegate_mandate(
        req: exports::z::tenant_treasury::contracts::GenericInput,
    ) -> Result<Vec<u8>, String> {
        let input = req.input.ok_or("delegate-mandate: missing input")?;
        delegate::delegate_mandate(&input, req.context.as_deref())
    }
}

#[cfg(target_arch = "wasm32")]
export!(Component);

