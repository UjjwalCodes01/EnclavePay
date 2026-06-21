import { env, requireT3Env, resolveFromRepo, tenantScriptName } from "../env.js";
import { initialMandate } from "../data/demo.js";
import type { AegisProvider, DelegateRequest, DelegateResult, GrantResult, InvoiceRequest, LedgerRow, Mandate, PaymentResult } from "../types.js";
import { readFile } from "node:fs/promises";
import type { Environment, TenantClient } from "@terminal3/t3n-sdk";

type T3ClientModule = typeof import("@terminal3/t3n-sdk");
type T3Client = Awaited<ReturnType<typeof authedClient>>;

async function sdk(): Promise<T3ClientModule> {
  return import("@terminal3/t3n-sdk");
}

async function authedClient(key: string) {
  const {
    T3nClient,
    createEthAuthInput,
    eth_get_address,
    metamask_sign,
    setEnvironment,
    loadWasmComponent
  } = await sdk();

  setEnvironment(toSdkEnvironment(env.environment));
  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(key);
  const client = new T3nClient({
    wasmComponent,
    handlers: { EthSign: metamask_sign(address, undefined, key) }
  });

  await client.handshake();
  await client.authenticate(createEthAuthInput(address));
  return client;
}

function toSdkEnvironment(value: string): Environment {
  if (value === "testnet" || value === "production") {
    return value;
  }
  return "testnet";
}

async function executeAndDecode<T>(client: T3Client, payload: unknown): Promise<T> {
  const raw = await client.execute(payload);
  return JSON.parse(raw) as T;
}

async function tenantClient(t3n: T3Client): Promise<TenantClient> {
  const { TenantClient, getNodeUrl } = await sdk();
  return new TenantClient({
    environment: toSdkEnvironment(env.environment),
    t3n,
    baseUrl: getNodeUrl(),
    tenantDid: env.tenantDid
  });
}

function contractIdOf(result: unknown): number {
  if (typeof result !== "object" || result === null) {
    throw new Error(`contract register returned non-object result: ${String(result)}`);
  }
  const record = result as Record<string, unknown>;
  const id = record.contract_id ?? record.contractId ?? record.id;
  if (typeof id === "number") return id;
  if (typeof id === "string" && Number.isFinite(Number(id))) return Number(id);
  throw new Error(`contract register result did not include contract_id: ${JSON.stringify(result)}`);
}

async function ignoreAlreadyExists(label: string, op: () => Promise<unknown>): Promise<void> {
  try {
    await op();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already.?exists|MapAlreadyExists/i.test(message)) {
      console.log(`${label} already exists; continuing`);
      return;
    }
    throw error;
  }
}

