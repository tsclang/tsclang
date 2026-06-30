import { spawnSync } from "child_process"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { isInPath, isInWsl, wslExec, toWslPath } from "./utils.js"
import type { CompilerBackend, CompileOpts, CompileResult, RunOpts, RunResult } from "./interface.js"

export class AvrGccBackend implements CompilerBackend {
  name = "avr-gcc"
  private mcu = "atmega328p"
  private freq = "16000000"

  isAvailable(): boolean {
    if (process.platform === "win32") {
      return isInWsl("avr-gcc") && isInWsl("simavr")
    }
    return isInPath("avr-gcc") && isInPath("simavr")
  }

  compile(cCode: string, outDir: string, opts?: CompileOpts): CompileResult {
    mkdirSync(outDir, { recursive: true })
    const cPath = join(outDir, "input.c")
    const elfPath = join(outDir, "input.elf")
    const hexPath = join(outDir, "input.hex")

    writeFileSync(cPath, cCode, "utf8")

    const defines = ["-DTSC_EMBEDDED", "-DTSC_NO_POSIX", "-DTSC_NO_STRTOLL", ...(opts?.defines ?? [])]
    const args = [`-mmcu=${this.mcu}`, "-Os", "-std=c11", ...defines.flatMap(d => [d]), cPath, "-o", elfPath]
    if (opts?.includes) {
      for (const inc of opts.includes) args.splice(-2, 0, `-I${inc}`)
    }

    if (process.platform === "win32") {
      const wslCPath = toWslPath(cPath)
      const wslElfPath = toWslPath(elfPath)
      const wslHexPath = toWslPath(hexPath)

      const compileArgs = [`-mmcu=${this.mcu}`, "-Os", "-std=c11", ...defines, wslCPath, "-o", wslElfPath]
      if (opts?.includes) {
        for (const inc of opts.includes) compileArgs.splice(-2, 0, `-I${toWslPath(inc)}`)
      }
      const compileResult = wslExec("avr-gcc", compileArgs)
      if (compileResult.status !== 0) {
        return {
          success: false,
          stderr: compileResult.stderr?.toString() ?? "",
          exitCode: compileResult.status ?? 1,
        }
      }

      const objcopyResult = wslExec("avr-objcopy", ["-O", "ihex", "-R", ".eeprom", wslElfPath, wslHexPath])
      if (objcopyResult.status !== 0) {
        return {
          success: false,
          stderr: objcopyResult.stderr?.toString() ?? "",
          exitCode: objcopyResult.status ?? 1,
        }
      }

      return { success: true, binaryPath: hexPath, stderr: "", exitCode: 0 }
    }

    const compileResult = spawnSync("avr-gcc", args, { stdio: "pipe", shell: true })
    if (compileResult.status !== 0) {
      return {
        success: false,
        stderr: compileResult.stderr?.toString() ?? "",
        exitCode: compileResult.status ?? 1,
      }
    }

    const objcopyResult = spawnSync("avr-objcopy", ["-O", "ihex", "-R", ".eeprom", elfPath, hexPath], { stdio: "pipe", shell: true })
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
    if (process.platform === "win32") {
      const wslHexPath = hexPath.replace(/\\/g, "/").replace(/^([A-Z]):/i, (_, d) => `/mnt/${d.toLowerCase()}`)
      const result = wslExec("simavr", ["-uart0:stdio", "-mcu", this.mcu, "-f", this.freq, wslHexPath])
      return {
        success: result.status === 0,
        stdout: result.stdout?.toString() ?? "",
        stderr: result.stderr?.toString() ?? "",
        exitCode: result.status ?? 1,
      }
    }

    const result = spawnSync("simavr", ["-uart0:stdio", "-mcu", this.mcu, "-f", this.freq, hexPath], {
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
