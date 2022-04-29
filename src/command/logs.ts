import { Argument, LeafCommand, Option } from 'furious-commander'
import { RootCommand } from './root-command'
import { ContainerType, DEFAULT_ENV_PREFIX, DEFAULT_IMAGE_PREFIX, Docker } from '../utils/docker'

export class Logs extends RootCommand implements LeafCommand {
  public readonly name = 'logs'

  public readonly description = `Prints logs for given container. Valid container's names are: ${Object.values(
    ContainerType,
  ).join(', ')}`

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

  @Option({
    key: 'follow',
    alias: 'f',
    type: 'boolean',
    description: 'Stays attached to the container and output any new logs.',
    default: false,
  })
  public follow!: boolean

  @Option({
    key: 'tail',
    alias: 't',
    type: 'number',
    description: 'Prints specified number of last log lines.',
  })
  public tail!: number

  @Argument({ key: 'container', description: 'Container name as described above', required: true })
  public container!: ContainerType

  public async run(): Promise<void> {
    await super.init()

    if (!Object.values(ContainerType).includes(this.container)) {
      throw new Error(`Passed container name is not valid! Valid values: ${Object.values(ContainerType).join(', ')}`)
    }

    const docker = new Docker(this.console, this.envPrefix, this.imagePrefix)
    await docker.logs(this.container, process.stdout, this.follow, this.tail)
  }
}
