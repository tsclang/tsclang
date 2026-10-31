import type { SpawnSyncReturns } from "child_process"

export interface CompileOpts {
  includes?: string[]
  defines?: string[]
  std?: string
  extraFlags?: string[]
  optimize?: boolean
  debug?: boolean
  /** Wall-clock budget for the compilation; default 30s */
  timeoutMs?: number
  /** AVR backend: MCU model for `-mmcu=` (default DEFAULT_AVR_MCU); ignored by other backends */
  mcu?: string
  /** AVR backend: clock frequency in Hz for simavr; ignored by other backends */
  freq?: string | number
}

export interface CompileResult {
  success: boolean
  binaryPath?: string
  stderr: string
  exitCode: number
}

export interface RunOpts {
  timeoutMs?: number
  args?: string[]
  /** AVR backend: must match the MCU the binary was compiled for */
  mcu?: string
  /** AVR backend: simavr clock frequency in Hz */
  freq?: string | number
}

export interface RunResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
}

export interface CompilerBackend {
  name: string
  isAvailable(): boolean
  compile(cCode: string, outDir: string, opts?: CompileOpts): CompileResult
  run?(binaryPath: string, opts?: RunOpts): RunResult
  /** First line of the toolchain version banner, "" when not reportable —
   *  feeds the JSON report environment block */
  version?(): string
}
