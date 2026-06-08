import chalk from 'chalk';
import ora from 'ora';
import { ethers } from 'ethers';

import {
  ANVIL_CONTAINER,
  ANVIL_IMAGE,
  ANVIL_PORT,
  BEE_NODES,
  BEE_LOCAL_IMAGE,
  BEE_REPO_URL,
} from '../config';
import { deployContracts, ContractAddresses } from '../blockchain/deploy';
import { fundNodes } from '../blockchain/fund';
import { hasSnapshot, applySnapshot, saveSnapshot } from '../blockchain/snapshot';
import { generateAllKeystores } from '../keystore';
import {
  cleanupAll,
  pullImageIfNeeded,
  beeImageExists,
  buildBeeImage,
  createNetwork,
  startAnvil,
  startBeeNodeWithTag,
  waitForHttp,
  waitForContainerHttp,
  waitForBeeReady,
  waitForPeers,
  waitForRchashReady,
  getQueenBootnodeAddr,
  hubImageName,
  tryPullPrebuiltImages,
  restoreAnvilState,
} from '../docker/manager';
import { generateTraffic } from '../services/traffic_generator';

export interface StartOptions {
  tag: string;
  fresh: boolean;
  blockTime: number | undefined;
}

export async function start(options: StartOptions): Promise<void> {
  const { tag, fresh, blockTime } = options;

  console.log(chalk.bold.cyan('\nbee-factory — Local Bee Stack'));
  console.log(chalk.dim('────────────────────────────────────────\n'));

  // 1. Clean slate
  {
    const spinner = ora('Cleaning up existing containers...').start();
    try {
      await cleanupAll();
      spinner.succeed(chalk.green('Clean slate ready.'));
    } catch (err) {
      spinner.fail(chalk.red('Cleanup failed.'));
      throw err;
    }
  }

  // Check for pre-built hub images (master → latest). If all 6 images are
  // available, pull them and skip the build + warmup steps entirely.
  const usePrebuilt = !fresh && await tryPullPrebuiltImages(tag);
  if (usePrebuilt) {
    console.log(chalk.green(`✓ Pre-built images found — quickstart mode.\n`));
  }

  // 2. Pull Anvil image (skipped when using pre-built hub images)
  if (!usePrebuilt) {
    const spinner = ora(`Pulling ${ANVIL_IMAGE}...`).start();
    try {
      await pullImageIfNeeded(ANVIL_IMAGE);
      spinner.succeed(chalk.green(`Image ready: ${ANVIL_IMAGE}`));
    } catch (err) {
      spinner.fail(chalk.red(`Failed to pull ${ANVIL_IMAGE}`));
      throw err;
    }
  }

  // 3. Ensure Bee image — skipped when using pre-built hub images
  if (!usePrebuilt) {
    const localImage = `${BEE_LOCAL_IMAGE}:${tag}`;
    if (await beeImageExists(tag)) {
      console.log(chalk.green(`✓ Bee image ready: ${localImage}`));
    } else {
      console.log(chalk.yellow(`Bee image ${localImage} not found — building from source.`));
      console.log(chalk.dim(`  Cloning ${BEE_REPO_URL} at ref "${tag}"...`));
      console.log(chalk.dim(`  This may take several minutes (compiling Go).\n`));
      try {
        await buildBeeImage(tag);
        console.log(chalk.green(`\n✓ Bee image built: ${localImage}`));
      } catch (err) {
        console.log(chalk.red(`\nFailed to build Bee image.`));
        throw err;
      }
    }
    console.log();
  }

  // 4. Create Docker network
  {
    const spinner = ora('Creating Docker network...').start();
    try {
      await createNetwork();
      spinner.succeed(chalk.green('Docker network ready.'));
    } catch (err) {
      spinner.fail(chalk.red('Failed to create Docker network.'));
      throw err;
    }
  }

  // 5. Start Anvil
  {
    const spinner = ora('Starting Anvil blockchain...').start();
    console.log(chalk.dim(`\n  Block time: ${blockTime ?? 'default (1)'} seconds\n`));
    try {
      await startAnvil(blockTime, usePrebuilt ? hubImageName(ANVIL_CONTAINER, tag) : undefined);
      spinner.text = 'Waiting for Anvil RPC to be ready...';
      await waitForHttp(`http://localhost:${ANVIL_PORT}`, 60_000);
      spinner.succeed(chalk.green(`Anvil running on port ${ANVIL_PORT}.`));
    } catch (err) {
      spinner.fail(chalk.red('Failed to start Anvil.'));
      throw err;
    }
  }

  // 6. Deploy contracts + fund wallets, or restore from snapshot
  let addresses: ContractAddresses;

  if (usePrebuilt) {
    const spinner = ora('Restoring Anvil state from pre-built image...').start();
    try {
      addresses = await restoreAnvilState();
      spinner.succeed(chalk.green('Anvil state restored from pre-built image.'));
    } catch (err) {
      spinner.fail(chalk.red('Failed to read contract addresses from pre-built image.'));
      throw err;
    }
  } else {
  const useSnapshot = !fresh && hasSnapshot();

  if (useSnapshot) {
    const spinner = ora('Loading Anvil state from snapshot...').start();
    try {
      addresses = await applySnapshot();
      spinner.succeed(chalk.green('Anvil state loaded from snapshot (contracts + funded wallets restored).'));
    } catch (err) {
      spinner.fail(chalk.red('Failed to load snapshot.'));
      throw err;
    }
  } else {
    if (fresh) {
      console.log(chalk.dim('  --fresh: skipping snapshot, deploying from scratch.\n'));
    }

    // 5a. Deploy contracts
    {
      const spinner = ora('Deploying smart contracts...').start();
      try {
        const provider = new ethers.JsonRpcProvider(`http://localhost:${ANVIL_PORT}`);
        addresses = await deployContracts(provider);
        spinner.succeed(chalk.green('Smart contracts deployed.'));
        console.log(chalk.dim('  BZZ Token:      ') + chalk.white(addresses.bzzToken));
        console.log(chalk.dim('  PostageStamp:   ') + chalk.white(addresses.postageStamp));
        console.log(chalk.dim('  PriceOracle:    ') + chalk.white(addresses.priceOracle));
        console.log(chalk.dim('  StakeRegistry:  ') + chalk.white(addresses.stakeRegistry));
        console.log(chalk.dim('  Redistribution: ') + chalk.white(addresses.redistribution));
        console.log(chalk.dim('  SwapFactory:    ') + chalk.white(addresses.swapFactory));
        console.log(chalk.dim('  SwapPriceOracle:') + chalk.white(addresses.swapPriceOracle));
        console.log();
      } catch (err) {
        spinner.fail(chalk.red('Contract deployment failed.'));
        throw err;
      }
    }

    // 5b. Fund Bee wallets
    {
      const spinner = ora('Funding Bee node wallets...').start();
      try {
        const provider = new ethers.JsonRpcProvider(`http://localhost:${ANVIL_PORT}`);
        await fundNodes(provider, addresses.bzzToken);
        spinner.succeed(chalk.green('Bee wallets funded (1 ETH + 100 BZZ each).'));
      } catch (err) {
        spinner.fail(chalk.red('Failed to fund Bee wallets.'));
        throw err;
      }
    }

    // 5c. Save snapshot for future fast starts
    {
      const spinner = ora('Saving Anvil state snapshot...').start();
      try {
        await saveSnapshot(addresses);
        spinner.succeed(chalk.green('Anvil state snapshot saved — future starts will load instantly.'));
      } catch (err) {
        // Non-fatal: snapshot saving is best-effort
        spinner.warn(chalk.yellow(`Snapshot save failed (non-fatal): ${String(err)}`));
      }
    }
  }
  } // end else (not usePrebuilt)

  // 7. Generate keystore files. Skipped in prebuilt mode — the committed images
  // already contain swarm.key / libp2p_v2.key / pss.key for each node.
  const keystoreMap = new Map<number, string | undefined>();
  if (!usePrebuilt) {
    const spinner = ora('Generating keystore files...').start();
    try {
      const results = await generateAllKeystores(BEE_NODES);
      for (const { node, keystoreDir } of results) {
        keystoreMap.set(node.index, keystoreDir);
      }
      spinner.succeed(chalk.green('Keystore files generated.'));
    } catch (err) {
      spinner.fail(chalk.red('Failed to generate keystore files.'));
      throw err;
    }
  }

  // 8. Start queen node (bee-0) — wait for API only, not warmup yet.
  // Warmup requires peer events; the queen has no peers until workers connect.
  const queen = BEE_NODES[0];
  {
    const spinner = ora(`Starting queen node (${queen.name})...`).start();
    try {
      await startBeeNodeWithTag(queen, addresses, keystoreMap.get(0), tag, undefined, blockTime, usePrebuilt ? hubImageName(queen.name, tag) : undefined);
      spinner.text = `Waiting for queen API at port ${queen.apiPort}...`;
      await waitForContainerHttp(queen.name, `http://localhost:${queen.apiPort}/health`, 120_000);
      spinner.succeed(chalk.green(`Queen node API ready on port ${queen.apiPort}.`));
    } catch (err) {
      spinner.fail(chalk.red(`Failed to start queen node.`));
      throw err;
    }
  }

  // 9. Get queen bootnode address
  let queenBootnode: string;
  {
    const spinner = ora('Fetching queen bootnode address...').start();
    try {
      queenBootnode = await getQueenBootnodeAddr(queen.apiPort);
      spinner.succeed(chalk.green(`Queen bootnode: ${queenBootnode}`));
    } catch (err) {
      spinner.fail(chalk.red('Failed to get queen bootnode address.'));
      throw err;
    }
  }

  // 10. Start all worker nodes in parallel and wait for each API to respond.
  const workers = BEE_NODES.slice(1);
  {
    const spinner = ora('Starting worker nodes...').start();
    try {
      await Promise.all(workers.map(async (node) => {
        await startBeeNodeWithTag(node, addresses, keystoreMap.get(node.index), tag, queenBootnode, blockTime, usePrebuilt ? hubImageName(node.name, tag) : undefined);
        await waitForContainerHttp(node.name, `http://localhost:${node.apiPort}/health`, 120_000);
        spinner.info(chalk.green(`${node.name} API ready on port ${node.apiPort}.`));
        spinner.start('Starting worker nodes...');
      }));
      spinner.succeed(chalk.green('All worker nodes ready.'));
    } catch (err) {
      spinner.fail(chalk.red('A worker node failed to start.'));
      throw err;
    }
  }

  // 11. Wait for all nodes to finish warming up now that workers are peered with the queen.
  // The stabilization detector needs at least one peer event to start its timer; that only
  // happens after workers connect, so we defer this check until all containers are up.
  {
    const spinner = ora('Waiting for all nodes to finish warming up...').start();
    try {
      await Promise.all(
        BEE_NODES.map((node) => waitForBeeReady(node.name, node.apiPort, 120_000))
      );
      spinner.succeed(chalk.green('All nodes warmed up.'));
    } catch (err) {
      spinner.fail(chalk.red('A node failed to finish warming up.'));
      throw err;
    }
  }

  // 12. Ensure reserve sampler is ready
  if (usePrebuilt) {
    // Bee's /status reports isWarmingUp=false instantly when restarted from a
    // committed image (the flag was already false at commit time), so explicit
    // peer-connectivity polling is needed before chain advance + rchash work.
    {
      const spinner = ora('Waiting for Bee nodes to reconnect to peers...').start();
      try {
        await Promise.all(
          BEE_NODES.slice(1).map((node) => waitForPeers(node.apiPort, 1, 120_000))
        );
        // Queen needs all workers connected to have a usable neighborhood.
        await waitForPeers(BEE_NODES[0].apiPort, BEE_NODES.length - 1, 120_000);
        spinner.succeed(chalk.green('All Bee nodes have reconnected to peers.'));
      } catch (err) {
        spinner.fail(chalk.red('Bee nodes failed to reconnect to peers.'));
        throw err;
      }
    }

    // After state restore, Bee nodes need to complete a full redistribution round
    // to re-establish consensus_time before the reserve sampler becomes usable.
    // Mine well past one round and poll rchash directly — a fixed sleep is too
    // fragile because reserve indexing time varies with CI machine load.
    {
      const spinner = ora('Advancing chain and waiting for reserve sampler...').start();
      try {
        await fetch(`http://localhost:${ANVIL_PORT}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'anvil_mine', params: ['0xa0'], id: 1 }), // 160 blocks > 1 round
        });
        await waitForRchashReady(BEE_NODES[0].apiPort, 180_000);
        spinner.succeed(chalk.green('Reserve sampler ready.'));
      } catch (err) {
        spinner.fail(chalk.red('Reserve sampler did not become ready.'));
        throw err;
      }
    }
  } else {
    // Buy a batch and start uploading until Node 2 has at least 1 cheque
    const spinner = ora(`Ensuring Node 2 has at least 1 claimable cheque...`).start();
    try {
      await generateTraffic();
      spinner.succeed(chalk.green(`Worker Node 2 has at least 1 cheque.`));
    } catch (err) {
      spinner.fail(chalk.red('Failed to generate traffic and cheques.'));
      throw err;
    }

    // Uploaded chunks are rejected as "too new" by the reserve sampler until the next
    // redistribution round's reveal phase sets a later consensus timestamp. Mine past
    // one full round (152 blocks), then wait for Bee nodes to process the new blocks
    // (Bee polls the chain every 5 seconds).
    {
      const spinner = ora('Advancing chain past redistribution round for chunk eligibility...').start();
      try {
        await fetch(`http://localhost:${ANVIL_PORT}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'anvil_mine', params: ['0xa0'], id: 1 }), // 160 blocks > 1 round
        });
        await new Promise((r) => setTimeout(r, 25_000)); // five Bee polling cycles
        spinner.succeed(chalk.green('Chunks eligible for reserve sampling.'));
      } catch (err) {
        spinner.fail(chalk.red('Failed to advance chain.'));
        throw err;
      }
    }
  }

  // 13. Summary table
  printSummary(addresses, tag);
}

