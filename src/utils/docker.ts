import Dockerode, { Container, ContainerCreateOptions } from 'dockerode'
import { Logging } from '../command/root-command/logging'
import { ContainerImageConflictError } from './error'

export const DEFAULT_ENV_PREFIX = 'bee-factory'
export const DEFAULT_IMAGE_PREFIX = 'bee-factory'

const BLOCKCHAIN_IMAGE_NAME_SUFFIX = '-blockchain'
const QUEEN_IMAGE_NAME_SUFFIX = '-queen'
const WORKER_IMAGE_NAME_SUFFIX = '-worker'
const NETWORK_NAME_SUFFIX = '-network'

export const WORKER_COUNT = 4
export const BLOCKCHAIN_VERSION_LABEL_KEY = 'org.ethswarm.beefactory.blockchain-version'
export const CONTRACT_LABEL_KEY_PREFIX = 'org.ethswarm.beefactory.contracts.'

export interface RunOptions {
  fresh: boolean
}

export enum ContainerType {
  QUEEN = 'queen',
  BLOCKCHAIN = 'blockchain',
  WORKER_1 = 'worker1',
  WORKER_2 = 'worker2',
  WORKER_3 = 'worker3',
  WORKER_4 = 'worker4',
}

export type Status = 'running' | 'exists' | 'not-found'
type FindResult = { container?: Container; image?: string }

export interface AllStatus {
  blockchain: Status
  queen: Status
  worker1: Status
  worker2: Status
  worker3: Status
  worker4: Status
}

export interface DockerError extends Error {
  reason: string
  statusCode: number
}

export class Docker {
  private docker: Dockerode
  private console: Logging
  private runningContainers: Container[]
  private envPrefix: string
  private imagePrefix: string
  private repo?: string

  private get networkName() {
    return `${this.envPrefix}${NETWORK_NAME_SUFFIX}`
  }

  private get blockchainName() {
    return `${this.envPrefix}${BLOCKCHAIN_IMAGE_NAME_SUFFIX}`
  }
  private blockchainImage(blockchainVersion: string) {
    if (!this.repo) throw new TypeError('Repo has to be defined!')

    return `${this.repo}/${this.imagePrefix}${BLOCKCHAIN_IMAGE_NAME_SUFFIX}:${blockchainVersion}`
  }

  private get queenName() {
    return `${this.envPrefix}${QUEEN_IMAGE_NAME_SUFFIX}`
  }

  private queenImage(beeVersion: string) {
    if (!this.repo) throw new TypeError('Repo has to be defined!')

    return `${this.repo}/${this.imagePrefix}${QUEEN_IMAGE_NAME_SUFFIX}:${beeVersion}`
  }

  private workerName(index: number) {
    return `${this.envPrefix}${WORKER_IMAGE_NAME_SUFFIX}-${index}`
  }

  private workerImage(beeVersion: string, workerNumber: number) {
    if (!this.repo) throw new TypeError('Repo has to be defined!')

    return `${this.repo}/${this.imagePrefix}${WORKER_IMAGE_NAME_SUFFIX}-${workerNumber}:${beeVersion}`
  }

  constructor(console: Logging, envPrefix: string, imagePrefix: string, repo?: string) {
    this.docker = new Dockerode()
    this.console = console
    this.runningContainers = []
    this.envPrefix = envPrefix
    this.imagePrefix = imagePrefix
    this.repo = repo
  }

  public async createNetwork(): Promise<void> {
    const networks = await this.docker.listNetworks({ filters: { name: [this.networkName] } })

    if (networks.length === 0) {
      await this.docker.createNetwork({ Name: this.networkName })
    }
  }

  public async startBlockchainNode(blockchainVersion: string, options: RunOptions): Promise<void> {
    if (options.fresh) await this.removeContainer(this.blockchainName)
    await this.pullImageIfNotFound(this.blockchainImage(blockchainVersion))

    const container = await this.findOrCreateContainer(this.blockchainName, {
      Image: this.blockchainImage(blockchainVersion),
      name: this.blockchainName,
      ExposedPorts: {
        '9545/tcp': {},
      },
      AttachStderr: false,
      AttachStdout: false,
      HostConfig: {
        PortBindings: { '9545/tcp': [{ HostPort: '9545' }] },
        NetworkMode: this.networkName,
      },
    })

    this.runningContainers.push(container)
    const state = await container.inspect()

    // If it is already running (because of whatever reason) we are not spawning new node
    if (!state.State.Running) {
      await container.start()
    } else {
      this.console.info('The blockchain container was already running, so not starting it again.')
    }
  }

