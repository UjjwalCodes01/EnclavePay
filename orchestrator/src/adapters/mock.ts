import { env, tenantScriptName } from "../env.js";
import { initialMandate } from "../data/demo.js";
import type {
  AegisProvider,
  DelegateRequest,
  DelegateResult,
  GrantResult,
  InvoiceRequest,
  LedgerRow,
  Mandate,
  PaymentResult
} from "../types.js";

type SubState = {
  agent_did: string;
  vendor_id: string;
  budget_remaining: number;
  currency: string;
  expiry_unix: number;
  require_milestone: boolean;
};

let master: Mandate = { ...initialMandate };
const subs = new Map<string, SubState>();
const ledger: LedgerRow[] = [];

function append(row: Omit<LedgerRow, "seq" | "at">): void {
  ledger.push({ seq: ledger.length + 1, at: new Date().toISOString(), ...row });
}

function subKey(agentDid: string, vendorId: string): string {
  return `${agentDid}:${vendorId}`;
}

export class MockAegisProvider implements AegisProvider {
  async setupTenant(): Promise<{ mandate: Mandate; contractName: string }> {
    master = { ...initialMandate };
    subs.clear();
    ledger.length = 0;
    append({
      invoice_id: "SYSTEM",
      status: "SETUP",
      layer: "operator",
      detail: `seeded mandate, secrets map, and ${tenantScriptName()}`
    });
    return { mandate: master, contractName: tenantScriptName() };
  }

  async grantAgent(): Promise<GrantResult> {
    const grant = {
      orchestratorDid: env.orchestratorDid,
      subAgentDid: env.subAgentDid,
      scriptName: tenantScriptName()
    };
    append({
      invoice_id: "GRANT",
      status: "GRANTED",
      layer: "t3-platform",
      detail: `${grant.orchestratorDid} delegates; ${grant.subAgentDid} pays @ ${env.merchantHost}`
    });
    return grant;
  }

  async delegateMandate(input: DelegateRequest): Promise<DelegateResult> {
    const now = Math.floor(Date.now() / 1000);
    try {
      if (now > master.expiry_unix) throw new Error(`master mandate expired (now ${now} > expiry ${master.expiry_unix})`);
      if (!master.approved_vendors.includes(input.vendor_id)) throw new Error(`vendor not in master approved set: ${input.vendor_id}`);
      if (input.amount > master.budget_remaining) throw new Error(`master budget exceeded: requested ${input.amount}, remaining ${master.budget_remaining}`);
      if (input.expiry_unix > master.expiry_unix) throw new Error("sub mandate cannot outlive master mandate");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      append({ invoice_id: `delegate:${input.agent_did}`, status: "BLOCKED", layer: "tenant-policy", detail });
      throw error;
    }

    master.budget_remaining -= input.amount;
    subs.set(subKey(input.agent_did, input.vendor_id), {
      agent_did: input.agent_did,
      vendor_id: input.vendor_id,
      budget_remaining: input.amount,
      currency: input.currency,
      expiry_unix: input.expiry_unix,
      require_milestone: input.require_milestone
    });
    append({
      invoice_id: `delegate:${input.agent_did}`,
      status: "DELEGATED",
      layer: "tenant-policy",
      detail: `amount=${input.amount} vendor=${input.vendor_id}`
    });
    return { delegated: true, master_remaining_budget: master.budget_remaining, sub_budget: input.amount };
  }

  async payInvoice(input: InvoiceRequest): Promise<PaymentResult> {
    const now = Math.floor(Date.now() / 1000);
    const sub = subs.get(subKey(input.agent_did, input.vendor_id));

    try {
      if (input.vendor_id === "vendor_ofac") throw new Error("AML/Sanctions check failed for vendor: vendor_ofac");
      if (input.invoice_id === "INV-X4") throw new Error(`sub mandate expired (now ${now} > expiry ${now - 1})`);
      if (!sub) throw new Error(`no sub mandate found for agent ${input.agent_did} and vendor ${input.vendor_id}`);
      if (now > sub.expiry_unix) throw new Error(`sub mandate expired (now ${now} > expiry ${sub.expiry_unix})`);
      if (input.amount > sub.budget_remaining) throw new Error(`sub budget exceeded: requested ${input.amount}, remaining ${sub.budget_remaining}`);
      if (sub.require_milestone && !input.milestone_ok) throw new Error("milestone proof missing or invalid");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      append({
        invoice_id: input.invoice_id,
        status: "BLOCKED",
        layer: detail.includes("AML") ? "aml-check" : "tenant-policy",
        detail
      });
      throw error;
    }

    sub.budget_remaining -= input.amount;
    append({
      invoice_id: input.invoice_id,
      status: "PAID",
      layer: "tenant-policy",
      detail: `paid ${input.amount} ${input.currency} to {{profile.vendors.${input.vendor_id}.payout_ref}}`
    });
    return { paid: true, invoice_id: input.invoice_id, remaining_sub_budget: sub.budget_remaining };
  }

  async readLedger(): Promise<LedgerRow[]> {
    return [...ledger];
  }
}
