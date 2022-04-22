import { Argument, LeafCommand, Option } from 'furious-commander'
import { RootCommand } from './root-command'
import { ContainerType, DEFAULT_ENV_PREFIX, DEFAULT_IMAGE_PREFIX, Docker } from '../utils/docker'

export class Log extends RootCommand implements LeafCommand {
  public readonly name = 'log'

  public readonly description = `Attach to given Bee node to see its logs.

Valid container's names are: ${Object.values(ContainerType).join(', ')}`

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

  @Argument({ key: 'container', description: 'Container name as described above', required: true })
  public container!: ContainerType

  public async run(): Promise<void> {
    await super.init()

    if (!Object.values(ContainerType).includes(this.container)) {
      throw new Error(`Passed container name is not valid! Valid values: ${Object.values(ContainerType).join(', ')}`)
    }

    const docker = new Docker(this.console, this.envPrefix, this.imagePrefix)
    await docker.attachLogging(this.container, process.stdout)
  }
}
