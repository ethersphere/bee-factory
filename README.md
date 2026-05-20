# bee-factory

Local Ethereum Swarm development stack — 5 Bee nodes + Anvil blockchain, fully wired up in one command.

## Requirements

- Node.js ≥ 18
- Docker

## Install

```sh
npm install -g @ethersphere/bee-factory
```

## Usage

```sh
bee-factory start           # Start the stack (uses bundled snapshot for fast boot)
bee-factory start --fresh   # Redeploy contracts from scratch, save new snapshot
bee-factory start --tag v2.5.0     # Build Bee from a specific git ref (default: master)

bee-factory stop            # Stop and remove all containers
```

## Endpoints

| Node    | API                    | P2P                    |
|---------|------------------------|------------------------|
| Queen   | http://localhost:1633  | http://localhost:1634  |
| Worker 1 | http://localhost:11633 | http://localhost:11634 |
| Worker 2 | http://localhost:21633 | http://localhost:21634 |
| Worker 3 | http://localhost:31633 | http://localhost:31634 |
| Worker 4 | http://localhost:41633 | http://localhost:41634 |

**Anvil RPC:** `http://localhost:8545` (chain ID 1337)

## Deployed contracts

| Contract | Role |
|---|---|
| BzzToken | ERC-20 BZZ token |
| PostageStamp | Postage stamp management |
| PriceOracle | Postage pricing |
| StakeRegistry | Node staking |
| Redistribution | Stake redistribution |
| SimpleSwapFactory | Swap contract factory |
| SwapPriceOracle | Swap pricing oracle |

Contract addresses are printed on startup.

## Pre-wired state

After all nodes are up, bee-factory performs two extra setup steps so the stack is ready for common Swarm development scenarios:

### Cheque / SWAP testing

Worker 1 (`:11633`) buys a postage batch and uploads random data in a loop until Worker 2 (`:21633`) has received at least one SWAP cheque from it. By the time `bee-factory start` finishes, `:21633` already has a claimable cheque issued by `:11633`, so you can immediately exercise cheque cashing, balance queries, and SWAP accounting without having to generate traffic yourself.

### Withdrawal address whitelist

All nodes are started with a single pre-whitelisted withdrawal address:

```
0xd238ff944bacb478cbed5efcae784d7bf4f2ff80
```

This lets you test both sides of the withdrawal API (exposed by every node):

- **Authorized withdrawal** — call `withdrawBZZ` or `withdrawNativeToken` with the address above and the request goes through.
- **Unauthorized withdrawal** — use any other address and Bee rejects it with HTTP 400 (`provided address not whitelisted`).

### Reserve sampling / `rchash`

Once the cheque is in place, the chain is advanced by 160 blocks (more than one full redistribution round of 152 blocks). This moves the consensus timestamp forward so that the uploaded chunks are no longer considered "too new" by the reserve sampler. After a short wait for Bee nodes to catch up, `rchash` (reserve commitment hash) can be called successfully.

## Notes

- Each node is funded with 1 ETH and 100 BZZ.
- Node password: `bee-factory`
- Snapshots: `--fresh` redeploys contracts and saves a new snapshot; subsequent normal starts load from it instantly.
- Uses [Foundry test keys](https://book.getfoundry.sh/reference/anvil/#default-accounts) — never use in production.
