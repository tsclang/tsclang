import { spawnSync } from "child_process"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { findMsVC } from "./utils.js"
import type { CompilerBackend, CompileOpts, CompileResult, RunOpts, RunResult } from "./interface.js"

/** Parse cmd.exe `set` output into an env record.
 *  Skips cmd's dynamic `=X:=` pseudo-vars, blank lines and junk. */
export function parseSetOutput(out: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (!line || line.startsWith("=")) continue
    const eq = line.indexOf("=")
    if (eq <= 0) continue
    env[line.slice(0, eq)] = line.slice(eq + 1)
  }
  return env
}

export class MsvcBackend implements CompilerBackend {
  name = "msvc"
  private env: Record<string, string> | null = null
  private clPath: string | null = null
  private available: boolean | undefined

  isAvailable(): boolean {
    if (this.available === undefined) {
      this.available = process.platform === "win32" && this.captureEnv() !== null
    }
    return this.available
  }

  /** Run `vcvarsall.bat x64` and capture the resulting environment — the only
   *  reliable way to get INCLUDE/LIB/PATH for cl.exe. Null when VS is absent
   *  or vcvarsall fails (isAvailable stays honestly false). */
  private captureEnv(): Record<string, string> | null {
    if (this.env) return this.env
    const found = findMsVC()
    if (!found || !found.vcvarsall) return null
    const result = spawnSync("cmd.exe", ["/d", "/s", "/c", `"${found.vcvarsall}" x64 >nul && set`], {
      stdio: "pipe",
      windowsVerbatimArguments: true,
      timeout: 30_000,
    })
    if (result.status !== 0) return null
    const env = parseSetOutput(result.stdout.toString())
    // vcvarsall must have really run: without INCLUDE/LIB cl.exe cannot work
    if (!env["INCLUDE"] || !env["LIB"]) return null
    this.env = env
    this.clPath = found.cl
    return env
  }

  compile(cCode: string, outDir: string, opts?: CompileOpts): CompileResult {
    mkdirSync(outDir, { recursive: true })
    const cPath = join(outDir, "input.c")
    const binPath = join(outDir, "input.exe")

    writeFileSync(cPath, cCode, "utf8")

    const args = [cPath, `/Fe:${binPath}`, "/std:c11", "/W4", "/nologo"]
    if (opts?.includes) {
      for (const inc of opts.includes) args.push(`/I${inc}`)
    }
    if (opts?.defines) {
      for (const def of opts.defines) args.push(`/D${def}`)
    }
    if (opts?.optimize) args.push("/O2")
    if (opts?.debug) args.push("/Zi")
    if (opts?.extraFlags) args.push(...opts.extraFlags)

    const env = this.env ? { ...process.env, ...this.env } : process.env
    const result = spawnSync(this.clPath ?? "cl.exe", args, { stdio: "pipe", env })

    return {
      success: result.status === 0,
      binaryPath: result.status === 0 ? binPath : undefined,
      stderr: result.stderr?.toString() ?? "",
      exitCode: result.status ?? 1,
    }
  }

  run(binaryPath: string, opts?: RunOpts): RunResult {
    const result = spawnSync(binaryPath, opts?.args ?? [], {
      stdio: "pipe",
      timeout: opts?.timeoutMs ?? 5000,
    })

    return {
      success: result.status === 0,
      stdout: result.stdout?.toString() ?? "",
      stderr: result.stderr?.toString() ?? "",
      exitCode: result.status ?? 1,
    }
  }
}
