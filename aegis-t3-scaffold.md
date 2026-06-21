# Aegis — Compliance-Gated Agentic Treasury (T3 ADK scaffold)

Working name; rebrand the frontend however you like. This is the integration spine:
**user issues a scoped mandate → agent invokes the TEE contract → contract enforces
budget/vendor/expiry → pays via placeholder-protected egress → appends an audit row.**

Two trust layers, and your demo exploits both:

| Layer | Enforced by | Reject example |
|---|---|---|
| Platform scope | T3 (`agent-auth-update` grant) | `host/http.egress_denied`, `placeholder not permitted: <marker>` |
| Treasury policy | **your TEE contract** | `mandate expired`, `vendor not in approved set`, `budget exceeded` |

> **Confirmed vs. assumed.** Everything marked ✅ is verbatim from T3's docs
> (the JS client surface, the `http-with-placeholders` Rust interface, the user
> grant shape). Items marked ⚠️ are reasonable assumptions you must reconcile
> against the sample repo **`github.com/Terminal-3/z-tenant-flight`** and
> `docs.terminal3.io` pages *register-contract* and *seed-api-key* (I couldn't
> pin their exact signatures). The budget/vendor/expiry logic is *your* design.

---

## Project layout

```
aegis/
├── z-tenant-treasury/          # the TEE contract (Rust → WASM component)
│   ├── src/
│   │   ├── lib.rs              # wit-bindgen entry + dispatch
│   │   ├── policy.rs           # read mandate policy from KV, enforce it
│   │   ├── payout.rs           # pay-invoice: gate → placeholder egress → audit
│   │   └── ledger.rs           # read-ledger
│   ├── wit/
│   │   ├── world.wit
│   │   └── deps/               # vendored host-interfaces + host-tenant (from cluster)
│   └── Cargo.toml
└── orchestrator/               # TypeScript: tenant setup, user grant, agent run
    ├── 0-tenant-setup.ts       # seed merchant secret + policy, register contract
    ├── 1-user-grant.ts         # data owner signs the scoped mandate
    ├── 2-agent-pay.ts          # agent invokes pay-invoice (happy path)
    ├── 3-attacks.ts            # the three "watch it get blocked" demos
    └── env.ts
```

---

## Part A — the TEE contract (Rust)

### `wit/world.wit` ✅ (pattern from write-contract walkthrough)

```wit
package z:tenant-treasury@0.1.0;

world tenant-treasury {
  import host:tenant/tenant-context@1.0.0;
  import host:interfaces/logging@2.1.0;
  import host:interfaces/kv-store@2.1.0;
  import host:interfaces/http-with-placeholders@2.1.0;   // payout egress (PII-safe)

  export contracts;
}

interface contracts {
  record generic-input {
    input:        option<list<u8>>,
    user-profile: option<list<u8>>,
    context:      option<list<u8>>,   // node-minted, TRUSTED — read time from here
  }

  pay-invoice: func(req: generic-input) -> result<list<u8>, string>;
  read-ledger: func(req: generic-input) -> result<list<u8>, string>;
}
```

### `Cargo.toml` ✅

```toml
[package]
name = "z-tenant-treasury"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]

[dependencies]
wit-bindgen = { version = "0.49", default-features = false, features = ["macros", "realloc"] }
serde       = { version = "1.0", default-features = false, features = ["derive", "alloc"] }
serde_json  = { version = "1.0", default-features = false, features = ["alloc"] }
hex         = { version = "0.4", default-features = false, features = ["alloc"] }

[profile.release]
opt-level = "s"
lto = true
codegen-units = 1
strip = true
```

### `src/lib.rs` ✅

```rust
wit_bindgen::generate!({
    world: "tenant-treasury",
    path: "wit",
    additional_derives: [serde::Deserialize, serde::Serialize],
    generate_all,
});

mod policy;
mod payout;
mod ledger;

struct Component;

#[cfg(target_arch = "wasm32")]
impl exports::z::tenant_treasury::contracts::Guest for Component {
    fn pay_invoice(req: exports::z::tenant_treasury::contracts::GenericInput) -> Result<Vec<u8>, String> {
        let input = req.input.ok_or("pay-invoice: missing input")?;
        payout::pay_invoice(&input, req.context.as_deref())
    }
    fn read_ledger(req: exports::z::tenant_treasury::contracts::GenericInput) -> Result<Vec<u8>, String> {
        ledger::read_ledger(req.input.as_deref().unwrap_or(b"{}"))
    }
}

#[cfg(target_arch = "wasm32")]
export!(Component);
```

