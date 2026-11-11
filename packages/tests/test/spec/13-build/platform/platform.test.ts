// Phase 0.1 (#261): platform manifest section — schema validation, init preset,
// publish archive composition. Unit tests import source; e2e spawns dist.

import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import { validatePlatformSection, platformNames } from "../../../../../pm/src/platform.js"
import { packageGenerate } from "../../../../../pm/src/package.js"
import { collectManifestDiagnostics } from "../../../../../cli/src/cli/commands/config.js"
import { loadProfile } from "../../../../../cli/src/cli/profile-loader.js"

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

// === 0.3 (#263): docker-model name generator — package → build/script/outDir ===

describe("13-build/platform 0.3 — генератор имён: docker-модель (#263)", () => {
  test("официальный scope без префикса: @tsclang/spectrum → build 'spectrum'", () => {
    const n = platformNames("@tsclang/spectrum")
    expect(n).not.toBe(null)
    expect(n!.build).toBe("spectrum")
    expect(n!.script("dev")).toBe("spectrum:dev")
    expect(n!.outDir).toBe("build/spectrum")
  })

  test("чужой scope с префиксом: @someuser/cpc → build 'someuser:cpc'", () => {
    const n = platformNames("@someuser/cpc")
    expect(n).not.toBe(null)
    expect(n!.build).toBe("someuser:cpc")
    expect(n!.script("dev")).toBe("someuser:cpc:dev")
    expect(n!.script("dist")).toBe("someuser:cpc:dist")
    expect(n!.outDir).toBe("build/someuser-cpc")
  })

  test("':' материализуется в '-' только в пути: outDir someuser-cpc", () => {
    const n = platformNames("@someuser/cpc")!
    expect(n.outDir.includes(":")).toBe(false)
    expect(n.outDir).toBe("build/" + n.build.replace(/:/g, "-"))
  })

  test("unscoped имя ведёт себя как официальное: cpc → build 'cpc'", () => {
    const n = platformNames("cpc")
    expect(n!.build).toBe("cpc")
    expect(n!.script("dev")).toBe("cpc:dev")
    expect(n!.outDir).toBe("build/cpc")
  })

  test("имена с дефисами проходят во все позиции", () => {
    const n = platformNames("@someuser/my-cpc")!
    expect(n.build).toBe("someuser:my-cpc")
    expect(n.script("flash-dev")).toBe("someuser:my-cpc:flash-dev")
    expect(n.outDir).toBe("build/someuser-my-cpc")
  })

  test("build-ключ валиден как ключ builds (без слэшей/пробелов)", () => {
    for (const pkgName of ["@tsclang/spectrum", "@someuser/cpc", "cpc", "@tsclang/avr"]) {
      const n = platformNames(pkgName)!
      expect(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(n.build)).toBe(true)
    }
  })

  test("невалидные имена → null (без throw)", () => {
    for (const bad of ["", "@tsclang/", "@/cpc", "@someuser/cpc/sub", "some pkg", "@tsclang/c p c"]) {
      expect(platformNames(bad)).toBe(null)
    }
  })

  test("согласованность с profileNameFromPackage: профиль не префиксуется", () => {
    // The profile inside the package keeps its bare name even for foreign
    // scopes — only builds/scripts carry the owner prefix.
    const n = platformNames("@someuser/cpc")!
    expect(n.build.endsWith(":cpc")).toBe(true)
    expect(n.build.startsWith("cpc")).toBe(false)
  })
})

// === 0.4 (#264): tsc_packages profile overrides the built-in of the same name ===

