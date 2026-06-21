import { happyPathInvoice } from "./data/demo.js";
import { createProvider } from "./provider.js";
import { cents, printLedger } from "./lib/format.js";
import { env } from "./env.js";

const provider = createProvider();

if (env.provider === "mock") {
  await provider.setupTenant();
  await provider.grantAgent();
}

console.log("Orchestrator delegating budget to Sub-Agent...");
const delegateResult = await provider.delegateMandate({
  agent_did: env.subAgentDid,
  vendor_id: happyPathInvoice.vendor_id,
  amount: happyPathInvoice.amount + 50000, // allocate slightly more than the invoice
  currency: happyPathInvoice.currency,
  expiry_unix: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  require_milestone: false,
});

console.log(`Delegated: ${delegateResult.delegated}, Sub-Budget: ${cents(delegateResult.sub_budget, happyPathInvoice.currency)}`);

console.log("\nSub-Agent executing payment...");
const result = await provider.payInvoice({
  ...happyPathInvoice,
  agent_did: env.subAgentDid,
});
const ledger = await provider.readLedger();

console.log("Aegis payment executed");
console.log(`provider: ${env.provider}`);
console.log(`invoice: ${result.invoice_id}`);
console.log(`paid: ${result.paid}`);
console.log(`remaining sub-budget: ${cents(result.remaining_sub_budget, happyPathInvoice.currency)}`);
console.log("");
printLedger(ledger);