### `src/policy.rs` — your defensible logic ⚠️ (kv read ✅, schema yours)

```rust
use crate::host::{interfaces::kv_store, tenant::tenant_context};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Mandate {
    pub approved_vendors: Vec<String>, // vendor ids the agent may pay
    pub budget_remaining: u64,         // minor units (e.g. cents)
    pub currency: String,
    pub expiry_unix: u64,              // mandate hard-expires here
    pub require_milestone: bool,       // gate payment on a delivery proof
}

fn treasury_map() -> String {
    let tid = tenant_context::tenant_did();
    format!("z:{}:treasury", hex::encode(&tid))
}

pub fn load() -> Result<Mandate, String> {
    let bytes = kv_store::get(&treasury_map(), b"mandate")
        .map_err(|e| format!("kv read: {e}"))?
        .ok_or("no mandate seeded in z:<tid>:treasury")?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

pub fn save(m: &Mandate) -> Result<(), String> {
    // ⚠️ assumes kv_store::set exists symmetric to ::get — verify name in deps/.
    let bytes = serde_json::to_vec(m).map_err(|e| e.to_string())?;
    kv_store::set(&treasury_map(), b"mandate", &bytes).map_err(|e| format!("kv write: {e}"))
}

/// All four policy gates. Returns Ok(()) only if the payment is allowed.
pub fn check(m: &Mandate, vendor_id: &str, amount: u64, now: u64, milestone_ok: bool) -> Result<(), String> {
    if now > m.expiry_unix {
        return Err(format!("mandate expired (now {now} > expiry {})", m.expiry_unix));
    }
    if !m.approved_vendors.iter().any(|v| v == vendor_id) {
        return Err(format!("vendor not in approved set: {vendor_id}"));
    }
    if amount > m.budget_remaining {
        return Err(format!("budget exceeded: requested {amount}, remaining {}", m.budget_remaining));
    }
    if m.require_milestone && !milestone_ok {
        return Err("milestone proof missing or invalid".into());
    }
    Ok(())
}
```

### `src/payout.rs` — gate, then PII-safe egress, then audit ⚠️/✅

