// Phase 0.1 (#261): platform manifest section — schema validation, init preset,
// publish archive composition. Unit tests import source; e2e spawns dist.

import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import { validatePlatformSection } from "../../../../../pm/src/platform.js"
import { packageGenerate } from "../../../../../pm/src/package.js"
import { collectManifestDiagnostics } from "../../../../../cli/src/cli/commands/config.js"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const DIST_BIN = join(ROOT, "packages", "cli", "dist", "index.js")
const SRC_BIN = join(ROOT, "packages", "cli", "src", "index.ts")
const USE_TSX = !existsSync(DIST_BIN)
const TSX_LOADER = new URL(`file://${join(ROOT, "node_modules", "tsx", "dist", "esm", "index.mjs")}`).href

interface CliResult { code: number; stdout: string; stderr: string }

function runCli(args: string[], opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<CliResult> {
  return new Promise((resolveFn, reject) => {
    const argv = USE_TSX ? ["--import", TSX_LOADER, SRC_BIN, ...args] : [DIST_BIN, ...args]
    const proc = spawn(process.execPath, argv, { cwd: opts.cwd ?? ROOT, env: opts.env, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      proc.kill("SIGKILL")
      reject(new Error(`runCli timeout: tsclang ${args.join(" ")}`))
    }, opts.timeoutMs ?? 60000)
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString() })
    proc.on("error", (e) => { clearTimeout(timer); reject(e) })
    proc.on("close", (code) => { clearTimeout(timer); resolveFn({ code: code ?? -1, stdout, stderr }) })
  })
}

const tmpDirs: string[] = []
function mkTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), `tsc-plat-${tmpDirs.length}-`))
  tmpDirs.push(dir)
  return dir
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

const GOOD_SHA = "a".repeat(64)

const validSection = {
  profile: "spectrum",
  toolchains: {
    z88dk: {
      version: "2.2.0",
      downloads: {
        "win32-x64": { url: "https://example.com/z88dk.tgz", sha256: GOOD_SHA, size: 84 },
      },
    },
  },
  builds: { spectrum: { profile: "spectrum", emit: "c", outDir: "build/spectrum" } },
  scripts: { dev: "fuse build/spectrum/game.tap" },
}

describe("13-build/platform 0.1 — validatePlatformSection (#261)", () => {
  test("полная валидная секция — null", () => {
    expect(validatePlatformSection(validSection)).toBeNull()
  })

  test("минимальная секция (profile + builds) — null", () => {
    expect(validatePlatformSection({ profile: "desktop", builds: { desktop: { emit: "c" } } })).toBeNull()
  })

  test("не объект — ошибка", () => {
    expect(validatePlatformSection("nope")).toContain("'platform' section must be an object")
    expect(validatePlatformSection(null)).toContain("'platform' section must be an object")
  })

  test("нет profile — ошибка", () => {
    expect(validatePlatformSection({ builds: { x: { emit: "c" } } })).toContain("'platform.profile' must be a non-empty string")
  })

  test("нет builds — ошибка", () => {
    expect(validatePlatformSection({ profile: "x" })).toContain("'platform.builds' must have at least one build preset")
  })

  test("пустой builds — ошибка", () => {
    expect(validatePlatformSection({ profile: "x", builds: {} })).toContain("'platform.builds' must have at least one build preset")
  })

  test("неизвестный ключ в platform.builds — ошибка (тот же VALID_BUILD_KEYS)", () => {
    expect(validatePlatformSection({ profile: "x", builds: { a: { no_such_key: 1 } } })).toContain("unknown key 'no_such_key' in platform.builds.a")
  })

  test("toolchain без version — ошибка", () => {
    const bad = { ...validSection, toolchains: { z88dk: { downloads: validSection.toolchains.z88dk.downloads } } }
    expect(validatePlatformSection(bad)).toContain("toolchains.z88dk.version' must be a non-empty string")
  })

  test("downloads пустой — ошибка", () => {
    const bad = { ...validSection, toolchains: { z88dk: { version: "1.0.0", downloads: {} } } }
    expect(validatePlatformSection(bad)).toContain("at least one download")
  })

  test("downloads без url — ошибка", () => {
    const bad = { ...validSection, toolchains: { z88dk: { version: "1.0.0", downloads: { "win32-x64": { sha256: GOOD_SHA } } } } }
    expect(validatePlatformSection(bad)).toContain("downloads.win32-x64.url' must be a string")
  })

  test("sha256 не 64 hex — ошибка", () => {
    const bad = { ...validSection, toolchains: { z88dk: { version: "1.0.0", downloads: { "win32-x64": { url: "https://x/y.tgz", sha256: "xyz" } } } } }
    expect(validatePlatformSection(bad)).toContain("downloads.win32-x64.sha256' must be 64 hex characters")
  })

  test("scripts не-строка — ошибка", () => {
    const bad = { ...validSection, scripts: { dev: 42 } }
    expect(validatePlatformSection(bad)).toContain("platform.scripts.dev must be a non-empty string")
  })
})

