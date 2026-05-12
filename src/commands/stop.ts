import chalk from 'chalk';
import ora from 'ora';
import { cleanupAll } from '../docker/manager';

export async function stop(): Promise<void> {
  const spinner = ora('Stopping bee-factory stack...').start();

  try {
    await cleanupAll();
    spinner.succeed(chalk.green('bee-factory stack stopped and cleaned up.'));
  } catch (err) {
    spinner.fail(chalk.red('Failed to stop bee-factory stack.'));
    console.error(chalk.red(String(err)));
    process.exit(1);
  }
}
