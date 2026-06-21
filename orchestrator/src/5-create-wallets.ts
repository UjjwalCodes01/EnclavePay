import { Wallet } from "ethers";

const user = Wallet.createRandom();
const orchestrator = Wallet.createRandom();
const subAgent = Wallet.createRandom();

console.log("Throwaway local/testnet wallets");
console.log("");
console.log("Add these to .env only if you do not already have T3-issued/testnet keys.");
console.log("");
console.log(`USER_KEY=${user.privateKey}`);
console.log("");
console.log(`ORCHESTRATOR_KEY=${orchestrator.privateKey}`);
console.log("");
console.log(`SUB_AGENT_KEY=${subAgent.privateKey}`);
console.log("");
console.log("Next: you must derive the corresponding DIDs for the Orchestrator and Sub-Agent and add them to .env.");

