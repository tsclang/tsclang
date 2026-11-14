import { spawnSync } from "child_process"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { buildIosCompileArgs, buildVtoolHostArgs, IOS_SIM_TRIPLE, IOS_SIM_TRIPLE_X64 } from "@tsclang/shared"
import { isInPath, DEFAULT_COMPILE_TIMEOUT_MS } from "./utils.js"
import type { CompilerBackend, CompileOpts, CompileResult, RunOpts, RunResult } from "./interface.js"

/** Simulator triple for a host arch. Pure: unit-testable without macOS.
 *  A sim slice shares the host ISA — an arm64 sim slice needs an arm64 host,
 *  so intel Macs take the x86_64 triple (#283 phase 3). */
export function iosSimTripleFor(hostArch: string | undefined): string {
  return hostArch === "x64" ? IOS_SIM_TRIPLE_X64 : IOS_SIM_TRIPLE
}

export class IosSimBackend implements CompilerBackend {
  name = "ios-sim"

  /** macOS-only by design: the Apple SDK is not redistributable, so there is
   *  no bundle — `xcrun` + Xcode Command Line Tools IS the toolchain. */
  isAvailable(): boolean {
    return process.platform === "darwin" && isInPath("xcrun")
  }

  version(): string {
    if (!this.isAvailable()) return ""
    const r = spawnSync("xcrun", ["--version"], { stdio: "pipe", timeout: 10_000 })
    return (r.stdout?.toString() ?? "").split("\n")[0]?.trim() ?? ""
  }

  compile(cCode: string, outDir: string, opts?: CompileOpts): CompileResult {
    mkdirSync(outDir, { recursive: true })
    const cPath = join(outDir, "input.c")
    const outPath = join(outDir, "input")

    writeFileSync(cPath, cCode, "utf8")

    const includes = opts?.includes ?? []
    const args = buildIosCompileArgs({
      cPath,
      outPath,
      runtimeInclude: includes[0] ?? "",
      sdk: "iphonesimulator",
      triple: iosSimTripleFor(process.arch),
      optimize: opts?.optimize ? "O2" : null,
      includeDirs: includes.slice(1),
      defines: opts?.defines,
    })

    const result = spawnSync("xcrun", args, {
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

  /** dyld refuses to exec an IOSSIMULATOR-platform macho from a macOS
   *  process (SIGKILL, no output) — no simulator boot needed, but the run
   *  goes through a vtool-retagged COPY (LC_BUILD_VERSION -> macos): the
   *  code and ABI are identical on Apple Silicon, only the platform tag
   *  differs. The artifact itself stays a true simulator slice (#283). */
  run(binaryPath: string, opts?: RunOpts): RunResult {
    const hostPath = `${binaryPath}.host`
    const patch = spawnSync("vtool", buildVtoolHostArgs(hostPath, binaryPath), {
      stdio: "pipe",
      timeout: 30_000,
    })
    if (patch.status !== 0) {
      return {
        success: false,
        stdout: "",
        stderr: `vtool host-patch failed for ${binaryPath}: ${patch.error?.message ?? patch.stderr?.toString() ?? ""}`,
        exitCode: 1,
      }
    }

    const result = spawnSync(hostPath, opts?.args ?? [], {
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
