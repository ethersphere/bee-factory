import { Argument, LeafCommand, Option } from 'furious-commander'
import { RootCommand } from './root-command'
import {
  ContainerType,
  DEFAULT_ENV_PREFIX,
  DEFAULT_IMAGE_PREFIX,
  Docker,
  RunOptions,
  WORKER_COUNT,
} from '../utils/docker'
import { waitForBlockchain, waitForQueen, waitForWorkers } from '../utils/wait'
import ora from 'ora'
import { VerbosityLevel } from './root-command/logging'
import { findBeeVersion, stripCommit } from '../utils/config-sources'

const DEFAULT_REPO = 'ethersphere'
const DEFAULT_PASSWORD = 'hello'

export const ENV_ENV_PREFIX_KEY = 'FACTORY_ENV_PREFIX'
const ENV_IMAGE_PREFIX_KEY = 'FACTORY_IMAGE_PREFIX'
const ENV_REPO_KEY = 'FACTORY_DOCKER_REPO'
const ENV_RESTRICTED_KEY = 'FACTORY_RESTRICTED'
const ENV_RESTRICTED_PASSWORD_KEY = 'FACTORY_RESTRICTED_PASSWORD'
const ENV_DETACH_KEY = 'FACTORY_DETACH'
const ENV_WORKERS_KEY = 'FACTORY_WORKERS'
const ENV_FRESH_KEY = 'FACTORY_FRESH'

export class Start extends RootCommand implements LeafCommand {
  public readonly name = 'start'

  public readonly description = 'Spin up the Bee Factory cluster'

  @Option({
    key: 'fresh',
    alias: 'f',
    type: 'boolean',
    description: 'The cluster data will be purged before start',
    envKey: ENV_FRESH_KEY,
    default: false,
  })
  public fresh!: boolean

  @Option({
    key: 'detach',
    alias: 'd',
    type: 'boolean',
    description: 'Spin up the cluster and exit. No logging is outputted.',
    envKey: ENV_DETACH_KEY,
    default: false,
  })
  public detach!: boolean

  @Option({
    key: 'workers',
    alias: 'w',
    type: 'number',
    description: `Number of workers to spin. Value between 0 and ${WORKER_COUNT} including.`,
    envKey: ENV_WORKERS_KEY,
    default: WORKER_COUNT,
  })
  public workers!: number

  @Option({
    key: 'repo',
    type: 'string',
    description: 'Docker repo',
    envKey: ENV_REPO_KEY,
    default: DEFAULT_REPO,
  })
  public repo!: string

  @Option({
    key: 'restricted',
    type: 'boolean',
    description: 'Enable Restricted mode for Queen node',
    envKey: ENV_RESTRICTED_KEY,
  })
  public restricted!: boolean

  @Option({
    key: 'restricted-password',
    type: 'string',
    description: 'Password for the administrator account in plain text.',
    envKey: ENV_RESTRICTED_PASSWORD_KEY,
    default: DEFAULT_PASSWORD,
  })
  public restrictedPassword!: string

  @Option({
    key: 'image-prefix',
    type: 'string',
    description: 'Docker image name prefix',
    envKey: ENV_IMAGE_PREFIX_KEY,
    default: DEFAULT_IMAGE_PREFIX,
  })
  public imagePrefix!: string

  @Option({
    key: 'env-prefix',
    type: 'string',
    description: "Docker container's names prefix",
    envKey: ENV_ENV_PREFIX_KEY,
    default: DEFAULT_ENV_PREFIX,
  })
  public envPrefix!: string

  @Argument({ key: 'bee-version', description: 'Bee image version', required: false })
  public beeVersion!: string

