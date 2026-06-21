import {
  T3nClient,
  createEthAuthInput,
  eth_get_address,
  loadWasmComponent,
  metamask_sign,
  setEnvironment,
  type Environment
} from "@terminal3/t3n-sdk";
import { env } from "./env.js";

function toSdkEnvironment(value: string): Environment {
  if (value === "testnet" || value === "production") return value;
  return "testnet";
}

async function identify(label: string, key: string): Promise<void> {
  if (!key || key.includes("replace_me")) {
    console.log(`MISS ${label.padEnd(10)} add ${label}_KEY to .env first`);
    return;
  }

  const address = eth_get_address(key);
  const wasmComponent = await loadWasmComponent();
  const client = new T3nClient({
    wasmComponent,
    handlers: { EthSign: metamask_sign(address, undefined, key) }
  });

  await client.handshake();
  const did = await client.authenticate(createEthAuthInput(address));
  console.log(`OK   ${label.padEnd(10)} address=${address} did=${did.toString()}`);
}

setEnvironment(toSdkEnvironment(env.environment));
console.log("Aegis T3 identity lookup");
console.log(`sdk environment: ${env.environment}`);
await identify("USER", env.userKey);
await identify("ORCHESTRATOR", env.orchestratorKey);
await identify("SUB_AGENT", env.subAgentKey);
console.log("");
console.log("Copy the returned did:t3n:... values into their respective _DID fields in .env.");
