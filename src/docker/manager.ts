import Dockerode from 'dockerode';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { ContractAddresses } from '../blockchain/deploy';
import {
  DOCKER_NETWORK,
  ANVIL_CONTAINER,
  ANVIL_IMAGE,
  ANVIL_PORT,
  CHAIN_ID,
  BEE_NODE_PASSWORD,
  BEE_REPO_URL,
  BEE_LOCAL_IMAGE,
  BEE_NODES,
  DEFAULT_BLOCK_TIME_IN_SECONDS,
  NodeConfig,
} from '../config';

const docker = new Dockerode();

// ---------------------------------------------------------------------------
// Bee image helpers
// ---------------------------------------------------------------------------

export async function beeImageExists(ref: string): Promise<boolean> {
  try {
    await docker.getImage(`${BEE_LOCAL_IMAGE}:${ref}`).inspect();
    return true;
  } catch {
    return false;
  }
}

function runCommand(
  cmd: string,
  args: string[],
  options: { stdio?: 'inherit' | 'pipe'; cwd?: string } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: options.stdio ?? 'inherit', cwd: options.cwd });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

export async function buildBeeImage(ref: string): Promise<void> {
  const image = `${BEE_LOCAL_IMAGE}:${ref}`;
  const buildDir = path.join(os.tmpdir(), 'bee-factory-bee-build');

  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }

  try {
    await runCommand('git', ['clone', '--depth=1', '--branch', ref, BEE_REPO_URL, buildDir]);
    await runCommand(
      'docker',
      ['build', '--build-arg', 'REACHABILITY_OVERRIDE_PUBLIC=true', '-f', 'Dockerfile.dev', '-t', image, '.'],
      { cwd: buildDir }
    );
  } finally {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Hub image helpers
// ---------------------------------------------------------------------------

const HUB_ORG = 'ethersphere';

function normalizeHubTag(tag: string): string {
  return tag === 'master' ? 'latest' : tag;
}

function containerToHubName(containerName: string): string {
  if (containerName === ANVIL_CONTAINER) return 'bee-factory-blockchain';
  if (containerName === 'bee-factory-bee-0') return 'bee-factory-queen';
  const workerMatch = containerName.match(/^bee-factory-bee-(\d+)$/);
  if (workerMatch) return `bee-factory-worker-${workerMatch[1]}`;
  return containerName;
}

export function hubImageName(containerName: string, tag: string): string {
  return `${HUB_ORG}/${containerToHubName(containerName)}:${normalizeHubTag(tag)}`;
}

export async function tryPullPrebuiltImages(tag: string): Promise<boolean> {
  const images = [
    hubImageName(ANVIL_CONTAINER, tag),
    ...BEE_NODES.map(n => hubImageName(n.name, tag)),
  ];
  try {
    for (const image of images) {
      await pullImageIfNeeded(image);
    }
    return true;
  } catch {
    return false;
  }
}

interface AnvilStateFile {
  state: string;
  addresses: ContractAddresses;
}

export async function restoreAnvilState(): Promise<ContractAddresses> {
  const tmpFile = path.join(os.tmpdir(), 'bee-factory-anvil-restore.json');
  try {
    await runCommand('docker', ['cp', `${ANVIL_CONTAINER}:/anvil-state.json`, tmpFile], { stdio: 'pipe' });
    const data: AnvilStateFile = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    await anvilLoadStateRpc(data.state);
    return data.addresses;
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

function anvilLoadStateRpc(state: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', method: 'anvil_loadState', params: [state], id: 1 });
    const options: http.RequestOptions = {
      hostname: 'localhost',
      port: ANVIL_PORT,
      path: '/',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 120_000,
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(`anvil_loadState: ${parsed.error.message}`));
          resolve();
        } catch { reject(new Error('Invalid JSON from Anvil RPC')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('anvil_loadState timed out')); });
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

export async function pullImageIfNeeded(image: string): Promise<void> {
  // Check if image already exists locally
  try {
    await docker.getImage(image).inspect();
    return; // already present
  } catch {
    // not found locally – pull it
  }

  await new Promise<void>((resolve, reject) => {
    docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err2: Error | null) => {
        if (err2) return reject(err2);
        resolve();
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

export async function createNetwork(): Promise<void> {
  const networks = await docker.listNetworks({ filters: { name: [DOCKER_NETWORK] } });
  if (networks.length > 0) return; // already exists

  await docker.createNetwork({
    Name: DOCKER_NETWORK,
    Driver: 'bridge',
    CheckDuplicate: true,
  });
}

export async function removeNetwork(): Promise<void> {
  const networks = await docker.listNetworks({ filters: { name: [DOCKER_NETWORK] } });
  for (const net of networks) {
    if (net.Name === DOCKER_NETWORK) {
      const network = docker.getNetwork(net.Id);
      try {
        await network.remove();
      } catch {
        // ignore – may already be gone
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Container lifecycle
// ---------------------------------------------------------------------------

async function removeContainerIfExists(name: string): Promise<void> {
  try {
    const container = docker.getContainer(name);
    const info = await container.inspect();
    if (info.State.Running) {
      await container.stop({ t: 5 });
    }
    await container.remove({ force: true });
  } catch {
    // container doesn't exist – that's fine
  }
}

export async function stopAndRemoveContainer(name: string): Promise<void> {
  await removeContainerIfExists(name);
}

export async function startAnvil(blockTime?: number | undefined, imageOverride?: string): Promise<void> {
  await removeContainerIfExists(ANVIL_CONTAINER);

  // The foundry image uses ENTRYPOINT ["/bin/sh", "-c"], so Cmd must be a
  // single shell string — an array would have only the first element executed.
  const anvilArgs = [
    'anvil',
    '--host', '0.0.0.0',
    '--chain-id', String(CHAIN_ID),
    '--accounts', '20',
    '--balance', '10000',
    '--block-time', `${blockTime || DEFAULT_BLOCK_TIME_IN_SECONDS}`,
  ];
  const anvilCmd = anvilArgs.join(' ');

  const container = await docker.createContainer({
    name: ANVIL_CONTAINER,
    Image: imageOverride ?? ANVIL_IMAGE,
    Hostname: 'anvil',
    Cmd: [anvilCmd],
    ExposedPorts: { [`${ANVIL_PORT}/tcp`]: {} },
    HostConfig: {
      PortBindings: {
        [`${ANVIL_PORT}/tcp`]: [{ HostIp: '0.0.0.0', HostPort: String(ANVIL_PORT) }],
      },
      NetworkMode: DOCKER_NETWORK,
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [DOCKER_NETWORK]: { Aliases: ['anvil'] },
      },
    },
  });

  await container.start();
}

function buildBeeCmd(
  config: NodeConfig,
  contractAddresses: ContractAddresses,
  bootnodeAddr?: string,
  blockTime?: number | undefined
): string[] {
  const cmd: string[] = [
    'start',
    '--full-node',
    `--api-addr=:${config.apiPort}`,
    `--p2p-addr=:${config.p2pPort}`,
    `--blockchain-rpc-endpoint=http://anvil:${ANVIL_PORT}`,
    `--block-time=${blockTime || DEFAULT_BLOCK_TIME_IN_SECONDS}`,
    `--password=${BEE_NODE_PASSWORD}`,
    '--verbosity=5',
    `--network-id=${CHAIN_ID}`,
    '--mainnet=false',
    '--allow-private-cidrs',
    '--welcome-message=bee-factory',
    '--cors-allowed-origins=*',
    '--skip-postage-snapshot',
    '--warmup-time=1s',
    '--swap-enable',
    '--swap-initial-deposit=100000000000000000', // 10 BZZ
    `--postage-stamp-address=${contractAddresses.postageStamp}`,
    `--price-oracle-address=${contractAddresses.swapPriceOracle}`,
    `--staking-address=${contractAddresses.stakeRegistry}`,
    `--redistribution-address=${contractAddresses.redistribution}`,
    `--swap-factory-address=${contractAddresses.swapFactory}`,
    `--postage-stamp-start-block=${contractAddresses.postageStampStartBlock}`,
    '--withdrawal-addresses-whitelist="0xd238ff944bacb478cbed5efcae784d7bf4f2ff80"'
  ];

  if (bootnodeAddr) {
    cmd.push(`--bootnode=${bootnodeAddr}`);
  }

  return cmd;
}

export async function startBeeNodeWithTag(
  config: NodeConfig,
  contractAddresses: ContractAddresses,
  keystoreDir: string,
  tag: string,
  bootnodeAddr?: string,
  blockTime?: number | undefined,
  imageOverride?: string
): Promise<void> {
  await removeContainerIfExists(config.name);

  const hostname = config.name.replace(/^bee-factory-/, '');
  const image = imageOverride ?? `${BEE_LOCAL_IMAGE}:${tag}`;
  const cmd = buildBeeCmd(config, contractAddresses, bootnodeAddr, blockTime);

  const exposedPorts: Record<string, object> = {
    [`${config.apiPort}/tcp`]: {},
    [`${config.p2pPort}/tcp`]: {},
  };

  const portBindings: Record<string, Array<{ HostIp: string; HostPort: string }>> = {
    [`${config.apiPort}/tcp`]: [{ HostIp: '0.0.0.0', HostPort: String(config.apiPort) }],
    [`${config.p2pPort}/tcp`]: [{ HostIp: '0.0.0.0', HostPort: String(config.p2pPort) }],
  };

  const container = await docker.createContainer({
    name: config.name,
    Image: image,
    Hostname: hostname,
    Cmd: cmd,
    ExposedPorts: exposedPorts,
    HostConfig: {
      PortBindings: portBindings,
      NetworkMode: DOCKER_NETWORK,
      // writable so Bee can generate libp2p.key and pss.key alongside swarm.key
      Binds: [`${keystoreDir}:/home/bee/.bee/keys/`],
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [DOCKER_NETWORK]: { Aliases: [hostname] },
      },
    },
  });

  await container.start();
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export async function cleanupAll(): Promise<void> {
  // Find and remove all bee-factory-* containers
  const containers = await docker.listContainers({ all: true });
  const beeFactoryContainers = containers.filter(
    (c) => c.Names.some((n) => n.startsWith('/bee-factory-'))
  );

  await Promise.all(
    beeFactoryContainers.map(async (c) => {
      const container = docker.getContainer(c.Id);
      try {
        if (c.State === 'running') {
          await container.stop({ t: 5 });
        }
        await container.remove({ force: true });
      } catch {
        // ignore
      }
    })
  );

  await removeNetwork();
}

// ---------------------------------------------------------------------------
// Health / readiness polling
// ---------------------------------------------------------------------------

/**
 * Poll url until we get any HTTP response (any status), or 200 specifically.
 * For Anvil (JSON-RPC over HTTP) we send a minimal eth_chainId POST because
 * a plain GET returns 400 – but a 400 still proves the server is up.
 */
export async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const interval = 2000;

  // Use a JSON-RPC probe for the Anvil RPC URL, plain GET otherwise
  const isRpc = url.endsWith(':8545') || url.includes(':8545/');

  while (Date.now() < deadline) {
    const ok = isRpc ? await httpPostJsonRpc(url) : await httpGetAny(url);
    if (ok) return;
    await sleep(interval);
  }

  throw new Error(`Timed out waiting for ${url} to become ready (${timeoutMs}ms)`);
}

/**
 * Like waitForHttp but also watches the named container — if it exits before
 * the URL becomes ready, immediately throws with the container's tail logs so
 * CI failures are actionable rather than a bare timeout.
 */
export async function waitForContainerHttp(
  containerName: string,
  url: string,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const interval = 2000;

  while (Date.now() < deadline) {
    const ok = await httpGetAny(url);
    if (ok) return;

    // Check if the container has already exited
    try {
      const info = await docker.getContainer(containerName).inspect();
      if (!info.State.Running) {
        const logs = await getContainerLogs(containerName);
        throw new Error(
          `Container ${containerName} exited (code ${info.State.ExitCode}) before becoming ready.\n\nContainer logs:\n${logs}`
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('exited')) throw err;
      // container inspect failed — container gone entirely
      throw new Error(`Container ${containerName} disappeared before becoming ready.`);
    }

    await sleep(interval);
  }

  // Timed out — include logs to help diagnose the hang
  const logs = await getContainerLogs(containerName).catch(() => '(unavailable)');
  throw new Error(
    `Timed out waiting for ${url} to become ready (${timeoutMs}ms).\n\nContainer logs:\n${logs}`
  );
}

async function getContainerLogs(containerName: string): Promise<string> {
  const container = docker.getContainer(containerName);
  const stream = await container.logs({ stdout: true, stderr: true, tail: 50 });
  // dockerode returns a Buffer for non-TTY containers
  return stream.toString('utf8').trim();
}

/**
 * Poll /status on a bee node until isWarmingUp is false, failing fast if the
 * container exits. Call this after waitForContainerHttp confirms the API is up.
 */
export async function waitForBeeReady(
  containerName: string,
  apiPort: number,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const interval = 2000;
  const url = `http://localhost:${apiPort}/status`;

  while (Date.now() < deadline) {
    try {
      const body = await httpGetJson(url);
      if (body.isWarmingUp === false) return;
    } catch {
      // not ready yet
    }

    try {
      const info = await docker.getContainer(containerName).inspect();
      if (!info.State.Running) {
        const logs = await getContainerLogs(containerName);
        throw new Error(
          `Container ${containerName} exited (code ${info.State.ExitCode}) during warmup.\n\nContainer logs:\n${logs}`
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('exited')) throw err;
      throw new Error(`Container ${containerName} disappeared during warmup.`);
    }

    await sleep(interval);
  }

  const logs = await getContainerLogs(containerName).catch(() => '(unavailable)');
  throw new Error(
    `Timed out waiting for ${containerName} to finish warming up (${timeoutMs}ms).\n\nContainer logs:\n${logs}`
  );
}

/**
 * Poll /topology until the node has at least `minPeers` connected peers.
 * Bee's /status reports isWarmingUp=false from cached state immediately after
 * a restart from a committed image, so we need a separate peer-connectivity
 * gate before any reserve-sample work will succeed.
 */
export async function waitForPeers(
  apiPort: number,
  minPeers: number,
  timeoutMs: number
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  const interval = 2000;
  let lastConnected = 0;

  while (Date.now() < deadline) {
    try {
      const body = await httpGetJson(`http://localhost:${apiPort}/topology`);
      const connected = Number(body.connected ?? 0);
      lastConnected = connected;
      if (connected >= minPeers) return connected;
    } catch {
      // not ready yet
    }
    await sleep(interval);
  }

  throw new Error(
    `Timed out waiting for ${minPeers} peer(s) on port ${apiPort} (${timeoutMs}ms). Last connected count: ${lastConnected}`
  );
}

/**
 * Poll /rchash until it returns 200. After restoring chain state and restarting
 * Bee from a committed image, the reserve sampler needs the chain head to
 * advance past a redistribution round and Bee to reprocess events before
 * sampling chunks with proofs succeeds. Polling the actual endpoint is more
 * reliable than a fixed sleep.
 */
export async function waitForRchashReady(apiPort: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const interval = 3000;
  let lastError = 'no response';

  while (Date.now() < deadline) {
    try {
      const addrs = await httpGetJson(`http://localhost:${apiPort}/addresses`);
      const overlay = String(addrs.overlay ?? '');
      if (overlay) {
        const probe = await httpGetStatusAndBody(
          `http://localhost:${apiPort}/rchash/0/${overlay}/${overlay}`,
          20_000
        );
        if (probe.status === 200) return;
        lastError = `status ${probe.status} body ${probe.body.slice(0, 200)}`;
      } else {
        lastError = 'overlay address not yet available';
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(interval);
  }

  throw new Error(
    `Timed out waiting for rchash to become ready on port ${apiPort} (${timeoutMs}ms). Last: ${lastError}`
  );
}

/** Returns true if the server replies with any HTTP status (even 4xx). */
function httpGetAny(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port ? Number(parsedUrl.port) : 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      timeout: 3000,
    };

    const req = http.request(options, (res) => {
      res.resume();
      resolve(true); // any response means server is up
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/** Probe an Anvil JSON-RPC endpoint with eth_chainId POST. */
function httpPostJsonRpc(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const body = JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 });
    const parsedUrl = new URL(url);
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port ? Number(parsedUrl.port) : 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 3000,
    };

    const req = http.request(options, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Queen bootnode address
// ---------------------------------------------------------------------------

/**
 * Poll GET /addresses on the queen node until it returns a non-empty list of
 * underlay addresses, then return the first one that contains the internal
 * Docker network IP (i.e. not a loopback or external address).
 */
export async function getQueenBootnodeAddr(apiPort: number): Promise<string> {
  const url = `http://localhost:${apiPort}/addresses`;
  const deadline = Date.now() + 60_000;
  const interval = 2000;

  while (Date.now() < deadline) {
    try {
      const body = await httpGetJson(url);
      if (body && Array.isArray(body.underlay) && body.underlay.length > 0) {
        // Prefer an address that is NOT loopback (127.0.0.1) and NOT IPv6 loopback
        const nonLoopback = (body.underlay as string[]).find(
          (addr) => !addr.includes('127.0.0.1') && !addr.includes('/ip4/0.0.0.0')
        );
        if (nonLoopback) return nonLoopback;
        // Fall back to first address
        return body.underlay[0] as string;
      }
    } catch {
      // not ready yet
    }
    await sleep(interval);
  }

  throw new Error('Timed out waiting for queen bootnode address');
}

function httpGetStatusAndBody(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port ? Number(parsedUrl.port) : 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      timeout: timeoutMs,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}

function httpGetJson(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port ? Number(parsedUrl.port) : 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      timeout: 3000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.end();
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
