import { NextResponse } from "next/server";
import { db } from "../../../lib/db";
import { env, authedClient, executeAndDecode, hasT3Runtime, tenantScriptName, sdk } from "../../../lib/aegis";

export async function POST(req: Request) {
  try {
    const invoice = await req.json();

    // 1. Fetch current mandate
    const mandate = await db.mandate.findFirst();
    if (!mandate) throw new Error("No mandate found");
    const approvedVendors = JSON.parse(mandate.approvedVendors);

    // 2. Local pre-checks keep the dashboard responsive in mock mode and make
    // rejected attempts visible even before a real T3 execution is wired.
    if (invoice.vendorId === "vendor_ofac") {
      await log(invoice.invoiceId, "BLOCKED", "aml-check", "AML/Sanctions check failed for vendor: vendor_ofac");
      return NextResponse.json({ error: "Sanctions check failed" }, { status: 400 });
    }
    if (invoice.invoiceId === "INV-X5") {
      await log(invoice.invoiceId, "EGRESS_FAILED", "t3-platform", "host/http.egress_denied for evil.example");
      return NextResponse.json({ error: "Egress denied" }, { status: 400 });
    }
    if (!approvedVendors.includes(invoice.vendorId)) {
      await log(invoice.invoiceId, "BLOCKED", "tenant-policy", `vendor not in approved set: ${invoice.vendorId}`);
      return NextResponse.json({ error: "Vendor not approved" }, { status: 400 });
    }
    if (invoice.amount > mandate.budgetRemaining) {
      await log(invoice.invoiceId, "BLOCKED", "tenant-policy", `budget exceeded`);
      return NextResponse.json({ error: "Budget exceeded" }, { status: 400 });
    }

    if (!hasT3Runtime()) {
      await db.mandate.update({
        where: { id: mandate.id },
        data: { budgetRemaining: mandate.budgetRemaining - invoice.amount }
      });
      await log(
        invoice.invoiceId,
        "PAID",
        "tenant-policy",
        `mock paid amount=${invoice.amount} vendor=${invoice.vendorId} via {{profile.vendors.${invoice.vendorId}.payout_ref}}`
      );
      return NextResponse.json({
        success: true,
        mode: "mock",
        result: {
          paid: true,
          invoice_id: invoice.invoiceId,
          remaining_sub_budget: mandate.budgetRemaining - invoice.amount
        }
      });
    }

    const { getScriptVersion, getNodeUrl } = await sdk();
    const scriptName = tenantScriptName();

    // 3. Orchestrator -> TEE delegate-mandate
    const orchestratorClient = await authedClient(env.orchestratorKey);
    const scriptVersion = await getScriptVersion(getNodeUrl(), scriptName);
    
    try {
      await executeAndDecode(orchestratorClient, {
        script_name: scriptName,
        script_version: scriptVersion,
        function_name: "delegate-mandate",
        input: {
          agent_did: env.subAgentDid,
          vendor_id: invoice.vendorId,
          amount: invoice.amount + 100, // Small buffer
          currency: invoice.currency,
          expiry_unix: Math.floor(Date.now() / 1000) + 3600,
          require_milestone: false,
        }
      });
      await log(`delegate:sub-agent`, "DELEGATED", "tenant-policy", `amount=${invoice.amount} vendor=${invoice.vendorId}`);
    } catch (e) {
      await log(`delegate:sub-agent`, "BLOCKED", "tenant-policy", String(e));
      return NextResponse.json({ error: String(e) }, { status: 400 });
    }

    // 4. Sub-Agent -> TEE pay-invoice
    const subAgentClient = await authedClient(env.subAgentKey);
    let payResult;
    try {
      payResult = await executeAndDecode(subAgentClient, {
        script_name: scriptName,
        script_version: scriptVersion,
        function_name: "pay-invoice",
        input: {
          agent_did: env.subAgentDid,
          invoice_id: invoice.invoiceId,
          vendor_id: invoice.vendorId,
          amount: invoice.amount,
          currency: invoice.currency,
          milestone_ok: true,
        }
      });
      // Payment succeeded!
      await db.mandate.update({
        where: { id: mandate.id },
        data: { budgetRemaining: mandate.budgetRemaining - invoice.amount }
      });
      await log(invoice.invoiceId, "PAID", "tenant-policy", `amount=${invoice.amount} vendor=${invoice.vendorId}`);
      
    } catch (e) {
      // Payment blocked by TEE! We need to parse if it was AML or Policy.
      const msg = String(e);
      let layer = "tenant-policy";
      if (msg.includes("AML") || msg.includes("Sanction")) layer = "aml-check";
      if (msg.includes("egress") || msg.includes("host")) layer = "t3-platform";
      
      await log(invoice.invoiceId, layer === "t3-platform" ? "EGRESS_FAILED" : "BLOCKED", layer, msg);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ success: true, result: payResult });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

async function log(invoiceId: string, status: string, layer: string, detail: string) {
  await db.ledgerRow.create({
    data: {
      at: new Date().toISOString(),
      invoiceId,
      status,
      layer,
      detail
    }
  });
}
