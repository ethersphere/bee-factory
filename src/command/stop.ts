import { LeafCommand, Option } from 'furious-commander'
import { RootCommand } from './root-command'
import { DEFAULT_ENV_PREFIX, DEFAULT_IMAGE_PREFIX, Docker } from '../utils/docker'
import ora from 'ora'
import { VerbosityLevel } from './root-command/logging'

export class Stop extends RootCommand implements LeafCommand {
  public readonly name = 'stop'

  public readonly description = 'Stops the Bee Factory cluster'

  @Option({
    key: 'env-prefix',
    type: 'string',
    description: "Docker container's names prefix",
    envKey: 'FACTORY_DOCKER_PREFIX',
    default: DEFAULT_ENV_PREFIX,
  })
  public envPrefix!: string

  @Option({
    key: 'image-prefix',
    type: 'string',
    description: 'Docker image name prefix',
    envKey: 'FACTORY_DOCKER_PREFIX',
    default: DEFAULT_IMAGE_PREFIX,
  })
  public imagePrefix!: string

  @Option({
    key: 'rm',
    type: 'boolean',
    description: 'Remove the containers',
  })
  public deleteContainers!: boolean

  public async run(): Promise<void> {
    await super.init()

    const docker = new Docker(this.console, this.envPrefix, this.imagePrefix)

    const dockerSpinner = ora({
      text: 'Stopping all containers...',
      spinner: 'point',
      color: 'yellow',
      isEnabled: this.verbosity !== VerbosityLevel.Quiet,
    }).start()

    await docker.stopAll(true, this.deleteContainers)

    dockerSpinner.succeed('Containers stopped')
  }
}
