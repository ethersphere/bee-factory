#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { DEFAULT_BLOCK_TIME_IN_SECONDS } from './config';
import { start } from './commands/start';
import { stop } from './commands/stop';
import chalk from 'chalk';

yargs(hideBin(process.argv))
  .command(
    'start',
    'Start the local Bee stack',
    (y) =>
      y
        .option('tag', {
          type: 'string',
          default: 'master',
          description: 'Bee git ref to build from (branch, tag, or commit — e.g. v2.5.0)',
        })
        .option('fresh', {
          type: 'boolean',
          default: false,
          description: 'Ignore bundled snapshot and redeploy contracts from scratch (also saves a new snapshot)',
        })
        .option('block-time', {
          type: 'number',
          default: DEFAULT_BLOCK_TIME_IN_SECONDS,
          description: 'Block time in seconds for the local blockchain (Anvil).',
        })
        .option('cheques', {
          type: 'boolean',
          default: false,
          description: 'After starting, the first node buys a postage batch, deposits BZZ to its checkbook and starts to upload random data until the second node has at least 1 cheque.',
        }),
    async (argv) => {
      try {
        await start({ tag: argv.tag as string, fresh: argv.fresh as boolean, blockTime: argv.blockTime as number, cheques: argv.cheques as boolean | undefined });
      } catch (err) {
        console.error(chalk.red('\nFatal error:'), String(err));
        process.exit(1);
      }
    }
  )
  .command(
    'stop',
    'Stop the local Bee stack',
    {},
    async () => {
      try {
        await stop();
      } catch (err) {
        console.error(chalk.red('\nFatal error:'), String(err));
        process.exit(1);
      }
    }
  )
  .demandCommand(1, 'Please specify a command: start or stop')
  .strict()
  .help()
  .parse();