  public async run(): Promise<void> {
    await super.init()

    if (this.workers < 0 || this.workers > WORKER_COUNT) {
      throw new Error(`Worker count has to be between 0 and ${WORKER_COUNT} including.`)
    }

    if (!this.beeVersion) {
      this.beeVersion = await findBeeVersion()
      this.console.log('Bee version not specified. Found it configured externally.')
      this.console.log(`Spinning up cluster with Bee version ${this.beeVersion}.`)
    }

    this.beeVersion = stripCommit(this.beeVersion)

    const dockerOptions = await this.buildDockerOptions()
    const docker = new Docker(this.console, this.envPrefix, this.imagePrefix, this.repo)
    const status = await docker.getAllStatus()

    if (Object.values(status).every(st => st === 'running')) {
      this.console.log('All containers are up and running')

      if (this.detach) {
        return
      }

      await docker.logs(ContainerType.QUEEN, process.stdout)
    }

    let queenAddress: string

    process.on('SIGINT', async () => {
      try {
        await docker.stopAll(false)
      } catch (e) {
        this.console.error(`Error: ${e}`)
      }

      process.exit()
    })

    const networkSpinner = ora({
      text: 'Spawning network...',
      spinner: 'point',
      color: 'yellow',
      isSilent: this.verbosity === VerbosityLevel.Quiet,
    }).start()

    try {
      await docker.createNetwork()
      networkSpinner.succeed('Network is up')
    } catch (e) {
      networkSpinner.fail(`It was not possible to spawn network!`)
      throw e
    }

    const blockchainSpinner = ora({
      text: 'Getting blockchain image version...',
      spinner: 'point',
      color: 'yellow',
      isSilent: this.verbosity === VerbosityLevel.Quiet,
    }).start()

    try {
      const blockchainVersion = await docker.getBlockchainVersionFromQueenMetadata(this.beeVersion)

      blockchainSpinner.text = 'Starting blockchain node...'
      await docker.startBlockchainNode(blockchainVersion, dockerOptions)
      blockchainSpinner.text = 'Waiting until blockchain is ready...'
      await waitForBlockchain()
      blockchainSpinner.succeed('Blockchain node is up and listening')
    } catch (e) {
      blockchainSpinner.fail(`It was not possible to start blockchain node!`)
      await this.stopDocker(docker)
      throw e
    }

    const queenSpinner = ora({
      text: 'Starting queen Bee node...',
      spinner: 'point',
      color: 'yellow',
      isSilent: this.verbosity === VerbosityLevel.Quiet,
    }).start()

    try {
      await docker.startQueenNode(this.beeVersion, {
        restricted: this.restricted,
        restrictedPassword: this.restrictedPassword,
        ...dockerOptions,
      })

      queenSpinner.text = 'Waiting until queen node is ready...'
      queenAddress = await waitForQueen(
        async () => (await docker.getStatusForContainer(ContainerType.QUEEN)) === 'running',
      )
      queenSpinner.succeed('Queen node is up and listening')
    } catch (e) {
      queenSpinner.fail(`It was not possible to start queen node!`)
      await this.stopDocker(docker)
      throw e
    }

    if (this.workers > 0) {
      const workerSpinner = ora({
        text: 'Starting worker Bee nodes...',
        spinner: 'point',
        color: 'yellow',
        isSilent: this.verbosity === VerbosityLevel.Quiet,
      }).start()

      try {
        for (let i = 1; i <= this.workers; i++) {
          await docker.startWorkerNode(this.beeVersion, i, queenAddress, dockerOptions)
        }

        workerSpinner.text = 'Waiting until all workers connect to queen...'
        await waitForWorkers(this.workers, docker.getAllStatus.bind(docker))
        workerSpinner.succeed('Worker nodes are up and listening')
      } catch (e) {
        workerSpinner.fail(`It was not possible to start worker nodes!`)
        await this.stopDocker(docker)
        throw e
      }
    }

    if (!this.detach) {
      await docker.logs(ContainerType.QUEEN, process.stdout, true)
    }
  }

  private async stopDocker(docker: Docker) {
    const dockerSpinner = ora({
      text: 'Stopping all containers...',
      spinner: 'point',
      color: 'red',
      isSilent: this.verbosity === VerbosityLevel.Quiet,
    }).start()

    await docker.stopAll(false)

    dockerSpinner.stop()
  }

  private async buildDockerOptions(): Promise<RunOptions> {
    return {
      fresh: this.fresh,
    }
  }
}
