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
