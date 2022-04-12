import { ExternalOption } from 'furious-commander'
import { Logging, VerbosityLevel } from './logging'

export class RootCommand {
  @ExternalOption('quiet')
  public quiet!: boolean

  @ExternalOption('verbose')
  public verbose!: boolean

  public verbosity!: VerbosityLevel

  public console!: Logging
  public readonly appName = 'bee-factory'

  protected async init(): Promise<void> {
    this.verbosity = VerbosityLevel.Normal

    if (this.quiet) {
      this.verbosity = VerbosityLevel.Quiet
    }

    if (this.verbose) {
      this.verbosity = VerbosityLevel.Verbose
    }

    this.console = new Logging(this.verbosity)
  }
}
