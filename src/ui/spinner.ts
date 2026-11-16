import chalk from 'chalk';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const FRAME_INTERVAL_MS = 80;
const CLEAR_LINE = '\r\x1b[2K';

export class Spinner {
  private timer?: ReturnType<typeof setInterval>;
  private frame = 0;

  constructor(public text: string) {}

  start(text = this.text): this {
    this.text = text;

    if (!process.stderr.isTTY) {
      process.stderr.write(`- ${text}\n`);
      return this;
    }
    this.timer ??= setInterval(() => this.render(), FRAME_INTERVAL_MS);
    this.render();

    return this;
  }

  succeed(text = this.text): void {
    this.stopWith(chalk.green('✔'), text);
  }

  fail(text = this.text): void {
    this.stopWith(chalk.red('✖'), text);
  }

  warn(text = this.text): void {
    this.stopWith(chalk.yellow('⚠'), text);
  }

  info(text = this.text): void {
    this.stopWith(chalk.blue('ℹ'), text);
  }

  private render(): void {
    const frame = FRAMES[this.frame++ % FRAMES.length];
    process.stderr.write(`${CLEAR_LINE}${chalk.cyan(frame)} ${this.text}`);
  }

  private stopWith(symbol: string, text: string): void {
    clearInterval(this.timer);
    this.timer = undefined;
    const prefix = process.stderr.isTTY ? CLEAR_LINE : '';
    process.stderr.write(`${prefix}${symbol} ${text}\n`);
  }
}

export function createSpinner(text: string): Spinner {
  return new Spinner(text);
}