  public async startQueenNode(beeVersion: string, options: RunOptions): Promise<void> {
    if (options.fresh) await this.removeContainer(this.queenName)
    await this.pullImageIfNotFound(this.queenImage(beeVersion))

    const contractAddresses = await this.getContractAddresses(this.queenImage(beeVersion))
    const container = await this.findOrCreateContainer(this.queenName, {
      Image: this.queenImage(beeVersion),
      name: this.queenName,
      ExposedPorts: {
        '1633/tcp': {},
        '1634/tcp': {},
        '1635/tcp': {},
      },
      Tty: true,
      Cmd: ['start'],
      Env: this.createBeeEnvParameters(contractAddresses),
      AttachStderr: false,
      AttachStdout: false,
      HostConfig: {
        NetworkMode: this.networkName,
        PortBindings: {
          '1633/tcp': [{ HostPort: '1633' }],
          '1634/tcp': [{ HostPort: '1634' }],
          '1635/tcp': [{ HostPort: '1635' }],
        },
      },
    })

    this.runningContainers.push(container)
    const state = await container.inspect()

    // If it is already running (because of whatever reason) we are not spawning new node.
    // Already in `findOrCreateContainer` the container is verified that it was spawned with expected version.
    if (!state.State.Running) {
      await container.start()
    } else {
      this.console.info('The Queen node container was already running, so not starting it again.')
    }
  }

  public async startWorkerNode(
    beeVersion: string,
    workerNumber: number,
    queenAddress: string,
    options: RunOptions,
  ): Promise<void> {
    if (options.fresh) await this.removeContainer(this.workerName(workerNumber))
    await this.pullImageIfNotFound(this.workerImage(beeVersion, workerNumber))

    const contractAddresses = await this.getContractAddresses(this.workerImage(beeVersion, workerNumber))
    const container = await this.findOrCreateContainer(this.workerName(workerNumber), {
      Image: this.workerImage(beeVersion, workerNumber),
      name: this.workerName(workerNumber),
      ExposedPorts: {
        '1633/tcp': {},
        '1634/tcp': {},
        '1635/tcp': {},
      },
      Cmd: ['start'],
      Env: this.createBeeEnvParameters(contractAddresses, queenAddress),
      AttachStderr: false,
      AttachStdout: false,
      HostConfig: {
        NetworkMode: this.networkName,
        PortBindings: {
          '1633/tcp': [{ HostPort: (1633 + workerNumber * 10000).toString() }],
          '1634/tcp': [{ HostPort: (1634 + workerNumber * 10000).toString() }],
          '1635/tcp': [{ HostPort: (1635 + workerNumber * 10000).toString() }],
        },
      },
    })

    this.runningContainers.push(container)
    const state = await container.inspect()

    // If it is already running (because of whatever reason) we are not spawning new node
    if (!state.State.Running) {
      await container.start()
    } else {
      this.console.info('The Queen node container was already running, so not starting it again.')
    }
  }

  public async logs(
    target: ContainerType,
    outputStream: NodeJS.WriteStream,
    follow = false,
    tail?: number,
  ): Promise<void> {
    const { container } = await this.findContainer(this.getContainerName(target))

    if (!container) {
      throw new Error('Queen container does not exists, even though it should have had!')
    }

    const logs = await container.logs({ stdout: true, stderr: true, follow, tail })

    if (!follow) {
      outputStream.write(logs as unknown as Buffer)
    } else {
      logs.pipe(outputStream)
    }
  }

  public async stopAll(allWithPrefix = false, deleteContainers = false): Promise<void> {
    const containerProcessor = async (container: Container) => {
      try {
        await container.stop()
      } catch (e) {
        // We ignore 304 that represents that the container is already stopped
        if ((e as DockerError).statusCode !== 304) {
          throw e
        }
      }

      if (deleteContainers) {
        await container.remove()
      }
    }

    this.console.info('Stopping all containers')
    await Promise.all(this.runningContainers.map(containerProcessor))

    if (allWithPrefix) {
      const containers = await this.docker.listContainers({ all: true })
      await Promise.all(
        containers
          .filter(container => container.Names.filter(n => n.startsWith('/' + this.envPrefix)).length >= 1)
          .map(container => this.docker.getContainer(container.Id))
          .map(containerProcessor),
      )
    }
  }

  public async getBlockchainVersionFromQueenMetadata(beeVersion: string): Promise<string> {
    // Lets pull the Queen's image if it is not present
    await this.pullImageIfNotFound(this.queenImage(beeVersion))

    const queenMetadata = await this.docker.getImage(this.queenImage(beeVersion)).inspect()

    const version = queenMetadata.Config.Labels[BLOCKCHAIN_VERSION_LABEL_KEY]

    if (!version) {
      throw new Error('Blockchain image version was not found in Queen image labels!')
    }

    return version
  }

  public async getAllStatus(): Promise<AllStatus> {
    return {
      queen: await this.getStatusForContainer(ContainerType.QUEEN),
      blockchain: await this.getStatusForContainer(ContainerType.BLOCKCHAIN),
      worker1: await this.getStatusForContainer(ContainerType.WORKER_1),
      worker2: await this.getStatusForContainer(ContainerType.WORKER_2),
      worker3: await this.getStatusForContainer(ContainerType.WORKER_3),
      worker4: await this.getStatusForContainer(ContainerType.WORKER_4),
    }
  }

