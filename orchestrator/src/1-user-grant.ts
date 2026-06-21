import { createProvider } from "./provider.js";
import { env } from "./env.js";

const provider = createProvider();
const grant = await provider.grantAgent();

console.log("Aegis user mandate granted");
console.log(`provider: ${env.provider}`);
console.log(`orchestrator: ${grant.orchestratorDid} scoped to delegate-mandate`);
console.log(`sub-agent: ${grant.subAgentDid} scoped to pay-invoice`);
console.log(`script: ${grant.scriptName}`);

