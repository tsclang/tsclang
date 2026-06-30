import { spawnSync } from "child_process"
import { writeFileSync, mkdirSync } from "fs"
import { join, resolve } from "path"
import { C_STANDARD_FLAG, GCC_LINK_FLAGS, TSC_DEFINES } from "@tsclang/shared"
import type { CompilerBackend, CompileOpts, CompileResult, RunOpts, RunResult } from "./interface.js"

export class GccBackend implements CompilerBackend {
  name = "gcc"

  isAvailable(): boolean {
    const cmd = process.platform === "win32" ? "where" : "which"
    const result = spawnSync(cmd, ["gcc"], { stdio: "pipe", shell: true })
    return result.status === 0
  }

  compile(cCode: string, outDir: string, opts?: CompileOpts): CompileResult {
    mkdirSync(outDir, { recursive: true })
    const cPath = join(outDir, "input.c")
    const binPath = join(outDir, "input" + (process.platform === "win32" ? ".exe" : ""))

    writeFileSync(cPath, cCode, "utf8")

    const args = [cPath, "-o", binPath, C_STANDARD_FLAG]
    if (opts?.includes) {
      for (const inc of opts.includes) args.push(`-I${inc}`)
    }
    if (opts?.defines) {
      for (const def of opts.defines) args.push(`-D${def}`)
    }
    if (opts?.optimize) args.push("-O2")
    if (opts?.debug) args.push("-g")
    if (opts?.extraFlags) args.push(...opts.extraFlags)

    const isEmbedded = opts?.defines?.includes(TSC_DEFINES.EMBEDDED) ?? false
    if (!isEmbedded) args.push(...GCC_LINK_FLAGS)

    const result = spawnSync("gcc", args, { stdio: "pipe", shell: true })

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
