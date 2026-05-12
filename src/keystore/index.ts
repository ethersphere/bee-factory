import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { BEE_NODE_PASSWORD, NodeConfig } from '../config';

const BASE_DIR = '/tmp/bee-factory/keys';

/**
 * Generates an Ethereum keystore V3 file for a Bee node private key,
 * writes it to /tmp/bee-factory/keys/bee-{n}/ and returns that directory path.
 *
 * Bee expects the keystore directory to contain a file named after the
 * Ethereum address (lowercase, no 0x prefix) and the file content to be
 * a standard eth_keystore JSON object.
 */
export async function generateKeystore(node: NodeConfig): Promise<string> {
  const keyDir = path.join(BASE_DIR, `bee-${node.index}`);

  // Clean and re-create the key directory on each run for a fresh state
  if (fs.existsSync(keyDir)) {
    fs.rmSync(keyDir, { recursive: true, force: true });
  }
  fs.mkdirSync(keyDir, { recursive: true });
  fs.chmodSync(keyDir, 0o777);

  const wallet = new ethers.Wallet(node.privateKey);
  const address = wallet.address.toLowerCase().replace(/^0x/, '');

  // Encrypt with the shared password; use default params (scrypt tuning
  // is not exposed in the ethers v6 type signature for encrypt())
  const encrypted = await wallet.encrypt(BEE_NODE_PASSWORD);

  // Bee loads the main overlay key from a file named "swarm.key" inside the
  // keys directory. The file format is a standard Ethereum keystore V3 JSON.
  // Bee generates libp2p.key and pss.key itself if they are absent.
  void address; // address is encoded inside the keystore JSON already
  const keystoreFile = path.join(keyDir, 'swarm.key');
  fs.writeFileSync(keystoreFile, encrypted);

  return keyDir;
}

/**
 * Generate keystores for all provided nodes in parallel.
 * Returns an array of { node, keystoreDir } objects in the same order.
 */
export async function generateAllKeystores(
  nodes: NodeConfig[]
): Promise<Array<{ node: NodeConfig; keystoreDir: string }>> {
  return Promise.all(
    nodes.map(async (node) => {
      const keystoreDir = await generateKeystore(node);
      return { node, keystoreDir };
    })
  );
}
