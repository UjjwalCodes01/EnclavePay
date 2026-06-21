import { config } from "dotenv";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProviderMode } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
config({ path: resolve(repoRoot, ".env") });

const tenantDid = process.env.TENANT_DID ?? "";

export const env = {
  provider: (process.env.T3_PROVIDER ?? "t3") as ProviderMode,
  environment: process.env.T3_ENVIRONMENT ?? "testnet",
  tenantDid,
  tenantKey: process.env.TENANT_KEY ?? "",
  userKey: process.env.USER_KEY ?? "",
  orchestratorKey: process.env.ORCHESTRATOR_KEY ?? "",
  orchestratorDid: process.env.ORCHESTRATOR_DID ?? "did:t3n:mock-orchestrator",
  subAgentKey: process.env.SUB_AGENT_KEY ?? "",
  subAgentDid: process.env.SUB_AGENT_DID ?? "did:t3n:mock-sub-agent",
  contractVersion: process.env.AEGIS_CONTRACT_VERSION ?? "0.1.0",
  wasmPath: process.env.AEGIS_WASM_PATH ?? "contracts/z-tenant-treasury/target/wasm32-wasip2/release/z_tenant_treasury.wasm",
  contractTail: process.env.AEGIS_CONTRACT_TAIL ?? "treasury-contracts",
  treasuryMap: process.env.AEGIS_TREASURY_MAP ?? "treasury",
  secretsMap: process.env.AEGIS_SECRETS_MAP ?? "secrets",
  merchantHost: process.env.AEGIS_MERCHANT_HOST ?? "httpbin.org"
};

export function resolveFromRepo(path: string): string {
  return isAbsolute(path) ? path : resolve(repoRoot, path);
}

export function tenantScriptName(): string {
  if (!env.tenantDid || env.tenantDid === "did:t3n:replace_me") {
    return `z:mock:${env.contractTail}`;
  }
  return `z:${env.tenantDid.slice("did:t3n:".length)}:${env.contractTail}`;
}

export function requireT3Env(): void {
  const missing = [
    ["TENANT_DID", env.tenantDid],
    ["TENANT_KEY", env.tenantKey],
    ["USER_KEY", env.userKey],
    ["ORCHESTRATOR_KEY", env.orchestratorKey],
    ["ORCHESTRATOR_DID", env.orchestratorDid],
    ["SUB_AGENT_KEY", env.subAgentKey],
    ["SUB_AGENT_DID", env.subAgentDid]
  ].filter(([, value]) => !value || value === "did:t3n:replace_me" || value === "0xreplace_me");

  if (missing.length > 0) {
    throw new Error(`Missing T3 env values: ${missing.map(([key]) => key).join(", ")}`);
  }
}
