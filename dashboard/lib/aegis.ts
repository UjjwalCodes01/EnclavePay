import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Environment, T3nClient } from "@terminal3/t3n-sdk";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });

const tenantDid = process.env.TENANT_DID ?? "";

export const env = {
  provider: process.env.T3_PROVIDER ?? "mock",
  environment: process.env.T3_ENVIRONMENT ?? "testnet",
  tenantDid,
  tenantKey: process.env.TENANT_KEY ?? "",
  userKey: process.env.USER_KEY ?? "",
  orchestratorKey: process.env.ORCHESTRATOR_KEY ?? "",
  orchestratorDid: process.env.ORCHESTRATOR_DID ?? "did:t3n:mock-orchestrator",
  subAgentKey: process.env.SUB_AGENT_KEY ?? "",
  subAgentDid: process.env.SUB_AGENT_DID ?? "did:t3n:mock-sub-agent",
  contractTail: process.env.AEGIS_CONTRACT_TAIL ?? "treasury-contracts",
  merchantHost: process.env.AEGIS_MERCHANT_HOST ?? "httpbin.org"
};

type Sdk = typeof import("@terminal3/t3n-sdk");

let sdkModule: Sdk | null = null;

export async function sdk(): Promise<Sdk> {
  if (!sdkModule) sdkModule = await import("@terminal3/t3n-sdk");
  return sdkModule;
}

export function tenantScriptName(): string {
  if (!env.tenantDid || !env.tenantDid.startsWith("did:t3n:")) {
    return `z:mock:${env.contractTail}`;
  }
  return `z:${env.tenantDid.slice("did:t3n:".length)}:${env.contractTail}`;
}

export function hasT3Runtime(): boolean {
  return Boolean(
    env.provider === "t3" &&
      env.tenantDid &&
      env.orchestratorKey &&
      env.subAgentKey &&
      env.orchestratorDid &&
      env.subAgentDid
  );
}

function toSdkEnvironment(value: string): Environment {
  if (value === "testnet" || value === "production") return value;
  return "testnet";
}

export async function authedClient(privateKey: string): Promise<T3nClient> {
  const {
    T3nClient,
    createEthAuthInput,
    eth_get_address,
    loadWasmComponent,
    metamask_sign,
    setEnvironment
  } = await sdk();

  setEnvironment(toSdkEnvironment(env.environment));
  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(privateKey);
  const client = new T3nClient({
    wasmComponent,
    handlers: { EthSign: metamask_sign(address, undefined, privateKey) }
  });

  await client.handshake();
  await client.authenticate(createEthAuthInput(address));
  return client;
}

export async function executeAndDecode<T>(client: T3nClient, params: unknown): Promise<T> {
  const raw = await client.execute(params);
  return JSON.parse(raw) as T;
}
