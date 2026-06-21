import type { DelegateRequest, InvoiceRequest, Mandate } from "../types.js";

export const initialMandate: Mandate = {
  approved_vendors: ["vendor_alpha", "vendor_beta"],
  budget_remaining: 500_000,
  currency: "usd",
  expiry_unix: Math.floor(Date.now() / 1000) + 72 * 60 * 60,
  require_milestone: false
};

export const happyPathInvoice: Omit<InvoiceRequest, "agent_did"> = {
  invoice_id: "INV-1001",
  vendor_id: "vendor_alpha",
  amount: 120_000,
  currency: "usd",
  milestone_ok: true
};

export function happyDelegation(agentDid: string): DelegateRequest {
  return {
    agent_did: agentDid,
    vendor_id: happyPathInvoice.vendor_id,
    amount: happyPathInvoice.amount + 50_000,
    currency: happyPathInvoice.currency,
    expiry_unix: Math.floor(Date.now() / 1000) + 60 * 60,
    require_milestone: false
  };
}

export const attackInvoices = {
  overBudget: {
    invoice_id: "INV-X1",
    vendor_id: "vendor_alpha",
    amount: 500_000,
    currency: "usd",
    milestone_ok: true
  },
  rogueVendor: {
    invoice_id: "INV-X2",
    vendor_id: "vendor_rogue",
    amount: 1_000,
    currency: "usd",
    milestone_ok: true
  },
  sanctioned: {
    invoice_id: "INV-X3",
    vendor_id: "vendor_ofac",
    amount: 5_000,
    currency: "usd",
    milestone_ok: true
  },
  expired: {
    invoice_id: "INV-X4",
    vendor_id: "vendor_alpha",
    amount: 5_000,
    currency: "usd",
    milestone_ok: true
  }
} satisfies Record<string, Omit<InvoiceRequest, "agent_did">>;