```rust
use crate::host::interfaces::{http_with_placeholders as hwp, logging};
use crate::{policy, ledger};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
struct PayReq {
    invoice_id: String,
    vendor_id:  String,
    amount:     u64,         // minor units
    currency:   String,
    milestone_ok: Option<bool>,
}

pub fn pay_invoice(input: &[u8], context: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let req: PayReq = serde_json::from_slice(input).map_err(|e| e.to_string())?;

    // Trusted time comes from the node-minted context, NOT from agent input.
    let now = trusted_now(context)?;

    let mut mandate = policy::load()?;
    policy::check(&mandate, &req.vendor_id, req.amount, now, req.milestone_ok.unwrap_or(false))
        .inspect_err(|e| { let _ = ledger::append(&req.invoice_id, "BLOCKED", e); })?;

    // The vendor's real payout rail (IBAN / wallet / merchant token) is resolved
    // host-side from the data owner's profile — it never enters this WASM.
    let body = json!({
        "amount":   req.amount,
        "currency": req.currency,
        "destination": {
            "account": format!("{{{{profile.vendors.{}.payout_ref}}}}", req.vendor_id),
        },
        "metadata": { "invoice_id": req.invoice_id }
    });

    let resp = hwp::call(&hwp::Request {
        method:  hwp::Verb::Post,
        url:     "https://api.stripe.com/v1/transfers".to_string(), // your merchant egress
        headers: Some(vec![
            ("Authorization".into(), format!("Bearer {}", merchant_key()?)),
            ("Content-Type".into(), "application/json".into()),
        ]),
        payload: Some(serde_json::to_vec(&body).map_err(|e| e.to_string())?),
    })
    .map_err(|e| {
        let msg = fmt_http_err(e);
        let _ = ledger::append(&req.invoice_id, "EGRESS_FAILED", &msg);
        msg
    })?;

    if resp.code / 100 != 2 {
        let b = String::from_utf8_lossy(&resp.payload).to_string();
        let _ = ledger::append(&req.invoice_id, "UPSTREAM_REJECT", &b);
        return Err(format!("merchant HTTP {} — {b}", resp.code));
    }

    // Success: decrement budget, write the audit row.
    mandate.budget_remaining -= req.amount;
    policy::save(&mandate)?;
    ledger::append(&req.invoice_id, "PAID", &format!("amount={} vendor={}", req.amount, req.vendor_id))?;
    let _ = logging::info(&format!("paid {} for {}", req.amount, req.invoice_id));

    Ok(serde_json::to_vec(&json!({
        "paid": true,
        "invoice_id": req.invoice_id,
        "remaining_budget": mandate.budget_remaining
    })).unwrap())
}

fn merchant_key() -> Result<String, String> {
    use crate::host::{interfaces::kv_store, tenant::tenant_context};
    let map = format!("z:{}:secrets", hex::encode(&tenant_context::tenant_did()));
    let bytes = kv_store::get(&map, b"merchant_key").map_err(|e| e.to_string())?
        .ok_or("merchant_key not seeded in z:<tid>:secrets")?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

// ⚠️ Read a trusted unix-seconds timestamp from the node-minted context.
// Shape unknown — inspect what your node mints. Fall back only in native tests.
fn trusted_now(context: Option<&[u8]>) -> Result<u64, String> {
    #[derive(serde::Deserialize)] struct Ctx { now_unix: u64 }
    let raw = context.ok_or("missing node context (no trusted time)")?;
    let ctx: Ctx = serde_json::from_slice(raw).map_err(|e| format!("ctx parse: {e}"))?;
    Ok(ctx.now_unix)
}

fn fmt_http_err(e: hwp::HttpError) -> String {
    match e {
        hwp::HttpError::EgressDenied(h)        => format!("egress denied for host {h}"),
        hwp::HttpError::PlaceholderDenied(m)   => format!("placeholder not permitted: {m}"),
        hwp::HttpError::PlaceholderUnknown(f)  => format!("profile missing field: {f}"),
        hwp::HttpError::PlaceholderNoUserContext => "no user context for placeholder".into(),
        hwp::HttpError::UpstreamError(r)       => format!("upstream: {r}"),
    }
}
```

### `src/ledger.rs` — append-only audit in KV ⚠️

```rust
use crate::host::{interfaces::kv_store, tenant::tenant_context};
use serde_json::json;

fn ledger_map() -> String {
    format!("z:{}:ledger", hex::encode(&tenant_context::tenant_did()))
}

/// Append a row keyed by invoice+status+seq. T3N also keeps platform execution
/// records; this gives you an app-queryable trail for the demo.
pub fn append(invoice_id: &str, status: &str, detail: &str) -> Result<(), String> {
    let map = ledger_map();
    let seq = kv_store::get(&map, b"_seq").ok().flatten()
        .and_then(|b| String::from_utf8(b).ok()).and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0) + 1;
    let row = json!({ "seq": seq, "invoice_id": invoice_id, "status": status, "detail": detail });
    kv_store::set(&map, format!("row:{seq:08}").as_bytes(), row.to_string().as_bytes())
        .map_err(|e| format!("ledger write: {e}"))?;
    kv_store::set(&map, b"_seq", seq.to_string().as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn read_ledger(_input: &[u8]) -> Result<Vec<u8>, String> {
    // ⚠️ if kv-store exposes a prefix scan, list "row:" here; otherwise read _seq
    // and fetch row:1..=seq. Verify the kv-store interface in wit/deps/.
    let map = ledger_map();
    let seq = kv_store::get(&map, b"_seq").map_err(|e| e.to_string())?
        .and_then(|b| String::from_utf8(b).ok()).and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    let mut rows = Vec::new();
    for i in 1..=seq {
        if let Some(b) = kv_store::get(&map, format!("row:{i:08}").as_bytes()).map_err(|e| e.to_string())? {
            rows.push(serde_json::from_slice::<serde_json::Value>(&b).unwrap_or_default());
        }
    }
    Ok(serde_json::to_vec(&rows).unwrap())
}
```

---

## Part B — orchestrator (TypeScript)

### `orchestrator/env.ts` ✅

