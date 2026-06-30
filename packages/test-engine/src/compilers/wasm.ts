import { spawnSync } from "child_process"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { C_STANDARD_FLAG } from "@tsclang/shared"
import { isInPath } from "./utils.js"
import type { CompilerBackend, CompileOpts, CompileResult, RunOpts, RunResult } from "./interface.js"

export class WasmBackend implements CompilerBackend {
  name = "wasm"

  isAvailable(): boolean {
    return isInPath("emcc")
  }

  compile(cCode: string, outDir: string, opts?: CompileOpts): CompileResult {
    mkdirSync(outDir, { recursive: true })
    const cPath = join(outDir, "input.c")
    const jsPath = join(outDir, "input.js")

    writeFileSync(cPath, cCode, "utf8")

    const args = [cPath, "-o", jsPath, C_STANDARD_FLAG]
    if (opts?.includes) {
      for (const inc of opts.includes) args.push(`-I${inc}`)
    }
    if (opts?.defines) {
      for (const def of opts.defines) args.push(`-D${def}`)
    }
    if (opts?.extraFlags) args.push(...opts.extraFlags)

    const result = spawnSync("emcc", args, { stdio: "pipe", shell: true })

    return {
      success: result.status === 0,
      binaryPath: result.status === 0 ? jsPath : undefined,
      stderr: result.stderr?.toString() ?? "",
      exitCode: result.status ?? 1,
    }
  }

  run(jsPath: string, opts?: RunOpts): RunResult {
    const result = spawnSync("node", [jsPath, ...(opts?.args ?? [])], {
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
