import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { ContractAddresses } from './deploy';
import { ANVIL_PORT } from '../config';

interface SnapshotFile {
  state: string;
  addresses: ContractAddresses;
}

// Detect whether we're running via ts-node (src/) or compiled (dist/)
// and resolve the snapshot directory accordingly.
function resolveSnapshotDir(): string {
  if (__dirname.endsWith(path.join('src', 'blockchain'))) {
    return path.join(__dirname, '..', 'snapshot');
  }
  return path.join(__dirname, '..', '..', 'src', 'snapshot');
}

function findSnapshotFile(): string | null {
  const candidates = [
    path.join(__dirname, '..', 'snapshot', 'anvil-state.json'),
    path.join(__dirname, '..', '..', 'src', 'snapshot', 'anvil-state.json'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export function hasSnapshot(): boolean {
  return findSnapshotFile() !== null;
}

export async function applySnapshot(): Promise<ContractAddresses> {
  const p = findSnapshotFile();
  if (!p) throw new Error('No snapshot file found');
  const data: SnapshotFile = JSON.parse(fs.readFileSync(p, 'utf8'));
  await anvilJsonRpc('anvil_loadState', [data.state]);
  return data.addresses;
}

export async function saveSnapshot(addresses: ContractAddresses): Promise<void> {
  const state = (await anvilJsonRpc('anvil_dumpState', [])) as string;
  const dir = resolveSnapshotDir();
  fs.mkdirSync(dir, { recursive: true });
  const data: SnapshotFile = { state, addresses };
  fs.writeFileSync(path.join(dir, 'anvil-state.json'), JSON.stringify(data, null, 2));
}

// Bee refuses to start on a chain whose head is older than this (maxDelay in
// bee's pkg/node/chain.go, enforced by transaction.WaitSynced).
const MAX_CLOCK_DRIFT_SECONDS = 60;

/**
 * Re-anchors the chain clock to wall clock after a state restore.
 *
 * Since foundry #15760 ("continue the saved timeline after loading state", in nightlies
 * from 2026-08-07), anvil_loadState resets the node clock to the timestamp stored in the
 * dump and keeps mining from there — so a restored chain stays exactly as far behind wall
 * clock as the dump is old. Bee's startup sync check then never passes and every node hangs
 * before libp2p comes up, which surfaces here as a queen bootnode timeout.
 *
 * On older anvil builds, which left the clock at wall time, this is a no-op.
 */
export async function resyncChainClock(): Promise<{ driftBefore: number; driftAfter: number }> {
  const driftBefore = await chainClockDrift();

  try {
    await anvilJsonRpc('evm_setTime', [nowSeconds()]);
  } catch {
    // Anvil builds without evm_setTime never re-anchored the clock on load either, so
    // their restored chain already runs at wall time. If it doesn't, the drift check
    // below reports it.
  }

  // Bee reads the latest block header, not the pending block env, so the new timestamp
  // only becomes visible once a block is mined. Interval mining would get there within
  // --block-time seconds; mining explicitly removes the race.
  await anvilJsonRpc('anvil_mine', ['0x1']);

  const driftAfter = await chainClockDrift();
  if (driftAfter > MAX_CLOCK_DRIFT_SECONDS) {
    throw new Error(
      `Chain head is ${driftAfter}s behind wall clock after re-anchoring (limit ${MAX_CLOCK_DRIFT_SECONDS}s). ` +
      `Bee would hang in its startup blockchain sync check. Run with --fresh to redeploy from scratch.`
    );
  }

  return { driftBefore, driftAfter };
}

/** Seconds by which the chain head trails wall clock. */
async function chainClockDrift(): Promise<number> {
  const block = (await anvilJsonRpc('eth_getBlockByNumber', ['latest', false])) as {
    timestamp: string;
  } | null;
  if (!block) throw new Error('Anvil returned no latest block');
  return nowSeconds() - parseInt(block.timestamp, 16);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function anvilJsonRpc(method: string, params: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
    const options: http.RequestOptions = {
      hostname: 'localhost',
      port: ANVIL_PORT,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15_000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(`Anvil RPC error: ${parsed.error.message}`));
          resolve(parsed.result);
        } catch {
          reject(new Error('Invalid JSON from Anvil RPC'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Anvil RPC request timed out'));
    });

    req.write(body);
    req.end();
  });
}