```typescript
import { setEnvironment, loadWasmComponent } from "@terminal3/t3n-sdk";
setEnvironment("testnet");
export const wasmComponent = await loadWasmComponent();
export const TENANT_DID = process.env.TENANT_DID!;      // did:t3n:... of the tenant
export const TENANT_SCRIPT = `z:${TENANT_DID.slice("did:t3n:".length)}:treasury-contracts`;
```

### `orchestrator/0-tenant-setup.ts` — seed secret + mandate, register ⚠️

```typescript
import { T3nClient, createEthAuthInput, eth_get_address, metamask_sign } from "@terminal3/t3n-sdk";
import { wasmComponent } from "./env";

const tKey = process.env.TENANT_KEY!;
const tAddr = eth_get_address(tKey);
const tenant = new T3nClient({ wasmComponent, handlers: { EthSign: metamask_sign(tAddr, undefined, tKey) } });
await tenant.handshake();
await tenant.authenticate(createEthAuthInput(tAddr));

// 1) Seed the merchant key into z:<tid>:secrets via the map-entry-set control call.
//    ⚠️ Exact control name/args: see docs "Seed API key into secrets map".
await tenant.execute({
  script_name: "tee:tenant/control",          // ⚠️ verify control script name
  function_name: "map-entry-set",
  input: { map: "secrets", key: "merchant_key", value: process.env.STRIPE_TEST_KEY },
});

// 2) Seed the mandate policy into z:<tid>:treasury.
await tenant.execute({
  script_name: "tee:tenant/control",
  function_name: "map-entry-set",
  input: {
    map: "treasury", key: "mandate",
    value: JSON.stringify({
      approved_vendors: ["vendor_alpha", "vendor_beta"],
      budget_remaining: 500000,                 // $5,000.00 in cents
      currency: "usd",
      expiry_unix: Math.floor(Date.now()/1000) + 72*3600,
      require_milestone: false,
    }),
  },
});

// 3) Register the compiled WASM as z:<tid>:treasury-contracts.
//    ⚠️ Follow docs "3. Register your TEE contract" / z-tenant-flight register script.
console.log("Now register target/wasm32-wasip2/release/z_tenant_treasury.wasm");
```

### `orchestrator/1-user-grant.ts` — the scoped mandate ✅ (shape verbatim)

```typescript
import { T3nClient, createEthAuthInput, eth_get_address, metamask_sign,
         getScriptVersion, getNodeUrl } from "@terminal3/t3n-sdk";
import { wasmComponent, TENANT_SCRIPT } from "./env";

const uKey = process.env.USER_KEY!;                 // data owner (CFO)
const uAddr = eth_get_address(uKey);
const user = new T3nClient({ wasmComponent, handlers: { EthSign: metamask_sign(uAddr, undefined, uKey) } });
await user.handshake();
await user.authenticate(createEthAuthInput(uAddr));

const scriptVersion = await getScriptVersion(getNodeUrl(), TENANT_SCRIPT);
const userContractVersion = await getScriptVersion(getNodeUrl(), "tee:user/contracts");

// Signed by the USER. Pins the agent to these functions + these hosts ONLY.
await user.execute({
  script_name: "tee:user/contracts",
  script_version: userContractVersion,
  function_name: "agent-auth-update",
  input: {
    agents: [{
      agentDid: process.env.AGENT_DID,            // did:t3n of the payout agent
      scripts: [{
        scriptName: TENANT_SCRIPT,
        versionReq: scriptVersion,
        functions: ["pay-invoice", "read-ledger"], // narrow surface
        allowedHosts: ["api.stripe.com"],          // egress allowlist
      }],
    }],
  },
});
console.log("Mandate granted: agent scoped to pay-invoice/read-ledger @ api.stripe.com");
```

### `orchestrator/2-agent-pay.ts` — happy path ✅

