// Android platform tier (#283): the built-in profile capabilities, the emit
// model (so = the android library rung), the NDK compile-args contract shared
// by every caller (CLI build, test-engine backend, cmake), and the CLI guards
// (--emit so is android-only; an android executable never runs on the host).
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import { loadProfile } from "../../../../../cli/src/cli/profile-loader.js"
import { TARGET_NAMES, EMIT_VALUES, buildNdkCompileArgs, ANDROID_TARGET_FLAG, ANDROID_ABI_TRIPLES } from "../../../../../shared/src/index.js"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const BUILTIN_PROFILES = join(ROOT, "packages", "compiler", "src", "profiles")
const DIST_BIN = join(ROOT, "packages", "cli", "dist", "index.js")

const tmpDirs: string[] = []
function mkTmp(): string {
  const d = mkdtempSync(join(tmpdir(), "tsc-andr-"))
  tmpDirs.push(d)
  return d
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

// ── встроенный профиль ───────────────────────────────────────────────────────

describe("13-build/platform android — встроенный профиль (#283)", () => {
  test("loadProfile('android') даёт bionic-таргет с тулчейном ndk-clang", () => {
    const caps = loadProfile("android", BUILTIN_PROFILES, join(mkTmp(), "main.tsc"))
    expect(caps).not.toBe(null)
    expect(caps!.toolchain).toBe("ndk-clang")
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

  test("android входит в TARGET_NAMES, so — в EMIT_VALUES", () => {
    expect(TARGET_NAMES.includes("android")).toBe(true)
    expect(EMIT_VALUES.includes("so")).toBe(true)
  })
})

// ── argv-контракт NDK-компиляции ─────────────────────────────────────────────

describe("13-build/platform android — buildNdkCompileArgs (#283)", () => {
  test("исполняемый файл: PIE, -lm, -std=c11 — и никогда -lpthread (bionic: pthread в libc с API 24)", () => {
    const argv = buildNdkCompileArgs({ cPath: "out/main.c", outPath: "out/main", runtimeInclude: "rt" })
    expect(JSON.stringify(argv)).toBe(JSON.stringify([
      "out/main.c", "-o", "out/main",
      "-I", "rt",
      ANDROID_TARGET_FLAG,
      "-fPIE", "-pie",
      "-lm", "-std=c11",
    ]))
    expect(argv.includes("-lpthread")).toBe(false)
  })

  test("shared-библиотека: -shared -fPIC вместо PIE", () => {
    const argv = buildNdkCompileArgs({ cPath: "in.c", outPath: "lib.so", runtimeInclude: "rt", shared: true })
    expect(argv).toContain("-shared")
    expect(argv).toContain("-fPIC")
    expect(argv.includes("-fPIE")).toBe(false)
    expect(argv.includes("-pie")).toBe(false)
  })

  test("изолированный бандл добавляет --sysroot после --target; оптимизация и дефайны сохраняются", () => {
    const argv = buildNdkCompileArgs({
      cPath: "in.c", outPath: "out/main", runtimeInclude: "rt",
      sysroot: "bund/sysroot", optimize: "Os", defines: ["-DTSX=1"],
    })
    expect(argv).toContain("--sysroot")
    expect(argv[argv.indexOf("--sysroot") + 1]).toBe("bund/sysroot")
    expect(argv.indexOf("--sysroot")).toBe(argv.indexOf(ANDROID_TARGET_FLAG) + 1)
    expect(argv).toContain("-Os")
    expect(argv).toContain("-DTSX=1")
  })

  test("targetFlag переопределяется для эмуляторов (x86_64) — карта ABI→triple", () => {
    const argv = buildNdkCompileArgs({
      cPath: "in.c", outPath: "out/main", runtimeInclude: "rt",
      targetFlag: `--target=${ANDROID_ABI_TRIPLES["x86_64"]}24`,
    })
    expect(argv).toContain("--target=x86_64-linux-android24")
    expect(ANDROID_ABI_TRIPLES["arm64-v8a"]).toBe("aarch64-linux-android")
  })
})

// ── CLI guards (dist e2e) ────────────────────────────────────────────────────

describe("13-build/platform android — guards CLI (#283)", () => {
  function runCli(args: string[], cwd: string) {
    if (!existsSync(DIST_BIN)) return null // dist not built — corpus covers the guards
    const r = spawnSync(process.execPath, [DIST_BIN, ...args], { cwd, encoding: "utf8" })
    return { code: r.status ?? -1, stderr: `${r.stdout}${r.stderr}` }
  }

  test("--emit so без android — ConfigError", () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "main.tsc"), 'console.log("x")\n')
    const r = runCli(["build", "main.tsc", "--emit", "so"], dir)
    if (!r) return
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("--emit so requires the android target")
  })

  test("android + --emit exec — ConfigError (бинарь не запускается на хосте)", () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "main.tsc"), 'console.log("x")\n')
    const r = runCli(["build", "main.tsc", "--platform", "android", "--emit", "exec"], dir)
    if (!r) return
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("android binaries need a device")
  })
})
