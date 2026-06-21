import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("reset") === "1") {
      await db.ledgerRow.deleteMany();
      await db.invoice.deleteMany();
      await db.mandate.deleteMany();
    }

    let mandate = await db.mandate.findFirst();
    
    if (!mandate) {
      mandate = await db.mandate.create({
        data: {
          approvedVendors: JSON.stringify(["vendor_alpha", "vendor_beta"]),
          budgetStart: 500000,
          budgetRemaining: 500000,
          currency: "usd",
          expiresAt: Math.floor(Date.now() / 1000) + 72 * 60 * 60
        }
      });

      await db.ledgerRow.create({
        data: {
          at: new Date().toISOString(),
          invoiceId: "SYSTEM",
          status: "SETUP",
          layer: "operator",
          detail: "mandate and database seeded"
        }
      });
      
      await db.ledgerRow.create({
        data: {
          at: new Date().toISOString(),
          invoiceId: "GRANT",
          status: "GRANTED",
          layer: "t3-platform",
          detail: "Orch: delegate-mandate | Sub: pay-invoice"
        }
      });
    }

    const ledger = await db.ledgerRow.findMany({ orderBy: { seq: 'desc' } });

    return NextResponse.json({
      mandate: {
        ...mandate,
        approvedVendors: JSON.parse(mandate.approvedVendors)
      },
      ledger
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
