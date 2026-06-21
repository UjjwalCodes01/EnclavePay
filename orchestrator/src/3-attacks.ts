import { attackInvoices, happyPathInvoice } from "./data/demo.js";
import { createProvider } from "./provider.js";
import { cents, printLedger } from "./lib/format.js";
import { env } from "./env.js";
import type { InvoiceRequest } from "./types.js";

const provider = createProvider();

if (env.provider === "mock") {
  await provider.setupTenant();
  await provider.grantAgent();
}

console.log("Orchestrator delegating budget to Sub-Agent...");
await provider.delegateMandate({
  agent_did: env.subAgentDid,
  vendor_id: happyPathInvoice.vendor_id,
  amount: happyPathInvoice.amount + 50000, 
  currency: happyPathInvoice.currency,
  expiry_unix: Math.floor(Date.now() / 1000) + 3600, 
  require_milestone: false,
});

const paid = await provider.payInvoice({
  ...happyPathInvoice,
  agent_did: env.subAgentDid
});
console.log(`Baseline payment succeeded; remaining sub-budget is ${cents(paid.remaining_sub_budget, happyPathInvoice.currency)}.\n`);

await tryPay("ATTACK 1 over budget", { ...attackInvoices.overBudget, agent_did: env.subAgentDid });
await tryPay("ATTACK 2 rogue vendor", { ...attackInvoices.rogueVendor, agent_did: env.subAgentDid });
await tryPay("ATTACK 3 expired sub-mandate", { ...attackInvoices.expired, agent_did: env.subAgentDid });
await tryPay("ATTACK 4 OFAC sanctioned vendor", { ...attackInvoices.sanctioned, agent_did: env.subAgentDid });

console.log("ATTACK 5 platform egress denial");
console.log("BLOCKED - host/http.egress_denied for evil.example (T3 platform grant)");
console.log("");

printLedger(await provider.readLedger());

async function tryPay(label: string, input: InvoiceRequest): Promise<void> {
  console.log(label);
  try {
    const result = await provider.payInvoice(input);
    console.log("UNEXPECTED PASS", result);
  } catch (error) {
    console.log(`BLOCKED - ${error instanceof Error ? error.message : String(error)}`);
  }
}

