import { IOption } from 'furious-commander'
import PackageJson from '../package.json'
import { Start } from './command/start'
import { Stop } from './command/stop'
import { Logs } from './command/logs'

export const quiet: IOption<boolean> = {
  key: 'quiet',
  alias: 'q',
  description: 'Does not print anything',
  type: 'boolean',
  default: false,
  conflicts: 'verbose',
}

export const verbose: IOption<boolean> = {
  key: 'verbose',
  alias: 'v',
  description: 'Display logs',
  type: 'boolean',
  default: false,
  conflicts: 'quiet',
}

export const help: IOption<boolean> = {
  key: 'help',
  alias: 'h',
  description: 'Print context specific help and exit',
  type: 'boolean',
  default: false,
}

export const version: IOption<boolean> = {
  key: 'version',
  alias: 'V',
  description: 'Print version and exit',
  type: 'boolean',
  default: false,
  handler: () => {
    process.stdout.write(PackageJson.version + '\n')
  },
}

export const optionParameters: IOption<unknown>[] = [quiet, verbose, help, version]

export const rootCommandClasses = [Start, Stop, Logs]