describe("13-build/platform 0.4 — приоритет профилей: пакет > built-in (#264)", () => {
  const BUILTIN_PROFILES = join(ROOT, "packages", "compiler", "src", "profiles")

  test("tsc_packages-профиль с именем built-in выигрывает (красный → зелёный)", () => {
    const dir = mkTmp()
    // a platform package claiming the built-in profile name 'desktop'
    const pkgDir = join(dir, "tsc_packages", "probe-desktop")
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, "tsc.package.json"), JSON.stringify({
      name: "probe-desktop", version: "1.0.0", type: "platform",
      platform: { profile: "desktop", builds: { desktop: { emit: "c" } } },
    }, null, 2))
    // distinctive capability: 8 bits (built-in desktop is 64)
    writeFileSync(join(pkgDir, "index.d.tsc"), "declare platform {\n  bits: 8\n  allocator: \"static\"\n}\n")
    writeFileSync(join(dir, "main.tsc"), "console.log(\"x\")\n")

    const caps = loadProfile("desktop", BUILTIN_PROFILES, join(dir, "main.tsc"))
    expect(caps).not.toBe(null)
    expect(caps!.bits).toBe(8)
    expect(caps!.allocator).toBe("static")
  })

  test("точный scoped путь tsc_packages/@scope/name/index.d.tsc резолвится", () => {
    const dir = mkTmp()
    const pkgDir = join(dir, "tsc_packages", "@someuser", "cpc")
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, "tsc.package.json"), JSON.stringify({
      name: "@someuser/cpc", version: "1.0.0", type: "platform",
      platform: { profile: "cpc", builds: { cpc: { emit: "c" } } },
    }, null, 2))
    writeFileSync(join(pkgDir, "index.d.tsc"), "declare platform {\n  bits: 8\n}\n")
    writeFileSync(join(dir, "main.tsc"), "console.log(\"x\")\n")

    const caps = loadProfile("@someuser/cpc", BUILTIN_PROFILES, join(dir, "main.tsc"))
    expect(caps).not.toBe(null)
    expect(caps!.bits).toBe(8)
  })

  test("нет пакета-претендента → built-in профиль как раньше", () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "main.tsc"), "console.log(\"x\")\n")
    const caps = loadProfile("desktop", BUILTIN_PROFILES, join(dir, "main.tsc"))
    expect(caps).not.toBe(null)
    expect(caps!.bits).toBe(64)
  })

  test("пакет с чужим именем профиля built-in не перекрывает", () => {
    const dir = mkTmp()
    const pkgDir = join(dir, "tsc_packages", "other-plat")
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, "tsc.package.json"), JSON.stringify({
      name: "other-plat", version: "1.0.0", type: "platform",
      platform: { profile: "z80-probe", builds: { "z80-probe": { emit: "c" } } },
    }, null, 2))
    writeFileSync(join(pkgDir, "index.d.tsc"), "declare platform {\n  bits: 8\n}\n")
    writeFileSync(join(dir, "main.tsc"), "console.log(\"x\")\n")

    // 'desktop' does not match the package's profile 'z80-probe' → built-in
    const caps = loadProfile("desktop", BUILTIN_PROFILES, join(dir, "main.tsc"))
    expect(caps!.bits).toBe(64)
  })
})

// === 1.0 (#265): dispatcher — nested `platform` command group ===

describe("13-build/platform 1.0 — диспетчер: группа platform (#265)", () => {
  test("`platform` без подкоманды — help группы, exit 0", async () => {
    const r = await runCli(["platform"], { cwd: mkTmp() })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("tsclang platform <command>")
    for (const sub of ["install", "search", "remove", "list"]) {
      expect(r.stdout.includes(sub)).toBe(true)
    }
  })

  test("`platform --help` — тот же help группы", async () => {
    const r = await runCli(["platform", "--help"], { cwd: mkTmp() })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("tsclang platform <command>")
  })

  test("`platform <неизвестная>` — ошибка именно о подкоманде, exit 1", async () => {
    const r = await runCli(["platform", "frobnicate"], { cwd: mkTmp() })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("unknown platform command 'frobnicate'")
  })

  test("`platform --bogus` — unknown option для platform, не unknown command", async () => {
    const r = await runCli(["platform", "--bogus"], { cwd: mkTmp() })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("unknown option '--bogus' for 'platform'")
  })

  test("флаги подкоманд валидируются по своей подкоманде (#244-механика)", async () => {
    for (const sub of ["install", "search", "remove", "list"]) {
      const r = await runCli(["platform", sub, "--bogus"], { cwd: mkTmp() })
      expect(r.code).toBe(1)
      expect(r.stderr).toContain(`unknown option '--bogus' for 'platform ${sub}'`)
    }
  })

  test("`platform install --help` — справка подкоманды (не общий help)", async () => {
    const r = await runCli(["platform", "install", "--help"], { cwd: mkTmp() })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("tsclang platform install")
  })

  test("главный help-листинг содержит строку platform", async () => {
    const r = await runCli(["--help"])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/platform\s+/)
  })
})
