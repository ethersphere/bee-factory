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

const DEFAULT_REPO = 'ghcr.io/ethersphere/bee-factory'

export class Start extends RootCommand implements LeafCommand {
  public readonly name = 'start'

  public readonly description = 'Spin up the Bee Factory cluster'

  @Option({
    key: 'fresh',
    alias: 'f',
    type: 'boolean',
    description: 'The cluster data will be purged before start',
    envKey: 'FACTORY_FRESH',
    default: false,
  })
  public fresh!: boolean

  @Option({
    key: 'detach',
    alias: 'd',
    type: 'boolean',
    description: 'Spin up the cluster and exit. No logging is outputted.',
    envKey: 'FACTORY_DETACH',
    default: false,
  })
  public detach!: boolean

  @Option({
    key: 'repo',
    type: 'string',
    description: 'Docker repo',
    envKey: 'FACTORY_DOCKER_REPO',
    default: DEFAULT_REPO,
  })
  public repo!: string

  @Option({
    key: 'image-prefix',
    type: 'string',
    description: 'Docker image name prefix',
    envKey: 'FACTORY_IMAGE_PREFIX',
    default: DEFAULT_IMAGE_PREFIX,
  })
  public imagePrefix!: string

  @Option({
    key: 'env-prefix',
    type: 'string',
    description: "Docker container's names prefix",
    envKey: 'FACTORY_ENV_PREFIX',
    default: DEFAULT_ENV_PREFIX,
  })
  public envPrefix!: string

  @Argument({ key: 'blockchain-version', description: 'Blockchain image version', required: true })
  public blockchainVersion!: string

  @Argument({ key: 'bee-version', description: 'Bee image version', required: true })
  public beeVersion!: string

  public async run(): Promise<void> {
    await super.init()

    const dockerOptions = await this.buildDockerOptions()
    const docker = new Docker(this.console, this.envPrefix, this.imagePrefix)
    const status = await docker.getAllStatus()

    if (Object.values(status).every(st => st === 'running')) {
      this.console.log('All containers are up and running')

      if (this.detach) {
        process.exit(0)
      }

      await docker.attachQueenLogging(process.stdout)
    }

    let queenAddress: string

    process.once('SIGINT', async () => {
      try {
        await docker.stopAll(false)
      } catch (e) {
        this.console.error(`Error: ${e}`)
      }
    })

    const networkSpinner = ora({
      text: 'Spawning network...',
      spinner: 'point',
      color: 'yellow',
      isEnabled: this.verbosity !== VerbosityLevel.Quiet,
    }).start()

    try {
      await docker.createNetwork()
      networkSpinner.succeed('Network is up')
    } catch (e) {
      networkSpinner.fail(`It was not possible to spawn network!`)
      this.console.error(`Error: ${e}`)
      process.exit(1)
    }

    const blockchainSpinner = ora({
      text: 'Starting blockchain node...',
      spinner: 'point',
      color: 'yellow',
      isEnabled: this.verbosity !== VerbosityLevel.Quiet,
    }).start()

    try {
      await docker.startBlockchainNode(this.blockchainVersion, this.beeVersion, dockerOptions)
      blockchainSpinner.text = 'Waiting until blockchain is ready...'
      await waitForBlockchain()
      blockchainSpinner.succeed('Blockchain node is up and listening')
    } catch (e) {
      blockchainSpinner.fail(`It was not possible to start blockchain node!`)
      this.console.error(`Error: ${e}`)
      await this.stopDocker(docker)
      process.exit(1)
    }

    const queenSpinner = ora({
      text: 'Starting queen Bee node...',
      spinner: 'point',
      color: 'yellow',
      isEnabled: this.verbosity !== VerbosityLevel.Quiet,
    }).start()

    try {
      await docker.startQueenNode(this.beeVersion, dockerOptions)
      queenSpinner.text = 'Waiting until queen node is ready...'
      queenAddress = await waitForQueen(
        async () => (await docker.getStatusForContainer(ContainerType.QUEEN)) === 'running',
      )
      queenSpinner.succeed('Queen node is up and listening')
    } catch (e) {
      queenSpinner.fail(`It was not possible to start queen node!`)
      this.console.error(`Error: ${e}`)
      await this.stopDocker(docker)
      process.exit(1)
    }

    const workerSpinner = ora({
      text: 'Starting worker Bee nodes...',
      spinner: 'point',
      color: 'yellow',
      isEnabled: this.verbosity !== VerbosityLevel.Quiet,
    }).start()

    try {
      for (let i = 1; i <= WORKER_COUNT; i++) {
        await docker.startWorkerNode(this.beeVersion, i, queenAddress, dockerOptions)
      }

      workerSpinner.text = 'Waiting until all workers connect to queen...'
      await waitForWorkers(async () => Object.values(await docker.getAllStatus()).every(node => node === 'running'))
      workerSpinner.succeed('Worker nodes are up and listening')
    } catch (e) {
      workerSpinner.fail(`It was not possible to start worker nodes!`)
      this.console.error(`Error: ${e}`)
      await this.stopDocker(docker)
      process.exit(1)
    }

    if (!this.detach) {
      await docker.attachQueenLogging(process.stdout)

      // This prevents the program from exiting
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      // setInterval(() => {}, 1000)
    }
  }

  private async stopDocker(docker: Docker) {
    const dockerSpinner = ora({
      text: 'Stopping all containers...',
      spinner: 'point',
      color: 'red',
      isEnabled: this.verbosity !== VerbosityLevel.Quiet,
    }).start()

    await docker.stopAll(false)

    dockerSpinner.stop()
  }

  private async buildDockerOptions(): Promise<RunOptions> {
    return {
      repo: this.repo,
      fresh: this.fresh,
    }
  }
}
