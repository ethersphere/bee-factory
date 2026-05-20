import chalk from 'chalk';
import ora from 'ora';
import { ethers } from 'ethers';

import {
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
  getQueenBootnodeAddr,
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

  // 2. Pull Anvil image
  {
    const spinner = ora(`Pulling ${ANVIL_IMAGE}...`).start();
    try {
      await pullImageIfNeeded(ANVIL_IMAGE);
      spinner.succeed(chalk.green(`Image ready: ${ANVIL_IMAGE}`));
    } catch (err) {
      spinner.fail(chalk.red(`Failed to pull ${ANVIL_IMAGE}`));
      throw err;
    }
  }

  // 3. Ensure Bee image — build from source if not present locally.
  //    REACHABILITY_OVERRIDE_PUBLIC is a compile-time flag, so we must build
  //    our own image rather than pulling the official ethersphere/bee image.
  {
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
      await startAnvil(blockTime);
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

  // 7. Generate keystore files
  let keystoreMap: Map<number, string>;
  {
    const spinner = ora('Generating keystore files...').start();
    try {
      const results = await generateAllKeystores(BEE_NODES);
      keystoreMap = new Map(results.map(({ node, keystoreDir }) => [node.index, keystoreDir]));
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
      await startBeeNodeWithTag(queen, addresses, keystoreMap.get(0)!, tag, undefined, blockTime);
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
        await startBeeNodeWithTag(node, addresses, keystoreMap.get(node.index)!, tag, queenBootnode, blockTime);
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

  // 12. Buy a batch and start uploading until the Node 2 has at least 1 cheque
  {
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
  console.log(chalk.dim('Run ') + chalk.bold('bee-factory stop') + chalk.dim(' to tear everything down.'));
  console.log();
}
