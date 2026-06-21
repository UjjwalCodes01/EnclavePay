# Aegis

Aegis is a **Compliance-gated agentic treasury** built for the Terminal 3 Agent Dev Kit (ADK) bounty.

It demonstrates a secure, multi-agent (Agent-to-Agent or A2A) delegation flow where a human CFO grants an AI Orchestrator a scoped master mandate. The Orchestrator can then delegate sub-mandates to a Payout Agent. The Payout Agent can pay approved vendors only within the allowed budget, before the mandate expiry, and through placeholder-protected egress.

Crucially, **sensitive payout references remain as `{{profile.*}}` markers** until the Terminal 3 Trusted Execution Environment (TEE) securely resolves them. Every granted, paid, or blocked action is written to an immutable audit ledger.

## Features
- **Multi-Agent Delegation:** Demonstrates A2A governance where parent agents restrict the capabilities of child agents.
- **Placeholder Egress:** Sub-agents never see plain-text payout addresses, ensuring strict PCI/PII compliance.
- **Hardware-Enforced Policies:** Budgets, vendor whitelists, and expiries are checked inside a Rust WASM contract running in a secure enclave (TEE).
- **Dual Providers:** Run the system entirely locally using the `mock` provider, or connect to the real `t3` testnet.

## Project Structure

- `contracts/z-tenant-treasury` - The Rust/WASM TEE contract that enforces the treasury policy, AML checks, and ledger.
- `orchestrator` - TypeScript CLI scripts to manage environments, setup the tenant, and simulate the agent attack/payout flow.
- `dashboard` - A Next.js visual dashboard (with Prisma + SQLite) to observe the live state of the TEE contract.

## Local Setup

```bash
# Install dependencies across all workspaces
npm install

# Setup environment variables
cp .env.example .env

# Start the local Next.js dashboard
npm run dev
```

By default, the dashboard and CLI use `T3_PROVIDER=mock`. This allows you to run the full demo locally without testnet credentials. Switch to `T3_PROVIDER=t3` when your Terminal 3 keys and agent credits are ready.

## Live T3 Testnet Setup

To run the live testnet flow, you will need your `TENANT_DID` and `TENANT_KEY`. 
Then, generate the throwaway user and agent keys:

```bash
# Generates throwaway EVM keys for User, Orchestrator, and Sub-Agent
npm run env:wallets

# Authenticates those keys on T3 to discover their DIDs
npm run env:identify
```

**IMPORTANT:** Before executing the real flow, you must ensure that your Agent DIDs are funded with T3 test credits via the Terminal 3 Faucet.

## Demo Flow Scripts

Run these scripts in order to demonstrate the treasury lifecycle:

```bash
# 1. Compile the Rust WASM contract (requires wasm32-wasip2 target)
npm run contract:build

# 2. Register the contract on T3 and seed the initial treasury mandate
npm run cli:setup

# 3. User grants the agents access to `pay-invoice` and `read-ledger`
npm run cli:grant

# 4. The Sub-Agent successfully pays an approved invoice
npm run cli:pay

# 5. Attack scripts prove the TEE guardrails hold (e.g. over budget, rogue vendor)
npm run cli:attacks
```

## Deployment Guide

Deploying this project to production involves three separate environments:

### 1. Smart Contract Deployment (Terminal 3 TEE)
The Rust contract is "deployed" to the Terminal 3 platform dynamically. 
Running `npm run cli:setup` automatically compiles the WASM (if changed) and registers it on the testnet under your Tenant DID. No manual server deployment is required for the backend logic.

### 2. Frontend Dashboard Deployment (Vercel)
The `dashboard` is a standard Next.js application. 
- Ensure your `DATABASE_URL` is set to a persistent database (e.g., PostgreSQL via Prisma) instead of local SQLite if you want data to persist across deployments.
- Deploy the `dashboard` directory directly to **Vercel** or **Netlify**. Set the Root Directory to `dashboard` in your Vercel project settings.

### 3. Agent Scripts Deployment (Cron / Worker)
The scripts in `orchestrator/src/` currently simulate the AI agents. In a real deployment, these would run on a secure backend server (like **Render**, **Railway**, or **AWS ECS**) as a continuous background worker, listening for incoming invoices and triggering `delegateMandate` or `payInvoice` using the T3 SDK.
