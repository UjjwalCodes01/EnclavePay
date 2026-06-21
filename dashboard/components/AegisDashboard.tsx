"use client";

import {
  BadgeCheck,
  Ban,
  Building2,
  CircleDollarSign,
  Clock3,
  KeyRound,
  Network,
  Play,
  RefreshCcw,
  ShieldCheck,
  Siren,
  SquareTerminal,
  Loader2
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState, useEffect } from "react";

type LedgerRow = { seq: number; at: string; invoiceId: string; status: string; layer: string; detail: string };
type Mandate = { id: string; approvedVendors: string[]; budgetRemaining: number; budgetStart: number; currency: string; expiresAt: number };

const happyInvoice = { invoiceId: "INV-1001", vendorId: "vendor_alpha", amount: 120000, currency: "usd" };
const attacks = {
  overBudget: { label: "Over Budget", invoice: { invoiceId: "INV-X1", vendorId: "vendor_alpha", amount: 500000, currency: "usd" } },
  rogueVendor: { label: "Rogue Vendor", invoice: { invoiceId: "INV-X2", vendorId: "vendor_rogue", amount: 1000, currency: "usd" } },
  expired: { label: "Expired Mandate", invoice: { invoiceId: "INV-X3", vendorId: "vendor_alpha", amount: 5000, currency: "usd" } },
  sanctioned: { label: "Sanctioned Vendor", invoice: { invoiceId: "INV-X4", vendorId: "vendor_ofac", amount: 5000, currency: "usd" } },
  egress: { label: "Unapproved Host", invoice: { invoiceId: "INV-X5", vendorId: "vendor_alpha", amount: 1000, currency: "usd" } }
};

export function AegisDashboard() {
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [lastEvent, setLastEvent] = useState("Agent is scoped, idle, and ready.");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    fetchState();
  }, []);

  async function fetchState() {
    try {
      const res = await fetch("/api/setup");
      const data = await res.json();
      setMandate(data.mandate);
      setLedger(data.ledger);
      setLoading(false);
    } catch (e) {
      console.error(e);
    }
  }

  async function resetState() {
    if (acting) return;
    setActing(true);
    setLastEvent("Resetting local demo state...");
    try {
      const res = await fetch("/api/setup?reset=1");
      const data = await res.json();
      setMandate(data.mandate);
      setLedger(data.ledger);
      setLastEvent("Demo state reset.");
    } catch (error) {
      setLastEvent(`Error: ${error}`);
    } finally {
      setActing(false);
    }
  }

  const spent = mandate ? mandate.budgetStart - mandate.budgetRemaining : 0;
  const budgetPct = mandate ? Math.min(100, Math.round((mandate.budgetRemaining / mandate.budgetStart) * 100)) : 100;
  const expires = useMemo(() => mandate ? new Date(mandate.expiresAt * 1000).toLocaleString() : "", [mandate]);

  function money(cents: number, currency = "usd"): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);
  }

  async function pay(invoice: any) {
    if (acting) return;
    setActing(true);
    setLastEvent(`Processing ${invoice.invoiceId}...`);
    try {
      await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoice)
      });
      await fetchState();
      setLastEvent(`${invoice.invoiceId} execution completed.`);
    } catch (error) {
      setLastEvent(`Error: ${error}`);
    } finally {
      setActing(false);
    }
  }

  async function runAttack(kind: keyof typeof attacks) {
    const attack = attacks[kind];
    await pay(attack.invoice);
  }

  if (loading || !mandate) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" /> Loading State...</div>;
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark" aria-hidden="true"><ShieldCheck size={24} /></div>
          <div>
            <h1>Aegis Treasury</h1>
            <p>Compliance-gated agentic payouts (Live T3 Integration)</p>
          </div>
        </div>
        <div className="statusStrip">
          <span><BadgeCheck size={16} /> T3 provider: Live</span>
          <span><KeyRound size={16} /> Agent Auth grant active</span>
        </div>
      </header>

      <section className="grid">
        <article className="panel mandate">
          <div className="panelHead">
            <div>
              <span className="eyebrow">Scoped mandate</span>
              <h2>CFO authorization</h2>
            </div>
            <Clock3 size={20} />
          </div>
          <div className="budgetRing" style={{ "--pct": `${budgetPct}%` } as CSSProperties}>
            <div>
              <strong>{money(mandate.budgetRemaining)}</strong>
              <span>remaining</span>
            </div>
          </div>
          <div className="meter">
            <span style={{ width: `${100 - budgetPct}%` }} />
          </div>
          <div className="facts">
            <div><span>Spent</span><strong>{money(spent)}</strong></div>
            <div><span>Expires</span><strong>{expires}</strong></div>
            <div><span>Vendors</span><strong>{mandate.approvedVendors.join(", ")}</strong></div>
          </div>
        </article>

        <article className="panel graph">
          <div className="panelHead">
            <div>
              <span className="eyebrow">Delegation graph</span>
              <h2>Human to agent to TEE</h2>
            </div>
            <Network size={20} />
          </div>
          <div className="nodes" style={{ gridTemplateColumns: "1fr 42px 1fr 42px 1fr 42px 1fr" }}>
            <Node icon={<Building2 size={22} />} title="CFO" detail="issues master mandate" />
            <Connector />
            <Node icon={<SquareTerminal size={22} />} title="Orchestrator" detail="delegates sub-mandate" />
            <Connector />
            <Node icon={<Network size={22} />} title="Sub-Agent" detail="executes payment" />
            <Connector />
            <Node icon={<ShieldCheck size={22} />} title="T3 enclave" detail="resolves placeholders and audits" />
          </div>
          <div className="eventLine">
            {acting ? <Loader2 className="animate-spin" size={18} /> : <Siren size={18} />}
            <span>{lastEvent}</span>
          </div>
        </article>

        <article className="panel controls">
          <div className="panelHead">
            <div>
              <span className="eyebrow">Demo controls</span>
              <h2>Prove the guardrails</h2>
            </div>
            <CircleDollarSign size={20} />
          </div>
          <button className="primary" onClick={() => pay(happyInvoice)} disabled={acting} title="Run approved payout">
            <Play size={18} /> Pay INV-1001
          </button>
          <div className="attackGrid">
            {(Object.keys(attacks) as Array<keyof typeof attacks>).map((key) => (
              <button key={key} className="danger" disabled={acting} onClick={() => runAttack(key)} title={`Run ${attacks[key].label} attack`}>
                <Ban size={17} /> {attacks[key].label}
              </button>
            ))}
          </div>
          <button className="ghost" onClick={resetState} disabled={acting} title="Reset demo state">
            <RefreshCcw size={17} /> Reset
          </button>
        </article>

        <article className="panel ledger">
          <div className="panelHead">
            <div>
              <span className="eyebrow">Audit ledger</span>
              <h2>Live TEE Event Stream</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className="table">
            <div className="tableHead">
              <span>Seq</span>
              <span>Status</span>
              <span>Layer</span>
              <span>Invoice</span>
              <span>Detail</span>
            </div>
            {ledger.map((row) => (
              <div className="tableRow" key={`${row.seq}-${row.invoiceId}`}>
                <span>{row.seq}</span>
                <span className={`pill ${row.status.toLowerCase()}`}>{row.status}</span>
                <span>{row.layer}</span>
                <span>{row.invoiceId}</span>
                <span>{row.detail}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function Node({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="node">
      <div>{icon}</div>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function Connector() {
  return <div className="connector" aria-hidden="true" />;
}
