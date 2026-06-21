import { createProvider } from "./provider.js";
import { cents } from "./lib/format.js";
import { env } from "./env.js";

const provider = createProvider();
const { mandate, contractName } = await provider.setupTenant();

console.log("Aegis tenant setup complete");
console.log(`provider: ${env.provider}`);
console.log(`contract: ${contractName}`);
console.log(`approved vendors: ${mandate.approved_vendors.join(", ")}`);
console.log(`budget: ${cents(mandate.budget_remaining, mandate.currency)}`);
console.log(`expiry: ${new Date(mandate.expiry_unix * 1000).toISOString()}`);