async function ensurePrivateMap(
  tenant: TenantClient,
  tail: string,
  contractId: number
): Promise<void> {
  try {
    await tenant.maps.create({
      tail,
      visibility: "private",
      writers: { only: [contractId] },
      readers: { only: [contractId] }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already.?exists|MapAlreadyExists/i.test(message)) throw error;
    console.log(`${tail} already exists; updating ACL to contract id ${contractId}`);
    await tenant.maps.update(tail, {
      writers: { only: [contractId] },
      readers: { only: [contractId] }
    });
  }
}

function requireValues(values: Array<[string, string]>): void {
  const missing = values.filter(([, value]) => !value || value.includes("replace_me") || value.startsWith("did:t3n:mock"));
  if (missing.length > 0) {
    throw new Error(`Missing T3 env values: ${missing.map(([key]) => key).join(", ")}`);
  }
}

export class T3AegisProvider implements AegisProvider {
  async setupTenant(): Promise<{ mandate: Mandate; contractName: string }> {
    if (!env.tenantDid || !env.tenantKey) {
      throw new Error("Missing TENANT_DID or TENANT_KEY");
    }
    const tenantAuth = await authedClient(env.tenantKey);
    const tenant = await tenantClient(tenantAuth);
    const contractName = tenantScriptName();

    const tenantDid = tenantAuth.getDid()?.toString();
    if (tenantDid && tenantDid !== env.tenantDid) {
      throw new Error(`TENANT_KEY authenticated as ${tenantDid}, but TENANT_DID is ${env.tenantDid}`);
    }

    const wasm = await readFile(resolveFromRepo(env.wasmPath));
    const registerResult = await tenant.contracts.register({
      tail: env.contractTail,
      version: env.contractVersion,
      wasm
    });
    const contractId = contractIdOf(registerResult);
    console.log(`registered ${contractName} as contract id ${contractId}`);

    await ensurePrivateMap(tenant, env.secretsMap, contractId);
    await ensurePrivateMap(tenant, env.treasuryMap, contractId);

    await tenant.executeControl("map-entry-set", {
      map_name: tenant.canonicalName(env.treasuryMap),
      key: "mandate",
      value: JSON.stringify(initialMandate)
    });

    return { mandate: initialMandate, contractName };
  }

  async grantAgent(): Promise<GrantResult> {
    requireValues([
      ["USER_KEY", env.userKey],
      ["ORCHESTRATOR_DID", env.orchestratorDid],
      ["SUB_AGENT_DID", env.subAgentDid]
    ]);
    const user = await authedClient(env.userKey);
    const { getScriptVersion, getNodeUrl } = await sdk();
    const scriptName = tenantScriptName();
    const scriptVersion = await getScriptVersion(getNodeUrl(), scriptName);
    const userContractVersion = await getScriptVersion(getNodeUrl(), "tee:user/contracts");

    const grant = {
      orchestratorDid: env.orchestratorDid,
      subAgentDid: env.subAgentDid,
      scriptName,
    };

    await user.execute({
      script_name: "tee:user/contracts",
      script_version: userContractVersion,
      function_name: "agent-auth-update",
      input: {
        agents: [
          {
            agentDid: grant.orchestratorDid,
            scripts: [
              {
                scriptName,
                versionReq: scriptVersion,
                functions: ["delegate-mandate", "read-ledger"],
                allowedHosts: []
              }
            ]
          },
          {
            agentDid: grant.subAgentDid,
            scripts: [
              {
                scriptName,
                versionReq: scriptVersion,
                functions: ["pay-invoice", "read-ledger"],
                allowedHosts: [env.merchantHost, "api.opensanctions.org"]
              }
            ]
          }
        ]
      }
    });

    return grant;
  }

  async delegateMandate(input: DelegateRequest): Promise<DelegateResult> {
    requireValues([["ORCHESTRATOR_KEY", env.orchestratorKey]]);
    const agent = await authedClient(env.orchestratorKey);
    const { getScriptVersion, getNodeUrl } = await sdk();
    const scriptName = tenantScriptName();
    const scriptVersion = await getScriptVersion(getNodeUrl(), scriptName);

    return executeAndDecode<DelegateResult>(agent, {
      script_name: scriptName,
      script_version: scriptVersion,
      function_name: "delegate-mandate",
      input
    });
  }

  async payInvoice(input: InvoiceRequest): Promise<PaymentResult> {
    requireValues([["SUB_AGENT_KEY", env.subAgentKey]]);
    const agent = await authedClient(env.subAgentKey);
    const { getScriptVersion, getNodeUrl } = await sdk();
    const scriptName = tenantScriptName();
    const scriptVersion = await getScriptVersion(getNodeUrl(), scriptName);

    return executeAndDecode<PaymentResult>(agent, {
      script_name: scriptName,
      script_version: scriptVersion,
      function_name: "pay-invoice",
      input
    });
  }

  async readLedger(): Promise<LedgerRow[]> {
    requireValues([["ORCHESTRATOR_KEY", env.orchestratorKey]]);
    // Using orchestrator key to read ledger, but either works
    const agent = await authedClient(env.orchestratorKey);
    const { getScriptVersion, getNodeUrl } = await sdk();
    const scriptName = tenantScriptName();
    const scriptVersion = await getScriptVersion(getNodeUrl(), scriptName);

    return executeAndDecode<LedgerRow[]>(agent, {
      script_name: scriptName,
      script_version: scriptVersion,
      function_name: "read-ledger",
      input: {}
    });
  }
}
