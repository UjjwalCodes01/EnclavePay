import { eth_get_address } from "@terminal3/t3n-sdk";
import { env, tenantScriptName } from "./env.js";

type Check = {
  name: string;
  ok: boolean;
  hint: string;
  detail?: string;
};

function hasValue(value: string, placeholder?: string): boolean {
  return Boolean(value && value !== placeholder && !value.includes("replace_me"));
}

function safeAddress(key: string): string | undefined {
  try {
    return eth_get_address(key);
  } catch {
    return undefined;
  }
}

const checks: Check[] = [
  {
    name: "TENANT_DID",
    ok: hasValue(env.tenantDid, "did:t3n:replace_me"),
    hint: "Copy from Terminal 3 tenant dashboard or tenant auth output.",
    detail: hasValue(env.tenantDid, "did:t3n:replace_me") ? `${env.tenantDid.slice(0, 14)}...` : undefined
  },
  {
    name: "TENANT_KEY",
    ok: hasValue(env.tenantKey, "0xreplace_me"),
    hint: "Throwaway tenant/admin EVM private key.",
    detail: safeAddress(env.tenantKey)
  },
  {
    name: "USER_KEY",
    ok: hasValue(env.userKey, "0xreplace_me"),
    hint: "Throwaway CFO/data-owner EVM private key. Generate with npm run env:wallets if needed.",
    detail: safeAddress(env.userKey)
  },
  {
    name: "ORCHESTRATOR_KEY",
    ok: hasValue(env.orchestratorKey, "0xreplace_me"),
    hint: "Throwaway orchestrator-agent EVM private key. Generate with npm run env:wallets if needed.",
    detail: safeAddress(env.orchestratorKey)
  },
  {
    name: "ORCHESTRATOR_DID",
    ok: hasValue(env.orchestratorDid, "did:t3n:replace_me") && env.orchestratorDid !== "did:t3n:mock-orchestrator",
    hint: "Authenticate ORCHESTRATOR_KEY on T3 testnet; use the returned did:t3n:... value.",
    detail: hasValue(env.orchestratorDid, "did:t3n:replace_me") ? `${env.orchestratorDid.slice(0, 14)}...` : undefined
  },
  {
    name: "SUB_AGENT_KEY",
    ok: hasValue(env.subAgentKey, "0xreplace_me"),
    hint: "Throwaway payout sub-agent EVM private key. Generate with npm run env:wallets if needed.",
    detail: safeAddress(env.subAgentKey)
  },
  {
    name: "SUB_AGENT_DID",
    ok: hasValue(env.subAgentDid, "did:t3n:replace_me") && env.subAgentDid !== "did:t3n:mock-sub-agent",
    hint: "Authenticate SUB_AGENT_KEY on T3 testnet; use the returned did:t3n:... value.",
    detail: hasValue(env.subAgentDid, "did:t3n:replace_me") ? `${env.subAgentDid.slice(0, 14)}...` : undefined
  }
];

console.log("Aegis environment doctor");
console.log(`provider: ${env.provider}`);
console.log(`sdk environment: ${env.environment}`);
console.log(`tenant script: ${tenantScriptName()}`);
console.log("");

for (const check of checks) {
  const mark = check.ok ? "OK " : "MISS";
  console.log(`${mark} ${check.name.padEnd(16)} ${check.detail ?? check.hint}`);
}

const missing = checks.filter((check) => !check.ok);
console.log("");
if (missing.length === 0) {
  console.log("Ready for T3 mode. Set T3_PROVIDER=t3 and run npm run cli:setup.");
} else {
  console.log(`Missing ${missing.length} value(s): ${missing.map((check) => check.name).join(", ")}`);
}
