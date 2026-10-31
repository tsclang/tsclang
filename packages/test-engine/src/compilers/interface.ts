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
