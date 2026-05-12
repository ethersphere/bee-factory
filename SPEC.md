# Overview

-   This project is called bee-factory.
-   It is a CLI tool written in TypeScript/Node.js (requires Node.js ≥ 18), distributed as an npm package (`npx @ethersphere/bee-factory`).
-   Its purpose is to run a local stack of Bee nodes for Ethereum Swarm development.
-   A Bee node is the official Swarm client implementation.
-   The tool uses Docker to run Bee nodes and a local blockchain to simulate the Ethereum network.

# CLI

-   `bee-factory start` — starts the local stack using the bundled Anvil snapshot for fast boot (contracts and funded wallets are restored; no redeployment).
-   `bee-factory start --fresh` — ignores the snapshot, redeploys all contracts from scratch, funds wallets, and saves a new snapshot for future fast starts.
-   `bee-factory start --tag <ref>` — builds Bee from a specific git ref (branch, tag, or commit; default: `master`). If the corresponding `bee-factory/bee:<ref>` image already exists locally, the build is skipped.
-   `bee-factory stop` — stops and removes all containers and the Docker network.
-   Every `bee-factory start` must begin by removing any existing bee-factory containers and the Docker network (clean slate).

# Bee Nodes

-   The tool must always run exactly 5 Bee nodes, all running as full nodes (not ultra-light or light).
-   Bee nodes must be built from source with `REACHABILITY_OVERRIDE_PUBLIC=true` baked in at compile time (it is a Go linker flag passed to `make binary`, not a runtime env var). The tool clones the official `https://github.com/ethersphere/bee.git` repository to a temporary directory, builds via `Dockerfile.dev` with `--build-arg REACHABILITY_OVERRIDE_PUBLIC=true`, and tags the result as `bee-factory/bee:<ref>`. The build is skipped on subsequent starts if the image already exists locally.
-   Bee node keys must be fixed, pre-baked private keys.
-   The tool must generate an Ethereum V3 keystore file (`swarm.key`) for each node from its pre-baked private key, encrypt it with the fixed password `bee-factory`, store it under `/tmp/bee-factory/keys/bee-{n}/`, and mount that directory into the container.
-   The node at API port 1633 is the "queen" (main) node; the other four are worker nodes that connect to it to build topology.

| Node   | API port | P2P port |
|--------|----------|----------|
| queen  | 1633     | 1634     |
| worker | 11633    | 11634    |
| worker | 21633    | 21634    |
| worker | 31633    | 31634    |
| worker | 41633    | 41634    |

# Blockchain

-   The local blockchain must use Anvil (Foundry), exposed on port 8545, with chain ID 1337 and a 5-second block time.
-   A dedicated Docker bridge network must be created so containers can reach each other by hostname.

# Smart Contracts

-   The required contracts are: BzzToken, PostageStamp, PriceOracle, StakeRegistry, Redistribution, SimpleSwapFactory, and SwapPriceOracle.
-   Smart contract artifacts (ABI + bytecode) must be bundled with the npm package.
-   A bundled Anvil state snapshot (contract deployments + funded wallets) must also be included in the npm package so that `bee-factory start` (without `--fresh`) can restore state instantly.
-   When deploying from scratch, contracts must be deployed programmatically, followed by role grants and initial configuration:
    -   Grant `PRICE_ORACLE_ROLE` on PostageStamp to PriceOracle (so it can call `setPrice`).
    -   Grant `REDISTRIBUTOR_ROLE` on PostageStamp to Redistribution.
    -   Grant `REDISTRIBUTOR_ROLE` on StakeRegistry to Redistribution.
    -   Grant `PRICE_UPDATER_ROLE` on PriceOracle to the deployer, then call `setPrice` with an initial non-zero value so Bee nodes can read a valid price immediately.
-   Each node must be funded with 1 ETH and 100 BZZ tokens. BZZ uses 16 decimals.

# Startup Sequence

1.  Remove all existing bee-factory containers and the Docker network.
2.  Start Anvil; wait for its RPC to be ready.
3.  Restore contracts and funded wallets from the bundled snapshot (or deploy and fund from scratch if `--fresh`).
4.  Generate keystore files for all nodes.
5.  Start the queen node; wait for its API to respond.
6.  Fetch the queen's underlay address from its `/addresses` API endpoint.
7.  Start each worker node with `--bootnode` set to the queen's underlay address; wait for each API to respond.
8.  Wait for all nodes to report `isWarmingUp: false` via their `/status` endpoint before declaring the stack ready.
