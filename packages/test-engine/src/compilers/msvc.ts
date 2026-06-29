import { spawnSync } from "child_process"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { findMsVC } from "./utils.js"
import type { CompilerBackend, CompileOpts, CompileResult, RunOpts, RunResult } from "./interface.js"

export class MsvcBackend implements CompilerBackend {
  name = "msvc"
  private vcEnv: Record<string, string> | null = null

  isAvailable(): boolean {
    this.vcEnv = findMsVC()
    return this.vcEnv !== null
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

    const env = this.vcEnv ? { ...process.env, ...this.vcEnv } : process.env
    const result = spawnSync("cl.exe", args, { stdio: "pipe", shell: true, env })

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
      shell: true,
    })

    return {
      success: result.status === 0,
      stdout: result.stdout?.toString() ?? "",
      stderr: result.stderr?.toString() ?? "",
      exitCode: result.status ?? 1,
    }
  }
}
