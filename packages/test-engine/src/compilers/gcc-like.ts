import { spawnSync, type SpawnSyncReturns } from "child_process"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { C_STANDARD_FLAG, GCC_LINK_FLAGS, GCC_WARN_FLAGS, TSC_DEFINES, DEFAULT_OPTIMIZE_FLAG, DEBUG_FLAG, WIN32_LINK_FLAGS } from "@tsclang/shared"
import { msys2Bash, toMsysPath, shQuote, bashExec } from "./msys2.js"
import { DEFAULT_COMPILE_TIMEOUT_MS } from "./utils.js"
import type { CompilerBackend, CompileOpts, CompileResult, RunOpts, RunResult } from "./interface.js"

/** spawnSync reports a timeout as status=null + error=ETIMEDOUT — fold the
 *  error text into stderr so a killed compile shows its reason. */
function stderrOf(result: SpawnSyncReturns<Buffer>): string {
  return (result.stderr?.toString() ?? "") + (result.error ? `\n${result.error}` : "")
}

export class GccLikeBackend implements CompilerBackend {
  readonly name: string
  private available: boolean | undefined

  constructor(name: string) {
    this.name = name
  }

  isAvailable(): boolean {
    if (this.available === undefined) {
      // With MSYS2 bash the toolchain may live only inside MSYS2, and a PATH
      // gcc still cannot run outside bash — probe through bash, not `where`.
      if (msys2Bash()) {
        this.available = bashExec(`${shQuote(this.name)} --version`, 5_000).status === 0
      } else {
        const cmd = process.platform === "win32" ? "where" : "which"
        this.available = spawnSync(cmd, [this.name], { stdio: "pipe", shell: true }).status === 0
      }
    }
    return this.available
  }

  compile(cCode: string, outDir: string, opts?: CompileOpts): CompileResult {
    mkdirSync(outDir, { recursive: true })
    const cPath = join(outDir, "input.c")
    const binPath = join(outDir, "input" + (process.platform === "win32" ? ".exe" : ""))

    writeFileSync(cPath, cCode, "utf8")

    const isEmbedded = opts?.defines?.includes(TSC_DEFINES.EMBEDDED) ?? false
    const linkFlags = isEmbedded ? [] : process.platform === "win32"
      ? [...GCC_LINK_FLAGS, ...WIN32_LINK_FLAGS]
      : [...GCC_LINK_FLAGS]

    const timeoutMs = opts?.timeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS

    let result: SpawnSyncReturns<Buffer>
    if (msys2Bash()) {
      // Windows: gcc requires the MSYS2 runtime — rebuild argv as a quoted
      // bash script with MSYS paths. Flags come from shared constants and
      // carry no spaces, so only paths need quoting.
      const words = [this.name, shQuote(toMsysPath(cPath)), "-o", shQuote(toMsysPath(binPath)), C_STANDARD_FLAG, ...GCC_WARN_FLAGS]
      if (opts?.includes) {
        for (const inc of opts.includes) words.push(`-I${shQuote(toMsysPath(inc))}`)
      }
      if (opts?.defines) {
        for (const def of opts.defines) words.push(`-D${def}`)
      }
      if (opts?.optimize) words.push(DEFAULT_OPTIMIZE_FLAG)
      if (opts?.debug) words.push(DEBUG_FLAG)
      if (opts?.extraFlags) words.push(...opts.extraFlags)
      words.push(...linkFlags)
      result = bashExec(words.join(" "), timeoutMs)
    } else {
      const args = [cPath, "-o", binPath, C_STANDARD_FLAG, ...GCC_WARN_FLAGS]
      if (opts?.includes) {
        for (const inc of opts.includes) args.push(`-I${inc}`)
      }
      if (opts?.defines) {
        for (const def of opts.defines) args.push(`-D${def}`)
      }
      if (opts?.optimize) args.push(DEFAULT_OPTIMIZE_FLAG)
      if (opts?.debug) args.push(DEBUG_FLAG)
      if (opts?.extraFlags) args.push(...opts.extraFlags)
      args.push(...linkFlags)
      result = spawnSync(this.name, args, { stdio: "pipe", shell: true, timeout: timeoutMs })
    }

    return {
      success: result.status === 0,
      binaryPath: result.status === 0 ? binPath : undefined,
      stderr: stderrOf(result),
      exitCode: result.status ?? 1,
    }
  }

  run(binaryPath: string, opts?: RunOpts): RunResult {
    let status: number | null
    let stdout: string
    let stderr: string
    if (msys2Bash()) {
      // The binary may depend on msys DLLs — execute it in the same bash env
      const script = [shQuote(toMsysPath(binaryPath)), ...(opts?.args ?? []).map(shQuote)].join(" ")
      const result = bashExec(script, opts?.timeoutMs ?? 5000)
      status = result.status
      stdout = result.stdout?.toString() ?? ""
      stderr = stderrOf(result)
    } else {
      const result = spawnSync(binaryPath, opts?.args ?? [], {
        stdio: "pipe",
        timeout: opts?.timeoutMs ?? 5000,
        shell: true,
      })
      status = result.status
      stdout = result.stdout?.toString() ?? ""
      stderr = stderrOf(result)
    }

    return {
      success: status === 0,
      stdout,
      stderr,
      exitCode: status ?? 1,
    }
  }
}