function printSummary(addresses: ContractAddresses, tag: string): void {
  console.log('\n' + chalk.bold.cyan('════════════════════════════════════════'));
  console.log(chalk.bold.cyan('  bee-factory Stack is Running'));
  console.log(chalk.bold.cyan('════════════════════════════════════════'));
  console.log();

  console.log(chalk.bold('Bee Nodes:'));
  console.log(chalk.dim('  Image: ') + chalk.white(`${BEE_LOCAL_IMAGE}:${tag}`));
  console.log();

  const rows = [
    ['Node', 'API Port', 'P2P Port'],
    ['────────────────', '────────', '────────'],
    ...BEE_NODES.map((n) => [
      n.name,
      String(n.apiPort),
      String(n.p2pPort),
    ]),
  ];

  for (const row of rows) {
    console.log(
      '  ' +
      chalk.yellow(row[0].padEnd(20)) +
      chalk.white(row[1].padEnd(12)) +
      chalk.white(row[2])
    );
  }

  console.log();
  console.log(chalk.bold('Anvil RPC:') + '  ' + chalk.white(`http://localhost:8545`));
  console.log(chalk.bold('Chain ID: ') + '  ' + chalk.white('1337'));
  console.log();
  console.log(chalk.bold('Smart Contracts:'));
  console.log('  ' + chalk.dim('BZZ Token:       ') + chalk.white(addresses.bzzToken));
  console.log('  ' + chalk.dim('PostageStamp:    ') + chalk.white(addresses.postageStamp));
  console.log('  ' + chalk.dim('PriceOracle:     ') + chalk.white(addresses.priceOracle));
  console.log('  ' + chalk.dim('StakeRegistry:   ') + chalk.white(addresses.stakeRegistry));
  console.log('  ' + chalk.dim('Redistribution:  ') + chalk.white(addresses.redistribution));
  console.log('  ' + chalk.dim('SwapFactory:     ') + chalk.white(addresses.swapFactory));
  console.log('  ' + chalk.dim('SwapPriceOracle: ') + chalk.white(addresses.swapPriceOracle));
  console.log();
  console.log(chalk.bold('Node Wallets:'));
  console.log(chalk.dim('  (Foundry test keys — never use in production)'));
  console.log();

  for (const node of BEE_NODES) {
    const address = new ethers.Wallet(node.privateKey).address;
    const role = node.index === 0 ? 'queen' : `worker ${node.index}`;
    console.log('  ' + chalk.yellow(`${node.name}`) + chalk.dim(` (${role})`));
    console.log('    ' + chalk.dim('Address:     ') + chalk.white(address));
    console.log('    ' + chalk.dim('Private Key: ') + chalk.dim(node.privateKey));
    console.log();
  }

  console.log();
  console.log(chalk.dim('Run ') + chalk.bold('bee-factory stop') + chalk.dim(' to tear everything down.'));
  console.log();
}