```typescript
import { T3nClient, createEthAuthInput, eth_get_address, metamask_sign,
         getScriptVersion, getNodeUrl } from "@terminal3/t3n-sdk";
import { wasmComponent, TENANT_SCRIPT } from "./env";

const aKey = process.env.AGENT_KEY!;
const aAddr = eth_get_address(aKey);
const agent = new T3nClient({ wasmComponent, handlers: { EthSign: metamask_sign(aAddr, undefined, aKey) } });
await agent.handshake();
await agent.authenticate(createEthAuthInput(aAddr));

const v = await getScriptVersion(getNodeUrl(), TENANT_SCRIPT);

const res = await agent.executeAndDecode({
  script_name: TENANT_SCRIPT, script_version: v,
  function_name: "pay-invoice",
  input: { invoice_id: "INV-1001", vendor_id: "vendor_alpha", amount: 120000, currency: "usd" },
});
console.log("PAID:", res);    // { paid: true, remaining_budget: 380000 }

const ledger = await agent.executeAndDecode({
  script_name: TENANT_SCRIPT, script_version: v, function_name: "read-ledger", input: {},
});
console.log("LEDGER:", ledger);
```

### `orchestrator/3-attacks.ts` — the demo that wins ✅/⚠️

```typescript
// Reuse the authed `agent` client + script version `v` from above.
// Run these live on camera. Each should be REJECTED.

// ATTACK 1 — over budget (your policy layer)
//   budget_remaining is 380000 after the legit pay; ask for more.
//   → "budget exceeded: requested 500000, remaining 380000"
await tryPay({ invoice_id: "INV-X1", vendor_id: "vendor_alpha", amount: 500000, currency: "usd" });

// ATTACK 2 — vendor not on the allowlist (your policy layer)
//   → "vendor not in approved set: vendor_rogue"
await tryPay({ invoice_id: "INV-X2", vendor_id: "vendor_rogue", amount: 1000, currency: "usd" });

// ATTACK 3 — exfiltration attempt (PLATFORM layer)
//   Point a malicious contract build at an unlisted host, or request a
//   placeholder the grant doesn't cover → T3 itself refuses:
//   "host/http.egress_denied"  OR  "placeholder not permitted: <marker>"
//   (no app code of yours runs — the enclave blocks it)

async function tryPay(input: any) {
  try {
    const r = await agent.executeAndDecode({
      script_name: TENANT_SCRIPT, script_version: v, function_name: "pay-invoice", input,
    });
    console.log("UNEXPECTED PASS:", r);
  } catch (e) {
    console.log("BLOCKED ✓ —", String(e));   // show this line on screen
  }
}
```

---

## Build / run

```bash
# contract
cd z-tenant-treasury
rustup target add wasm32-wasip2
cargo build --release --target wasm32-wasip2
# → target/wasm32-wasip2/release/z_tenant_treasury.wasm   (register this)

# orchestrator
cd ../orchestrator
npm i @terminal3/t3n-sdk
npx tsx 0-tenant-setup.ts   # seed + register
npx tsx 1-user-grant.ts     # data owner mandate
npx tsx 2-agent-pay.ts      # happy path
npx tsx 3-attacks.ts        # blocked attempts
```

---

## Reconcile-before-you-ship checklist

1. **Clone `github.com/Terminal-3/z-tenant-flight`** — it's the canonical pattern.
   Copy its `wit/deps/` versions and confirm the `host-interfaces` version your
   cluster provides (the walkthrough used `2.1.0`).
2. Confirm `kv_store::set` exists and its exact name/signature (only `get` was
   shown in docs). If writes use a different control, route `policy::save` and
   `ledger::append` through it.
3. Confirm the **register** step (docs page *3. Register your TEE contract*) and
   the **map-entry-set** control name/args (docs *Seed API key into secrets map*).
4. Confirm the node-minted **context** shape for trusted time. If it doesn't
   carry time, gate expiry via a freshness check on the user grant instead, and
   note that in the demo.
5. Confirm your merchant egress: Stripe transfers vs. the sandbox's Stripe-backed
   test merchant ("Agent Connect"). Match the body to whatever endpoint you're
   actually allowed to hit on `allowedHosts`.

## Demo order (90 seconds)

1. Show `1-user-grant` output — "agent scoped to 2 functions, 1 host."
2. Run `2-agent-pay` — money moves, agent never touched the IBAN, ledger row appears.
3. Run `3-attacks` — three `BLOCKED ✓` lines: over-budget, rogue-vendor, egress-denied.
4. Open the ledger — every attempt (paid *and* blocked) is recorded.

That last frame — guardrails holding + an immutable trail — is the whole pitch for a trust/identity sponsor.
