import { spawnSync } from "child_process"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import {
  ANDROID_ABI_TRIPLES,
  ANDROID_API_LEVEL,
  ANDROID_TRIPLE,
  buildNdkCompileArgs,
} from "@tsclang/shared"
import { isInPath, DEFAULT_COMPILE_TIMEOUT_MS } from "./utils.js"
import type { CompilerBackend, CompileOpts, CompileResult, RunOpts, RunResult } from "./interface.js"

/** The ndk-clang binary: either an explicit path to the isolated bundle's
 *  executable (TSC_NDK_CLANG — the way CI and the corpus runner pin it, since
 *  test-engine deliberately has no @tsclang/pm dependency) or a bare name
 *  resolved from PATH. */
export function ndkClangTool(): string {
  return process.env["TSC_NDK_CLANG"] || "ndk-clang"
}

/** `--target` flag for a device ABI (`adb shell getprop ro.product.cpu.abi`).
 *  Pure: unit-testable without any toolchain. Unknown/missing ABI falls back
 *  to arm64 — the ABI map exists because emulators are x86_64, and a binary
 *  built for the wrong ABI will not run on the device at all. */
export function androidTargetFlagFor(abi: string | null | undefined): string {
  const triple = ANDROID_ABI_TRIPLES[abi ?? ""] ?? ANDROID_TRIPLE
  return `--target=${triple}${ANDROID_API_LEVEL}`
}

/** adb does not forward the remote exit code, so the shell command echoes a
 *  marker line after the program. Pure: unit-testable without a device. */
export function buildAdbShellArgs(remotePath: string): string[] {
  return ["shell", `${remotePath}; echo __TSC_EXIT:$?`]
}

/** Split adb shell stdout into the program's own text and its exit code.
 *  Pure. The marker is the last line; anything before it is program stdout
 *  (normalized to LF — legacy adb transports CRLF-ify the stream). */
export function parseAdbRunOut(raw: string): { exitCode: number | null; stdout: string } {
  const text = raw.replace(/\r\n/g, "\n")
  const m = text.match(/__TSC_EXIT:(-?\d+)\s*$/)
  if (!m) return { exitCode: null, stdout: text.trimEnd() }
  const before = text.slice(0, m.index)
  return { exitCode: Number(m[1]), stdout: before.replace(/\n$/, "").trimEnd() }
}

/** `adb devices` output has a connected-and-ready device when some line ends
 *  in state "device" (not offline/unauthorized). Pure. */
export function adbHasDevice(devicesOut: string): boolean {
  return /^[\w.-]+\s+device\b/m.test(devicesOut)
}

/** Device ABI via `adb shell getprop ro.product.cpu.abi`, cached per process
 *  (compile and run must agree on one triple). "" when no device answers. */
let deviceAbiCache: string | null = null
export function adbDeviceAbi(): string {
  if (deviceAbiCache !== null) return deviceAbiCache
  const r = spawnSync("adb", ["shell", "getprop", "ro.product.cpu.abi"], { stdio: "pipe", timeout: 10_000 })
  deviceAbiCache = r.status === 0 ? r.stdout.toString().replace(/\r?\n/g, "").trim() : ""
  return deviceAbiCache
}

export class NdkClangBackend implements CompilerBackend {
  name = "ndk-clang"

  isAvailable(): boolean {
    const probe = ndkClangTool()
    const toolOk = process.env["TSC_NDK_CLANG"] ? true : isInPath(probe)
    if (!toolOk) return false
    if (!isInPath("adb")) return false
    const devices = spawnSync("adb", ["devices"], { stdio: "pipe", timeout: 10_000 })
    return devices.status === 0 && adbHasDevice(devices.stdout?.toString() ?? "")
  }

  version(): string {
    if (!this.isAvailable()) return ""
    const r = spawnSync(ndkClangTool(), ["--version"], { stdio: "pipe", timeout: 10_000 })
    return (r.stdout?.toString() ?? "").split("\n")[0]?.trim() ?? ""
  }

  compile(cCode: string, outDir: string, opts?: CompileOpts): CompileResult {
    mkdirSync(outDir, { recursive: true })
    const cPath = join(outDir, "input.c")
    const outPath = join(outDir, "input")

    writeFileSync(cPath, cCode, "utf8")

    const includes = opts?.includes ?? []
    const args = buildNdkCompileArgs({
      cPath,
      outPath,
      runtimeInclude: includes[0] ?? "",
      // Only the repacked isolated bundle needs --sysroot spelled out — a
      // PATH-installed NDK driver locates its own sysroot
      sysroot: process.env["TSC_NDK_SYSROOT"] || undefined,
      targetFlag: androidTargetFlagFor(adbDeviceAbi()),
      includeDirs: includes.slice(1),
      defines: opts?.defines,
    })

    const result = spawnSync(ndkClangTool(), args, {
      stdio: "pipe",
      timeout: opts?.timeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS,
    })

    return {
      success: result.status === 0,
      binaryPath: result.status === 0 ? outPath : undefined,
      stderr: result.stderr?.toString() ?? "",
      exitCode: result.status ?? 1,
    }
  }

  run(binaryPath: string, opts?: RunOpts): RunResult {
    const remote = `/data/local/tmp/tsc_${process.pid}_${Date.now()}`
    const adbTimeout = 30_000

    const push = spawnSync("adb", ["push", binaryPath, remote], { stdio: "pipe", timeout: adbTimeout })
    if (push.status !== 0) {
      return { success: false, stdout: "", stderr: push.stderr?.toString() ?? "adb push failed", exitCode: push.status ?? 1 }
    }
    spawnSync("adb", ["shell", `chmod 755 ${remote}`], { stdio: "pipe", timeout: adbTimeout })

    const shell = spawnSync("adb", buildAdbShellArgs(remote), {
      stdio: "pipe",
      timeout: opts?.timeoutMs ?? 5000,
    })
    // Best-effort cleanup — a failed rm must not mask the run result
    spawnSync("adb", ["shell", `rm -f ${remote}`], { stdio: "pipe", timeout: adbTimeout })

    const raw = shell.stdout?.toString() ?? ""
    const parsed = parseAdbRunOut(raw)
    const timedOut = shell.error?.message.includes("TIMEDOUT") || shell.signal === "SIGTERM"
    if (parsed.exitCode === null) {
      return {
        success: false,
        stdout: parsed.stdout,
        stderr: raw || shell.stderr?.toString() || (timedOut ? "adb shell timed out" : "no __TSC_EXIT marker in output"),
        exitCode: shell.status ?? 1,
      }
    }
    return {
      success: parsed.exitCode === 0,
      stdout: parsed.stdout,
      stderr: shell.stderr?.toString() ?? "",
      exitCode: parsed.exitCode,
    }
  }
}
