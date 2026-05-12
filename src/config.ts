export const DOCKER_NETWORK = 'bee-factory-net';
export const ANVIL_CONTAINER = 'bee-factory-anvil';
export const ANVIL_IMAGE = 'ghcr.io/foundry-rs/foundry:latest';
export const ANVIL_PORT = 8545;
export const CHAIN_ID = 1337;

export const BEE_REPO_URL = 'https://github.com/ethersphere/bee.git';
export const BEE_LOCAL_IMAGE = 'bee-factory/bee';
export const BEE_TAG_DEFAULT = 'master';

// Fixed deployer key (Foundry account 0)
export const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// Fixed Bee node private keys (Foundry accounts 5-9)
// These are well-known test keys, never use in production
export const BEE_NODE_KEYS = [
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba', // queen
  '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec15649',
  '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  '0xdbda1821b80551c9d65939329250132c444d73f6a52f3fbdb50866273e8f41f1',
  '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
] as const;

export const BEE_NODE_PASSWORD = 'bee-factory';

export interface NodeConfig {
  index: number;
  name: string;
  apiPort: number;
  p2pPort: number;
  privateKey: string;
}

export const BEE_NODES: NodeConfig[] = [
  { index: 0, name: 'bee-factory-bee-0', apiPort: 1633, p2pPort: 1634, privateKey: BEE_NODE_KEYS[0] },
  { index: 1, name: 'bee-factory-bee-1', apiPort: 11633, p2pPort: 11634, privateKey: BEE_NODE_KEYS[1] },
  { index: 2, name: 'bee-factory-bee-2', apiPort: 21633, p2pPort: 21634, privateKey: BEE_NODE_KEYS[2] },
  { index: 3, name: 'bee-factory-bee-3', apiPort: 31633, p2pPort: 31634, privateKey: BEE_NODE_KEYS[3] },
  { index: 4, name: 'bee-factory-bee-4', apiPort: 41633, p2pPort: 41634, privateKey: BEE_NODE_KEYS[4] },
];

export const ETH_FUND_AMOUNT = '1';   // 1 ETH
export const BZZ_FUND_AMOUNT = '100'; // 100 BZZ (with 16 decimals)
