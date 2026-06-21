# Terminal 3 DevRel Feedback

As requested by the bounty for the secondary prize, here are some friction points and bugs encountered while building out the Multi-Agent Delegation Treasury using the Terminal 3 SDK and TEE environment:

1. **Missing `wit/deps` in Scaffold:** 
   The boilerplate Rust contract relies on `host:tenant` interfaces. However, the `wit/deps` directory is missing from the initial scaffold, requiring developers to manually clone `z-tenant-flight` and copy the `deps` folder over before `wit-bindgen` and `cargo build` will succeed. Including `wit/deps` directly in the scaffolding templates or providing a `cargo` script to fetch them would significantly smooth the onboarding process.

2. **A2A Multi-hop Complexity:** 
   The current A2A (Agent-to-Agent) platform grants seem to fight multi-hop delegation natively. To achieve a multi-agent flow, we had to rely on a single orchestrator holding scoped sub-credentials (via the TEE KV store) rather than leveraging pure platform-level multi-hop. Simplifying the A2A platform grants to natively support tree-like delegation scopes would be highly beneficial for "governance of autonomous agents" use cases.

3. **`AgentAuth` SDK Typings:**
   The `functions` property in the `AgentAuth` script configuration didn't immediately support complex sub-delegation permissions without manually bypassing some strict typings or explicitly mapping them to custom WASM exports.

4. **WASM Target Requirement:**
   Running `cargo build` fails cryptically if the `wasm32-wasip2` target is missing. A simple check or a `Makefile`/`build.sh` that automatically runs `rustup target add wasm32-wasip2` would prevent first-time Rust/WASM developers from getting stuck.
