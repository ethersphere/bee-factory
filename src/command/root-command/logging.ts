import { Printer } from './printer'

export enum VerbosityLevel {
  /** No output message, only at errors or result strings (e.g. hash of uploaded file) */
  Quiet,
  /** Formatted informal messages at end of operations, output row number is equal at same operations */
  Normal,
  /** dim messages, gives info about state of the operation frequently. Default */
  Verbose,
}

type PrinterFnc = (message: string, ...args: unknown[]) => void

export class Logging {
  public readonly verbosityLevel: VerbosityLevel
  // Callable logging functions (instead of console.log)

  /** Error messages */
  public error: PrinterFnc
  /** Identical with console.log */
  public log: PrinterFnc
  /** Informal messages (e.g. Tips) */
  public info: PrinterFnc

  constructor(verbosityLevel: VerbosityLevel) {
    this.verbosityLevel = verbosityLevel
    switch (verbosityLevel) {
      case VerbosityLevel.Verbose:
        this.error = Printer.error
        this.log = Printer.log
        this.info = Printer.info
        break
      case VerbosityLevel.Normal:
        this.error = Printer.error
        this.log = Printer.log
        this.info = Printer.emptyFunction
        break
      default:
        // quiet
        this.error = Printer.error
        this.log = Printer.emptyFunction
        this.info = Printer.emptyFunction
    }
  }
}
