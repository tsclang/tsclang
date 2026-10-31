import { spawnSync } from "child_process"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { C_STANDARD_FLAG, DEFAULT_AVR_MCU, DEFAULT_AVR_FREQ, TSC_DEFINES, SIZE_OPTIMIZE_FLAG } from "@tsclang/shared"
import { isInPath, isInWsl, wslExec, toWslPath, DEFAULT_COMPILE_TIMEOUT_MS } from "./utils.js"
import type { CompilerBackend, CompileOpts, CompileResult, RunOpts, RunResult } from "./interface.js"

/** avr-gcc argument line for one translation unit. Pure: unit-testable without
 *  the toolchain. Mirrors the CLI's hex/flash emit: only the toolchain-invariant
 *  extras live here (TSC_EMBEDDED + -mmcu + size optimization) — semantic
 *  defines (NO_POSIX, CONSOLE_UART, ...) come from the target profile via
 *  capabilityDefines(), exactly like `tsclang build`. Paths come in
 *  POSIX/Windows form and are converted by the caller when running through
 *  WSL. */
export function buildAvrCompileArgs(o: {
  cPath: string
  elfPath: string
  mcu?: string
  defines?: string[]
  includes?: string[]
}): string[] {
  const defines = [`-D${TSC_DEFINES.EMBEDDED}`, ...(o.defines ?? [])]
  const args = [`-mmcu=${o.mcu ?? DEFAULT_AVR_MCU}`, SIZE_OPTIMIZE_FLAG, C_STANDARD_FLAG, ...defines]
  for (const inc of o.includes ?? []) args.push(`-I${inc}`)
  args.push(o.cPath, "-o", o.elfPath)
  return args
}

/** simavr invocation arguments. Pure: unit-testable without the simulator.
 *  Flag forms follow `simavr --help`: `-m <mcu>` `-f <freq>` `-uart0:stdio`. */
export function buildSimavrArgs(mcu: string | undefined, freq: string | number | undefined, hexPath: string): string[] {
  return ["-uart0:stdio", "-m", mcu ?? DEFAULT_AVR_MCU, "-f", String(freq ?? DEFAULT_AVR_FREQ), hexPath]
}

/** simavr decorates UART bytes itself (green ANSI wrap + trailing "..", sent
 *  to stderr) and prints load banners to stdout — verified against a minimal
 *  non-TSC firmware. Strip all of that so the result is the program's own
 *  text only. Same rules as the corpus runner's normalizeAvrOut. */
export function normalizeSimavrOut(raw: string): string {
  const lines = raw.replace(/\r\n/g, "\n").split("\n")
  const filtered = lines.filter(l => {
    const clean = l.replace(/\x1b\[[0-9;]*m/g, "").trim()
    if (clean.startsWith("Loaded ") || clean.startsWith("Load HEX ") || clean.startsWith("signal caught")) return false
    return true
  })
  return filtered
    .map(l => l.replace(/\x1b\[[0-9;]*m/g, "").replace(/\.\.+$/, "").trimEnd())
    .filter(l => l.length > 0)
    .join("\n")
    .trimEnd()
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

    // A hung toolchain must surface as a failed compile, not a stuck suite —
    // every spawn gets the same wall-clock budget as the native backends
    const compileTimeout = opts?.timeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS
    const compileResult = process.platform === "win32"
      ? wslExec("avr-gcc", args, compileTimeout)
      : spawnSync("avr-gcc", args, { stdio: "pipe", timeout: compileTimeout, shell: true })
    if (compileResult.status !== 0) {
      return {
        success: false,
        stderr: compileResult.stderr?.toString() ?? "",
        exitCode: compileResult.status ?? 1,
      }
    }

    const objcopyResult = process.platform === "win32"
      ? wslExec("avr-objcopy", ["-O", "ihex", "-R", ".eeprom", toHost(elfPath), toHost(hexPath)], compileTimeout)
      : spawnSync("avr-objcopy", ["-O", "ihex", "-R", ".eeprom", elfPath, hexPath], { stdio: "pipe", timeout: compileTimeout, shell: true })
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
    const timeout = opts?.timeoutMs ?? 5000
    const result = process.platform === "win32"
      ? wslExec("simavr", args, timeout)
      : spawnSync("simavr", args, { stdio: "pipe", timeout, shell: true })

    // Firmware UART bytes arrive on simavr's stderr (ANSI-wrapped), its own
    // banners on stdout — merge both channels like the corpus runner's `2>&1`.
    // A run is normally ended by the wall-clock kill, so a killed/non-zero
    // exit with any captured output still counts as a successful run; the
    // normalized stdout decides, exit code alone is not a firmware verdict.
    const merged = (result.stdout?.toString() ?? "") + (result.stderr?.toString() ?? "")
    return {
      success: result.status === 0 || merged.trim().length > 0,
      stdout: normalizeSimavrOut(merged),
      stderr: merged,
      exitCode: result.status ?? 1,
    }
  }
}
