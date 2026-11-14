// iOS platform tier (#283 phase 3): the built-in profile capabilities, the
// xcrung compile-args contract (the Apple SDK is not redistributable — there
// is no bundle, xcrun resolves the compiler on a macOS host), and the CLI
// guards (exec only for simulator binaries, which run on the host).
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import { loadProfile } from "../../../../../cli/src/cli/profile-loader.js"
import { TARGET_NAMES, buildIosCompileArgs, IOS_DEVICE_TRIPLE, IOS_SIM_TRIPLE, IOS_SIM_TRIPLE_X64 } from "../../../../../shared/src/index.js"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const BUILTIN_PROFILES = join(ROOT, "packages", "compiler", "src", "profiles")
const DIST_BIN = join(ROOT, "packages", "cli", "dist", "index.js")

const tmpDirs: string[] = []
function mkTmp(): string {
  const d = mkdtempSync(join(tmpdir(), "tsc-ios-"))
  tmpDirs.push(d)
  return d
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

// ── встроенный профиль ───────────────────────────────────────────────────────

describe("13-build/platform ios — встроенный профиль (#283)", () => {
  test("loadProfile('ios') даёт darwin-таргет с тулчейном clang", () => {
    const caps = loadProfile("ios", BUILTIN_PROFILES, join(mkTmp(), "main.tsc"))
    expect(caps).not.toBe(null)
    expect(caps!.toolchain).toBe("clang")
    expect(caps!.allocator).toBe("heap")
    expect(caps!.async).toBe("none")
    expect(caps!.fpu).toBe(true)
    expect(caps!.bits).toBe(64)
    expect(caps!.usize).toBe("u64")
    expect(caps!.defaultNumber).toBe("f64")
    expect(caps!.os).toBe(true)
    expect(caps!.posix).toBe(true)
    expect(caps!.strtoll).toBe(true)
  })

  test("ios входит в TARGET_NAMES", () => {
    expect(TARGET_NAMES.includes("ios")).toBe(true)
  })
})

// ── argv-контракт xcrung компиляции ──────────────────────────────────────────

describe("13-build/platform ios — buildIosCompileArgs (#283)", () => {
  test("устройство: xcrun --sdk iphoneos clang, -target arm64, PIE, без -lm (libm в libSystem)", () => {
    const argv = buildIosCompileArgs({ cPath: "out/main.c", outPath: "out/main", runtimeInclude: "rt", sdk: "iphoneos" })
    expect(JSON.stringify(argv)).toBe(JSON.stringify([
      "--sdk", "iphoneos", "clang",
      "out/main.c", "-o", "out/main",
      "-I", "rt",
      `-target=${IOS_DEVICE_TRIPLE}`,
      "-fPIE", "-pie",
      "-std=c11",
    ]))
    expect(argv.includes("-lm")).toBe(false)
  })

  test("симулятор: -target arm64-apple-ios16.0-simulator (дефолт для iphonesimulator)", () => {
    const argv = buildIosCompileArgs({ cPath: "in.c", outPath: "out/main", runtimeInclude: "rt", sdk: "iphonesimulator" })
    expect(argv).toContain(`-target=${IOS_SIM_TRIPLE}`)
  })

  test("triple переопределяется для intel-хостов (x86_64-сим)", () => {
    const argv = buildIosCompileArgs({
      cPath: "in.c", outPath: "out/main", runtimeInclude: "rt",
      sdk: "iphonesimulator", triple: IOS_SIM_TRIPLE_X64,
    })
    expect(argv).toContain(`-target=${IOS_SIM_TRIPLE_X64}`)
  })

  test("оптимизация и include-директории сохраняются", () => {
    const argv = buildIosCompileArgs({
      cPath: "in.c", outPath: "out/main", runtimeInclude: "rt",
      sdk: "iphoneos", optimize: "O2", includeDirs: ["pkg/inc"], defines: ["-DTSX=1"],
    })
    expect(argv).toContain("-O2")
    expect(argv).toContain("-DTSX=1")
    expect(argv[argv.lastIndexOf("-I") + 1]).toBe("pkg/inc")
  })
})

// ── CLI guards (dist e2e) ────────────────────────────────────────────────────

describe("13-build/platform ios — guards CLI (#283)", () => {
  function runCli(args: string[], cwd: string) {
    if (!existsSync(DIST_BIN)) return null // dist not built — corpus covers the guards
    const r = spawnSync(process.execPath, [DIST_BIN, ...args], { cwd, encoding: "utf8" })
    return { code: r.status ?? -1, stderr: `${r.stdout}${r.stderr}` }
  }

  test("ios + --emit exec + sdk iphoneos — ConfigError (бинарь устройства не запускается на хосте)", () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "main.tsc"), 'console.log("x")\n')
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "app", version: "0.1.0", type: "executable", main: "main.tsc",
      builds: { app: { profile: "ios", sdk: "iphoneos", emit: "exec", toolchain: "clang" } },
    }))
    const r = runCli(["build", "--build", "app"], dir)
    if (!r) return
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("device binaries need a phone")
  })

  test("ios + --emit binary без пина — отказ #282 с подсказкой @tsclang/ios", () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "main.tsc"), 'console.log("x")\n')
    const r = runCli(["build", "main.tsc", "--platform", "ios", "--emit", "binary", "--out-dir", "out"], dir)
    if (!r) return
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("requires a toolchain 'clang'")
    expect(r.stderr).toContain("install @tsclang/ios")
  })
})
