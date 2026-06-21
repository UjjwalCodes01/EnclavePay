export type ProviderMode = "mock" | "t3";

export type Mandate = {
  approved_vendors: string[];
  budget_remaining: number;
  currency: string;
  expiry_unix: number;
  require_milestone: boolean;
};

export type DelegateRequest = {
  agent_did: string;
  vendor_id: string;
  amount: number;
  currency: string;
  expiry_unix: number;
  require_milestone: boolean;
};

export type DelegateResult = {
  delegated: boolean;
  master_remaining_budget: number;
  sub_budget: number;
};

export type InvoiceRequest = {
  agent_did: string;
  invoice_id: string;
  vendor_id: string;
  amount: number;
  currency: string;
  milestone_ok?: boolean;
};

export type LedgerStatus =
  | "SETUP"
  | "GRANTED"
  | "DELEGATED"
  | "PAID"
  | "BLOCKED"
  | "EGRESS_FAILED"
  | "UPSTREAM_REJECT";

export type LedgerRow = {
  seq: number;
  invoice_id: string;
  status: LedgerStatus;
  detail: string;
  at: string;
  layer: "tenant-policy" | "t3-platform" | "operator" | "aml-check";
};

export type PaymentResult = {
  paid: boolean;
  invoice_id: string;
  remaining_sub_budget: number;
};

export type GrantResult = {
  orchestratorDid: string;
  subAgentDid: string;
  scriptName: string;
};

export interface AegisProvider {
  setupTenant(): Promise<{ mandate: Mandate; contractName: string }>;
  grantAgent(): Promise<GrantResult>;
  delegateMandate(input: DelegateRequest): Promise<DelegateResult>;
  payInvoice(input: InvoiceRequest): Promise<PaymentResult>;
  readLedger(): Promise<LedgerRow[]>;
}