  private async removeContainer(name: string): Promise<void> {
    this.console.info(`Removing container with name "${name}"`)
    const { container } = await this.findContainer(name)

    // Container does not exist so nothing to delete
    if (!container) {
      return
    }

    await container.remove({ v: true, force: true })
  }

  private async findOrCreateContainer(name: string, createOptions: ContainerCreateOptions): Promise<Container> {
    const { container, image: foundImage } = await this.findContainer(name)

    if (container) {
      this.console.info(`Container with name "${name}" found. Using it.`)

      if (foundImage !== createOptions.Image) {
        throw new ContainerImageConflictError(
          `Container with name "${name}" found but it was created with different image or image version then expected!`,
          foundImage!,
          createOptions.Image!,
        )
      }

      return container
    }

    this.console.info(`Container with name "${name}" not found. Creating new one.`)

    try {
      return await this.docker.createContainer(createOptions)
    } catch (e) {
      // 404 is Image Not Found ==> pull the image
      if ((e as DockerError).statusCode !== 404) {
        throw e
      }

      this.console.info(`Image ${createOptions.Image} not found. Pulling it.`)
      await this.pullImageIfNotFound(createOptions.Image!)

      return await this.docker.createContainer(createOptions)
    }
  }

  private async findContainer(name: string): Promise<FindResult> {
    const containers = await this.docker.listContainers({ all: true, filters: { name: [name] } })

    if (containers.length === 0) {
      return {}
    }

    if (containers.length > 1) {
      throw new Error(`Found ${containers.length} containers for name "${name}". Expected only one.`)
    }

    return { container: this.docker.getContainer(containers[0].Id), image: containers[0].Image }
  }

  public async getStatusForContainer(name: ContainerType): Promise<Status> {
    const foundContainer = await this.findContainer(this.getContainerName(name))

    if (!foundContainer.container) {
      return 'not-found'
    }

    const inspectStatus = await foundContainer.container.inspect()

    if (inspectStatus.State.Running) {
      return 'running'
    }

    return 'exists'
  }

  private getContainerName(name: ContainerType) {
    switch (name) {
      case ContainerType.BLOCKCHAIN:
        return this.blockchainName
      case ContainerType.QUEEN:
        return this.queenName
      case ContainerType.WORKER_1:
        return this.workerName(1)
      case ContainerType.WORKER_2:
        return this.workerName(2)
      case ContainerType.WORKER_3:
        return this.workerName(3)
      case ContainerType.WORKER_4:
        return this.workerName(4)
      default:
        throw new Error('Unknown container!')
    }
  }

  private createBeeEnvParameters(contractAddresses: Record<string, string>, bootnode?: string): string[] {
    const options: Record<string, string> = {
      'warmup-time': '0',
      'debug-api-enable': 'true',
      verbosity: '4',
      'swap-enable': 'true',
      mainnet: 'false',
      'swap-endpoint': `http://${this.blockchainName}:9545`,
      password: 'password',
      'network-id': '4020',
      'full-node': 'true',
      'welcome-message': 'You have found the queen of the beehive...',
      'cors-allowed-origins': '*',
      'postage-stamp-start-block': '1',
      ...contractAddresses,
    }

    if (bootnode) {
      options.bootnode = bootnode
    }

    // Env variables for Bee has form of `BEE_WARMUP_TIME`, so we need to transform it.
    return Object.entries(options).reduce<string[]>((previous, current) => {
      const keyName = `BEE_${current[0].toUpperCase().replace(/-/g, '_')}`
      previous.push(`${keyName}=${current[1]}`)

      return previous
    }, [])
  }

  private async pullImageIfNotFound(name: string): Promise<void> {
    try {
      await this.docker.getImage(name).inspect()
    } catch (e) {
      this.console.info(`Image ${name} not found locally, pulling it.`)
      const pullStream = await this.docker.pull(name)

      await new Promise(res => this.docker.modem.followProgress(pullStream, res))
    }
  }

  private async getContractAddresses(imageName: string): Promise<Record<string, string>> {
    const imageMetadata = await this.docker.getImage(imageName).inspect()

    const contractAddresses: Record<string, string> = {}

    // @ts-ignore: Dockerode typings does not have iterator even though it is a simple object
    for (const [labelKey, labelValue] of Object.entries(imageMetadata.Config.Labels)) {
      if (labelKey.startsWith(CONTRACT_LABEL_KEY_PREFIX)) {
        contractAddresses[labelKey.replace(CONTRACT_LABEL_KEY_PREFIX, '')] = labelValue
      }
    }

    return contractAddresses
  }
}
