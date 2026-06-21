# Aegis: Compliance-Gated Agentic Treasury

**Live Demo:** [https://enclave-pay-dashboard.vercel.app/](https://enclave-pay-dashboard.vercel.app/)

Aegis is a secure, hardware-enforced **Multi-Agent Treasury** built for the **Terminal 3 Agent Dev Kit (ADK) bounty**. It provides a robust framework for governing autonomous AI agents with financial capabilities, ensuring they operate strictly within pre-defined boundaries.

---

## 🌟 The Vision & Problem

As AI agents become more capable, companies are beginning to trust them with financial execution (e.g., paying vendors, processing invoices, rebalancing portfolios). However, giving an AI direct access to a corporate treasury or API keys is fundamentally dangerous. 

**The Problems we solve:**
1. **Rogue AI:** Agents can hallucinate or be prompt-injected into sending funds to malicious actors.
2. **PCI/PII Data Leaks:** Sub-agents typically need access to sensitive banking or crypto addresses to execute payments, expanding the attack surface.
3. **Lack of Granular Delegation:** Traditional API keys are all-or-nothing. We lack a standardized way for a master agent to delegate a strict sub-mandate to a worker agent.

**The Aegis Solution:**
Aegis leverages the **Terminal 3 Trusted Execution Environment (TEE)** to enforce immutable, hardware-level guardrails. It introduces a hierarchical **Agent-to-Agent (A2A) delegation flow** where AI agents are restricted by cryptographic mandates, and sensitive payout data is completely abstracted away from the agents themselves using placeholders.

---

## 🏗️ How It Works (Architecture)

Aegis separates the *decision-making* of the AI from the *execution* of the funds. 

1. **The TEE Contract (`contracts/z-tenant-treasury`):** Written in Rust and compiled to WASM, this smart contract runs entirely inside Terminal 3's secure enclave. It enforces the rules.
2. **The Orchestrator & Sub-Agents:** Autonomous AI agents that evaluate invoices and trigger execution. They hold throwaway EVM keys, but *never* hold the actual treasury funds.
3. **The Dashboard:** A Next.js frontend that allows humans (e.g., a CFO) to monitor the ledger, configure the master mandate, and watch the agents operate in real-time.

---

## 🤖 The Agent-to-Agent (A2A) Flow

Aegis demonstrates a sophisticated, three-tier hierarchical delegation system:

1. **The Human (CFO):** A human user seeds the TEE contract with a master mandate (e.g., "$500,000 budget, expires in 30 days, approved vendors only").
2. **The Orchestrator Agent (Agent 1):** The human grants the Orchestrator the right to manage the treasury. The Orchestrator cannot spend money directly. Instead, it scopes a specific sub-mandate (e.g., "Pay Vendor X up to $5,000") and delegates it to a specialized worker.
3. **The Payout Agent (Agent 2):** The sub-agent receives the sub-mandate and executes the `pay-invoice` function inside the TEE. 

If any agent attempts to act outside its mandate (e.g., going over budget, paying a rogue vendor), the TEE physically rejects the execution and logs the violation.

---

## 🛡️ Hardware-Enforced Guardrails

Aegis implements four critical security checks inside the Rust contract:

*   **Vendor Whitelists:** The TEE checks if the requested vendor is on the approved mandate list.
*   **Budget Ceilings:** The TEE guarantees that the cumulative payouts never exceed the delegated budget.
*   **Mandate Expiries:** Sub-mandates have strict UNIX timestamp expiries.
*   **Placeholder Egress (PCI Compliance):** The agents *never* see the plain-text payout addresses of the vendors. They submit requests using placeholders like `{{profile.vendors.vendor_alpha.payout_ref}}`. The Terminal 3 TEE resolves these placeholders internally just before making the HTTP egress call to the settlement rail, ensuring the agents remain completely out of PCI scope.

---

## 🚀 Project Structure

*   `contracts/z-tenant-treasury/` - The Rust/WASM TEE smart contract that enforces the treasury policy, AML checks, and the immutable ledger.
*   `orchestrator/` - TypeScript environment setups and CLI scripts that simulate the Agent attack/payout workflows.
*   `dashboard/` - A Next.js visual dashboard backed by NeonDB (PostgreSQL) and Prisma, providing a real-time window into the TEE state.

---

## 💻 Getting Started (Local Development)

```bash
# 1. Install dependencies across all workspaces
npm install

# 2. Setup environment variables
cp .env.example .env
cp dashboard/.env.example dashboard/.env

# 3. Start the local Next.js dashboard
npm run dev
```

*Note: By default, the project uses `T3_PROVIDER=mock`, allowing you to run the full dashboard and multi-agent simulation locally without requiring live testnet credentials.*

---

## 🌐 Live T3 Testnet Setup

To run the live testnet flow, configure your `.env` with `T3_PROVIDER=t3` and input your `TENANT_DID` and `TENANT_KEY`. 

**1. Generate Agent Keys:**
```bash
npm run env:wallets   # Generates throwaway EVM keys for Orchestrator & Sub-Agent
npm run env:identify  # Authenticates keys on T3 to discover their DIDs
```

**2. Fund Agents:**
Ensure both your `ORCHESTRATOR_DID` and `SUB_AGENT_DID` are funded with T3 test credits via the Terminal 3 Faucet.

**3. Execute the Lifecycle:**
```bash
npm run contract:build  # Compile the Rust WASM contract
npm run cli:setup       # Register contract on T3 & seed master mandate
npm run cli:grant       # User grants permissions to the AI Agents
npm run cli:pay         # The Sub-Agent pays an approved invoice via TEE
npm run cli:attacks     # Attack scripts prove the TEE blocks rogue actions
```

---

## ☁️ Deployment

*   **Frontend / Backend:** The Dashboard and API routes are designed for **Vercel**. When `T3_PROVIDER=t3`, the Next.js API route (`/api/pay`) securely communicates with the Terminal 3 testnet to execute A2A transactions synchronously.
*   **Smart Contract:** Deployed directly to the Terminal 3 infrastructure via the `cli:setup` script. No manual server hosting required.
