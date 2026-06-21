# Aegis Integration Notes

## Provider Modes

- `T3_PROVIDER=mock` runs the dashboard and CLI without network or testnet credentials.
- `T3_PROVIDER=t3` uses `@terminal3/t3n-sdk` and expects all env values in `.env`.

## Current Compatibility Assumption

The contract WIT starts at the conservative public baseline:

- `host:interfaces/kv-store@2.1.0`
- `host:interfaces/http-with-placeholders@2.1.0`
- `host:interfaces/logging@2.1.0`

If the sandbox cluster confirms `@2.2.0`, upgrade the WIT deps and replace the context-based `trusted_now` helper with the native clock import.

## Real T3 Wiring Checklist

1. Confirm sandbox cluster host-interface versions.
2. Copy the canonical `wit/deps` from `github.com/Terminal-3/z-tenant-flight`.
3. Build the WASM component with `wasm32-wasip2`.
4. Register `z:<tenant-tail>:treasury-contracts`.
5. Seed `treasury/mandate`.
6. Run `agent-auth-update` with only `pay-invoice`, `read-ledger`, and `httpbin.org`.
7. Run the happy path and the blocked attack path.

## Demo Proof Points

- The agent receives scoped authority, not blanket tenant authority.
- Payout refs remain placeholders like `{{profile.vendors.vendor_alpha.payout_ref}}`.
- Tenant policy blocks over-budget, rogue-vendor, and expired-mandate attempts.
- T3 platform policy blocks unapproved host or placeholder access.
- Audit rows include paid and blocked actions.
