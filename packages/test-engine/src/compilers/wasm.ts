import { spawnSync } from "child_process"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { C_STANDARD_FLAG, TSC_DEFINES } from "@tsclang/shared"
import { isInPath } from "./utils.js"
import type { CompilerBackend, CompileOpts, CompileResult, RunOpts, RunResult } from "./interface.js"

/** emcc argument line. Pure: unit-testable without emcc.
 *  Parity with CLI `--emit wasm` (build.ts): -sWASM=1 -sSTANDALONE_WASM=1 and
 *  the TSC_WASM define are always on — runtime.h activates its WASM branches
 *  only under that define, so without it the tests would exercise a different
 *  runtime than production. `defines` are raw names/values (the -D prefix is
 *  added here, matching the other backends' internal define handling). */
export function buildEmccArgs(o: {
  cPath: string
  jsPath: string
  includes?: string[]
  defines?: string[]
  extraFlags?: string[]
}): string[] {
  const args = ["-sWASM=1", "-sSTANDALONE_WASM=1", o.cPath, "-o", o.jsPath, C_STANDARD_FLAG]
  for (const inc of o.includes ?? []) args.push(`-I${inc}`)
  args.push(`-D${TSC_DEFINES.WASM}`)
  for (const d of o.defines ?? []) args.push(`-D${d}`)
  args.push(...(o.extraFlags ?? []))
  return args
}

export class WasmBackend implements CompilerBackend {
  name = "wasm"

  isAvailable(): boolean {
    return isInPath("emcc")
  }

  version(): string {
    if (!this.isAvailable()) return ""
    const r = spawnSync("emcc", ["--version"], { stdio: "pipe", shell: true, timeout: 5_000 })
    return (r.stdout?.toString() ?? "").split("\n")[0]?.trim() ?? ""
  }

  compile(cCode: string, outDir: string, opts?: CompileOpts): CompileResult {
    mkdirSync(outDir, { recursive: true })
    const cPath = join(outDir, "input.c")
    const jsPath = join(outDir, "input.js")

    writeFileSync(cPath, cCode, "utf8")

    const args = buildEmccArgs({
      cPath,
      jsPath,
      includes: opts?.includes,
      defines: opts?.defines,
      extraFlags: opts?.extraFlags,
    })
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
