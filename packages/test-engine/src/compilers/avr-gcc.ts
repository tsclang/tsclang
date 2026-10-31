import { spawnSync } from "child_process"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { C_STANDARD_FLAG, DEFAULT_AVR_MCU, DEFAULT_AVR_FREQ, TSC_DEFINES, SIZE_OPTIMIZE_FLAG } from "@tsclang/shared"
import { isInPath, isInWsl, wslExec, toWslPath } from "./utils.js"
import type { CompilerBackend, CompileOpts, CompileResult, RunOpts, RunResult } from "./interface.js"

/** avr-gcc argument line for one translation unit. Pure: unit-testable without
 *  the toolchain. Paths come in POSIX/Windows form and are converted by the
 *  caller when running through WSL. */
export function buildAvrCompileArgs(o: {
  cPath: string
  elfPath: string
  mcu?: string
  defines?: string[]
  includes?: string[]
}): string[] {
  const defines = [`-D${TSC_DEFINES.EMBEDDED}`, `-D${TSC_DEFINES.NO_POSIX}`, `-D${TSC_DEFINES.NO_STRTOLL}`, ...(o.defines ?? [])]
  const args = [`-mmcu=${o.mcu ?? DEFAULT_AVR_MCU}`, SIZE_OPTIMIZE_FLAG, C_STANDARD_FLAG, ...defines]
  for (const inc of o.includes ?? []) args.push(`-I${inc}`)
  args.push(o.cPath, "-o", o.elfPath)
  return args
}

/** simavr invocation arguments. Pure: unit-testable without the simulator. */
export function buildSimavrArgs(mcu: string | undefined, freq: string | number | undefined, hexPath: string): string[] {
  return ["-uart0:stdio", "-mcu", mcu ?? DEFAULT_AVR_MCU, "-f", String(freq ?? DEFAULT_AVR_FREQ), hexPath]
}

export class AvrGccBackend implements CompilerBackend {
  name = "avr-gcc"

  isAvailable(): boolean {
    if (process.platform === "win32") {
      return isInWsl("avr-gcc") && isInWsl("simavr")
    }
    return isInPath("avr-gcc") && isInPath("simavr")
  }

  version(): string {
    if (!this.isAvailable()) return ""
    const r = process.platform === "win32"
      ? wslExec("avr-gcc", ["--version"])
      : spawnSync("avr-gcc", ["--version"], { stdio: "pipe", shell: true })
    return (r.stdout?.toString() ?? "").split("\n")[0]?.trim() ?? ""
  }

  compile(cCode: string, outDir: string, opts?: CompileOpts): CompileResult {
    mkdirSync(outDir, { recursive: true })
    const cPath = join(outDir, "input.c")
    const elfPath = join(outDir, "input.elf")
    const hexPath = join(outDir, "input.hex")

    writeFileSync(cPath, cCode, "utf8")

    // One argument line, built once; on Windows the paths are mapped into the
    // WSL view before spawning
    const toHost = (p: string) => (process.platform === "win32" ? toWslPath(p) : p)
    const args = buildAvrCompileArgs({
      cPath: toHost(cPath),
      elfPath: toHost(elfPath),
      mcu: opts?.mcu,
      defines: opts?.defines,
      includes: (opts?.includes ?? []).map(toHost),
    })

    const compileResult = process.platform === "win32"
      ? wslExec("avr-gcc", args)
      : spawnSync("avr-gcc", args, { stdio: "pipe", shell: true })
    if (compileResult.status !== 0) {
      return {
        success: false,
        stderr: compileResult.stderr?.toString() ?? "",
        exitCode: compileResult.status ?? 1,
      }
    }

    const objcopyResult = process.platform === "win32"
      ? wslExec("avr-objcopy", ["-O", "ihex", "-R", ".eeprom", toHost(elfPath), toHost(hexPath)])
      : spawnSync("avr-objcopy", ["-O", "ihex", "-R", ".eeprom", elfPath, hexPath], { stdio: "pipe", shell: true })
    if (objcopyResult.status !== 0) {
      return {
        success: false,
        stderr: objcopyResult.stderr?.toString() ?? "",
        exitCode: objcopyResult.status ?? 1,
      }
    }

    return { success: true, binaryPath: hexPath, stderr: "", exitCode: 0 }
  }

  run(hexPath: string, opts?: RunOpts): RunResult {
    const hostHex = process.platform === "win32" ? toWslPath(hexPath) : hexPath
    const args = buildSimavrArgs(opts?.mcu, opts?.freq, hostHex)
    const result = process.platform === "win32"
      ? wslExec("simavr", args)
      : spawnSync("simavr", args, { stdio: "pipe", timeout: opts?.timeoutMs ?? 5000, shell: true })

    return {
      success: result.status === 0,
      stdout: result.stdout?.toString() ?? "",
      stderr: result.stderr?.toString() ?? "",
      exitCode: result.status ?? 1,
    }
  }
}
