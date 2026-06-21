import type { LedgerRow } from "../types.js";

export function cents(amount: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(amount / 100);
}

export function printLedger(rows: LedgerRow[]): void {
  for (const row of rows) {
    console.log(
      `${String(row.seq).padStart(2, "0")} ${row.status.padEnd(14)} ${row.layer.padEnd(14)} ${row.invoice_id.padEnd(9)} ${row.detail}`
    );
  }
}

