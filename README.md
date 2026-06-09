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
bee-factory start               # Start the stack (uses bundled snapshot for fast boot)
bee-factory start --fresh       # Redeploy contracts from scratch, save new snapshot
bee-factory start --tag v2.7.1  # Build Bee from a specific git ref (default: master)

bee-factory stop                # Stop and remove all containers
```

## Endpoints

| Node    | API                    | P2P                    |
|---------|------------------------|------------------------|
| Queen    | http://localhost:1633 | http://localhost:1634 |
| Worker 1 | http://localhost:1635 | http://localhost:1636 |
| Worker 2 | http://localhost:1637 | http://localhost:1638 |
| Worker 3 | http://localhost:1639 | http://localhost:1640 |
| Worker 4 | http://localhost:1641 | http://localhost:1642 |

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

Worker 1 (`:1635`) buys a postage batch and uploads random data in a loop until Worker 2 (`:1637`) has received at least one SWAP cheque from it. By the time `bee-factory start` finishes, `:1637` already has a claimable cheque issued by `:1635`, so you can immediately exercise cheque cashing, balance queries, and SWAP accounting without having to generate traffic yourself.

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

## Node wallets

> **Foundry test keys — never use in production.**

| Node | Address | Private Key |
|------|---------|-------------|
| bee-factory-bee-0 (queen) | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | `0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba` |
| bee-factory-bee-1 (worker 1) | `0xc512CF05d75c4B4818a04d9c65B974168828764A` | `0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec15649` |
| bee-factory-bee-2 (worker 2) | `0x14dC79964da2C08b23698B3D3cc7Ca32193d9955` | `0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356` |
| bee-factory-bee-3 (worker 3) | `0x92A6095F965d30afFCC9da457d8fDB44ccB98F92` | `0xdbda1821b80551c9d65939329250132c444d73f6a52f3fbdb50866273e8f41f1` |
| bee-factory-bee-4 (worker 4) | `0xa0Ee7A142d267C1f36714E4a8F75612F20a79720` | `0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6` |

## Notes

- Each node is funded with 1 ETH and 100 BZZ.
- Node password: `bee-factory`
- Snapshots: `--fresh` redeploys contracts and saves a new snapshot; subsequent normal starts load from it instantly.
- Uses [Foundry test keys](https://www.getfoundry.sh/anvil#default-accounts) — never use in production.