describe("13-build/platform 0.1 — манифест: type ⟺ секция (#261)", () => {
  const manifestOf = (extra: Record<string, unknown>) => ({
    name: "@tsclang/spectrum", version: "1.2.0", type: "platform", ...extra,
  })

  test("type=platform без секции — ошибка requires", () => {
    const d = collectManifestDiagnostics(manifestOf({}))
    expect(d.some((x) => x.includes("platform package requires a 'platform' section"))).toBe(true)
  })

  test("type=executable с секцией — ошибка only allowed", () => {
    const d = collectManifestDiagnostics({
      name: "app", version: "0.1.0", type: "executable", main: "src/main.tsc",
      platform: validSection,
    })
    expect(d.some((x) => x.includes("'platform' section is only allowed for type \"platform\""))).toBe(true)
  })

  test("type=platform + валидная секция — нет ошибок", () => {
    const d = collectManifestDiagnostics(manifestOf({ platform: validSection }))
    expect(d.length).toBe(0)
  })

  test("type=platform + битая секция — ошибка схемы", () => {
    const d = collectManifestDiagnostics(manifestOf({ platform: { profile: "x" } }))
    expect(d.some((x) => x.includes("platform.builds"))).toBe(true)
  })
})

describe("13-build/platform 0.1 — packageGenerate platform-пресет (#261)", () => {
  test("пресет несёт секцию platform c profile и builds", () => {
    const pkg = packageGenerate("myplat", "platform")
    expect(pkg.platform).toBeTruthy()
    expect(pkg.platform!.profile).toBe("myplat")
    expect(Object.keys(pkg.platform!.builds!).length > 0).toBe(true)
    const d = collectManifestDiagnostics(pkg as unknown as Record<string, unknown>)
    expect(d.length).toBe(0)
  })

  test("пресет со scoped-именем — profile без scope", () => {
    const pkg = packageGenerate("@someuser/cpc", "platform")
    expect(pkg.platform!.profile).toBe("cpc")
  })
})

describe("13-build/platform 0.1 — publish: состав архива платформы (#261)", () => {
  test("архив несёт .d.tsc, .h и toolchain.cmake, но не мусор (#261)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "@tsclang/probe-plat", version: "1.0.0", type: "platform",
      platform: { profile: "probe", builds: { probe: { emit: "c", outDir: "build/probe" } } },
    }, null, 2))
    writeFileSync(join(dir, "index.d.tsc"), "declare platform {\n  arch: \"x86-64\"\n}\n")
    mkdirSync(join(dir, "include"))
    writeFileSync(join(dir, "include", "hal.h"), "#pragma once\n")
    writeFileSync(join(dir, "toolchain.cmake"), "set(CMAKE_SYSTEM_NAME Generic)\n")
    writeFileSync(join(dir, "notes.txt"), "must not be packed\n")

    const r = await runCli(["publish"], { cwd: dir })
    expect(r.code).toBe(0)
    const archive = JSON.parse(readFileSync(join(dir, "@tsclang-probe-plat-1.0.0.tspkg"), "utf8"))
    const names = Object.keys(archive.files).sort()
    expect(names.join(",")).toBe("include/hal.h,index.d.tsc,toolchain.cmake,tsc.package.json")
  })
})
