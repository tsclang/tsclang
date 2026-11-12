// 2.2 (#271): the build consumes the isolated platform toolchain cache —
// parseToolchainSpec / findIsolatedToolchain / versionMatches / resolveToolchain
// units, plus profile extras (toolchainFile / include) resolved from the
// profile package and an e2e where a pinned toolchain lands in the generated
// CMakeLists.txt as an absolute path.

import { spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import {
  findIsolatedToolchain, parseToolchainSpec, resolveToolchain, resolveProfileExtras,
  versionMatches,
} from "../../../../../pm/src/toolchains.js"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const DIST_BIN = join(ROOT, "packages", "cli", "dist", "index.js")
const SRC_BIN = join(ROOT, "packages", "cli", "src", "index.ts")
const USE_TSX = !existsSync(DIST_BIN)
const TSX_LOADER = new URL(`file://${join(ROOT, "node_modules", "tsx", "dist", "esm", "index.mjs")}`).href

const tmpDirs: string[] = []
function mkTmp(): string {
  const d = mkdtempSync(join(tmpdir(), "tsc-tcr-"))
  tmpDirs.push(d)
  return d
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

// ── parseToolchainSpec ───────────────────────────────────────────────────────

describe("13-build/platform 2.2 — parseToolchainSpec (#271)", () => {
  test("'avr-gcc@12.1' → имя + пиннед версия; 'gcc' → только имя", () => {
    expect(JSON.stringify(parseToolchainSpec("avr-gcc@12.1"))).toBe(JSON.stringify({ name: "avr-gcc", version: "12.1" }))
    expect(JSON.stringify(parseToolchainSpec("gcc"))).toBe(JSON.stringify({ name: "gcc" }))
    expect(parseToolchainSpec("gcc").version).toBe(undefined)
  })
})

// ── findIsolatedToolchain ────────────────────────────────────────────────────

describe("13-build/platform 2.2 — findIsolatedToolchain (#271)", () => {
  function makeCache(home: string, entries: Array<[platform: string, toolchain: string, bin: boolean]>): void {
    for (const [platform, tc, bin] of entries) {
      const dir = join(home, ".tsclang", "platforms", platform, tc)
      mkdirSync(bin ? join(dir, "bin") : dir, { recursive: true })
      writeFileSync(join(bin ? join(dir, "bin") : dir, `${tc.split("@")[0]}-stub`), "", "utf8")
    }
  }

  test("кеш платформы: bin-каталог найден, версия прочитана из имени", () => {
    const home = mkTmp()
    makeCache(home, [["nes-zxdev@0.3.1", "z88dk@2.2.0", true]])
    const iso = findIsolatedToolchain("z88dk", { home })
    expect(iso?.version).toBe("2.2.0")
    expect(iso?.binDir).toBe(join(home, ".tsclang", "platforms", "nes-zxdev@0.3.1", "z88dk@2.2.0", "bin"))
  })

  test("несколько версий — новейшая; пиннед версия — точная", () => {
    const home = mkTmp()
    makeCache(home, [
      ["nes-zxdev@0.3.1", "z88dk@2.2.0", true],
      ["nes-zxdev@0.3.1", "z88dk@2.3.1", true],
      ["nes-zxdev@0.3.1", "z88dk@1.9.4", true],
    ])
    expect(findIsolatedToolchain("z88dk", { home })?.version).toBe("2.3.1")
    expect(findIsolatedToolchain("z88dk", { home, version: "2.2.0" })?.version).toBe("2.2.0")
    expect(findIsolatedToolchain("z88dk", { home, version: "9.9.9" })).toBe(null)
  })

  test("без bin/ — корень тулчейна; пустой кеш → null", () => {
    const home = mkTmp()
    makeCache(home, [["nes-zxdev@0.3.1", "z88dk@2.2.0", false]])
    expect(findIsolatedToolchain("z88dk", { home })?.binDir).toBe(join(home, ".tsclang", "platforms", "nes-zxdev@0.3.1", "z88dk@2.2.0"))
    expect(findIsolatedToolchain("z88dk", { home: mkTmp() })).toBe(null)
  })
})

// ── findIsolatedToolchain: tools shipped inside another toolchain's bundle ───
// A bundle is a set of tools in one bin/ (avr-gcc ships avr-objcopy, avr-as…);
// a tool with no bundle of its own resolves to the bundle whose bin/ has it.

describe("13-build/platform 2.2 — findIsolatedToolchain: bundled tools (#278)", () => {
  function makeBundle(home: string, platform: string, tc: string, tools: string[]): void {
    const bin = join(home, ".tsclang", "platforms", platform, tc, "bin")
    mkdirSync(bin, { recursive: true })
    for (const tool of tools) {
      const file = join(bin, process.platform === "win32" ? `${tool}.exe` : tool)
      writeFileSync(file, "", "utf8")
    }
  }

  test("инструмент без своего бандла резолвится в bin/ бандла-хозяина", () => {
    const home = mkTmp()
    makeBundle(home, "avr@0.2.0", "avr-gcc@16.1.0", ["avr-gcc", "avr-objcopy", "avr-as"])
    const iso = findIsolatedToolchain("avr-objcopy", { home })
    expect(iso?.version).toBe("16.1.0")
    expect(iso?.binDir).toBe(join(home, ".tsclang", "platforms", "avr@0.2.0", "avr-gcc@16.1.0", "bin"))
  })

  test("собственный бандл инструмента выигрывает у содержащего", () => {
    const home = mkTmp()
    makeBundle(home, "avr@0.2.0", "avr-gcc@16.1.0", ["avr-gcc", "avr-objcopy"])
    makeBundle(home, "other@1.0.0", "avr-objcopy@12.0.0", ["avr-objcopy"])
    expect(findIsolatedToolchain("avr-objcopy", { home })?.version).toBe("12.0.0")
  })

  test("несколько содержащих бандлов — новейшая версия; пин — точная версия бандла", () => {
    const home = mkTmp()
    makeBundle(home, "avr@0.2.0", "avr-gcc@16.1.0", ["avr-gcc", "avr-objcopy"])
    makeBundle(home, "avr@0.2.0", "avr-gcc@15.0.0", ["avr-gcc", "avr-objcopy"])
    expect(findIsolatedToolchain("avr-objcopy", { home })?.version).toBe("16.1.0")
    expect(findIsolatedToolchain("avr-objcopy", { home, version: "15.0.0" })?.version).toBe("15.0.0")
    expect(findIsolatedToolchain("avr-objcopy", { home, version: "9.9.9" })).toBe(null)
  })

  test("бандл без нужного бинарника — не кандидат", () => {
    const home = mkTmp()
    makeBundle(home, "avr@0.2.0", "avr-gcc@16.1.0", ["avr-gcc"])
    expect(findIsolatedToolchain("avr-objcopy", { home })).toBe(null)
  })

  test("resolveToolchain: bundled tool → isolated, без PATH-пробы", () => {
    const home = mkTmp()
    makeBundle(home, "avr@0.2.0", "avr-gcc@16.1.0", ["avr-gcc", "avr-objcopy"])
    let probed = false
    const r = resolveToolchain("avr-objcopy", {
      home,
      probeVersion: () => { probed = true; return "x" },
    })
    expect(r && r.kind === "isolated" ? r.kind : "").toBe("isolated")
    expect(probed).toBe(false)
  })
})

// ── versionMatches + resolveToolchain ────────────────────────────────────────

describe("13-build/platform 2.2 — resolveToolchain (#271)", () => {
  test("versionMatches: сегментная граница, не подстрока", () => {
    expect(versionMatches("avr-gcc (GCC) 12.1.0", "12.1")).toBe(true)
    expect(versionMatches("avr-gcc (GCC) 12.10.0", "12.1")).toBe(false)
    expect(versionMatches("z88dk 2.2.0", "2.2")).toBe(true)
  })

  test("кеш платформы выигрывает у PATH", () => {
    const home = mkTmp()
    mkdirSync(join(home, ".tsclang", "platforms", "nes-zxdev@0.3.1", "z88dk@2.2.0", "bin"), { recursive: true })
    let pathProbed = false
    const r = resolveToolchain("z88dk", {
      home,
      probeVersion: () => { pathProbed = true; return "1.0.0" },
    })
    expect(r?.kind).toBe("isolated")
    expect(pathProbed).toBe(false) // cache wins without touching PATH
  })

  test("пиннед + allowPath: PATH с совпавшей версией; не совпала → null (#282: PATH — только явный тулчейн)", () => {
    const r1 = resolveToolchain("avr-gcc", {
      allowPath: true,
      version: "12.1",
      probeVersion: () => "avr-gcc (GCC) 12.1.0",
    })
    expect(r1?.kind).toBe("path")
    const r2 = resolveToolchain("avr-gcc", {
      allowPath: true,
      version: "12.1",
      probeVersion: () => "avr-gcc (GCC) 13.2.0",
    })
    expect(r2).toBe(null)
  })

  test("allowPath без пина: PATH принимается без проверки версии; не запускается → null", () => {
    const r = resolveToolchain("gcc", { allowPath: true, probeVersion: () => "gcc (whatever) 0.0-custom-build" })
    expect(r?.kind).toBe("path")
    const missing = resolveToolchain("gcc", { allowPath: true, probeVersion: () => null })
    expect(missing).toBe(null)
  })
})

// ── #282: bare tsclang never compiles with a silently picked toolchain ──────
// The isolated platform cache is the only DEFAULT source; PATH is probed
// exclusively for an EXPLICIT reference the user wrote (a pinned
// builds.<n>.toolchain or a profile capability → allowPath from the caller).

describe("13-build/platform — resolveToolchain isolated-only default (#282)", () => {
  test("дефолт: пустой кеш → null, PATH не пробуется", () => {
    let probed = false
    const r = resolveToolchain("clang", {
      home: mkTmp(),
      probeVersion: () => { probed = true; return "clang version 18.1.0" },
    })
    expect(r).toBe(null)
    expect(probed).toBe(false)
  })

  test("дефолт: кеш найден → isolated, PATH не трогаем", () => {
    const home = mkTmp()
    mkdirSync(join(home, ".tsclang", "platforms", "desktop@0.4.0", "clang@18.1.0", "bin"), { recursive: true })
    let probed = false
    const r = resolveToolchain("clang", { home, probeVersion: () => { probed = true; return "x" } })
    expect(r?.kind).toBe("isolated")
    expect(probed).toBe(false)
  })

  test("пин с версией без allowPath: даже совпавшая PATH-версия не принимается", () => {
    const r = resolveToolchain("gcc", {
      home: mkTmp(),
      version: "13.2",
      probeVersion: () => "gcc (GCC) 13.2.0",
    })
    expect(r).toBe(null)
  })
})

// ── profile extras: toolchainFile / include ─────────────────────────────────

describe("13-build/platform 2.2 — resolveProfileExtras (#271)", () => {
  test("относительные пути резолвятся от каталога профиля, абсолютные — как есть", () => {
    const src = join(mkTmp(), "tsc_packages", "@nes", "zxdev")
    const r = resolveProfileExtras(
      { toolchainFile: "z88dk.cmake", include: "include" },
      src,
    )
    expect(r.toolchainFile).toBe(join(src, "z88dk.cmake"))
    expect(JSON.stringify(r.includeDirs)).toBe(JSON.stringify([join(src, "include")]))
    const abs = resolveProfileExtras({ toolchainFile: "C:\\x\\t.cmake", include: "/usr/inc" }, src)
    expect(abs.toolchainFile).toBe("C:\\x\\t.cmake")
    expect(JSON.stringify(abs.includeDirs)).toBe(JSON.stringify(["/usr/inc"]))
  })

  test("include может быть списком; пустые caps → пустой результат", () => {
    const src = mkTmp()
    const r = resolveProfileExtras({ include: ["a", "b"] as unknown as string }, src)
    expect(JSON.stringify(r.includeDirs)).toBe(JSON.stringify([join(src, "a"), join(src, "b")]))
    const empty = resolveProfileExtras({}, src)
    expect(empty.includeDirs.length).toBe(0)
    expect(empty.toolchainFile).toBe(undefined)
  })
})

// ── e2e: pinned toolchain → absolute path in generated CMakeLists.txt ───────

function runCli(args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveFn, reject) => {
    const argv = USE_TSX ? ["--import", TSX_LOADER, SRC_BIN, ...args] : [DIST_BIN, ...args]
    const proc = spawn(process.execPath, argv, { cwd: opts.cwd ?? ROOT, env: opts.env, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("runCli timeout")) }, 60000)
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString() })
    proc.on("error", (e) => { clearTimeout(timer); reject(e) })
    proc.on("close", (code) => { clearTimeout(timer); resolveFn({ code: code ?? -1, stdout, stderr }) })
  })
}

describe("13-build/platform 2.2 — e2e: build consumes the isolated cache (#271)", () => {
  test("pinned builds.toolchain → абсолютный путь из кеша в CMakeLists.txt; toolchainFile/include профиля — в тексте", async () => {
    const dir = mkTmp()
    const home = mkTmp()
    // isolated toolchain cache: gcc@13.2.0 under a platform dir
    const gccBin = join(home, ".tsclang", "platforms", "desktop@1.2.0", "gcc@13.2.0", "bin")
    mkdirSync(gccBin, { recursive: true })

    // a profile package with toolchainFile + include capabilities
    const pkgDir = join(dir, "tsc_packages", "@tsclang", "deskfake")
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, "index.d.tsc"),
      "declare platform {\n  target: \"desktop\"\n  toolchain: \"gcc\"\n  toolchainFile: \"deskfake.cmake\"\n  include: \"include\"\n}\n", "utf8")
    writeFileSync(join(pkgDir, "deskfake.cmake"), "# deskfake toolchain\n", "utf8")
    mkdirSync(join(pkgDir, "include"), { recursive: true })
    writeFileSync(join(pkgDir, "tsc.package.json"), JSON.stringify({
      name: "@tsclang/deskfake", version: "1.0.0", type: "platform",
      platform: { profile: "deskfake", builds: { x: { profile: "deskfake", emit: "c" } } },
    }, null, 2), "utf8")

    writeFileSync(join(dir, "main.tsc"), "console.log(1)\n", "utf8")
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "consume", version: "0.0.1", type: "package", main: "main.tsc",
      builds: { app: { profile: "deskfake", emit: "cmake", toolchain: "gcc@13.2.0" } },
    }, null, 2), "utf8")

    const r = await runCli(["build", "--build", "app"], { cwd: dir, env: { ...process.env, TSC_HOME: home } })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Built")
    // outDir defaults to '.' → CMakeLists.txt lands next to the manifest
    const cmakePath = join(dir, "CMakeLists.txt")
    expect(existsSync(cmakePath)).toBe(true)
    const { readFileSync } = await import("node:fs")
    const cmake = readFileSync(cmakePath, "utf8")
    // absolute compiler path from the isolated cache (forward slashes for cmake)
    expect(cmake).toContain(gccBin.replace(/\\/g, "/"))
    // profile toolchainFile + include land in the generated text (posix paths)
    expect(cmake).toContain("deskfake.cmake")
    expect(cmake).toContain(join(pkgDir, "include").replace(/\\/g, "/"))
  })
})

// ── e2e: bare tsclang = transpile-only (#282) ────────────────────────────────
// A compiling emit without an explicitly named toolchain (platform or pin)
// fails loud with an instruction — it never silently compiles with whatever
// PATH happens to carry.

describe("13-build/platform — e2e: bare tsclang = transpile-only (#282)", () => {
  test("bare --emit binary без платформы и пина → exit 1 + инструкция, не тихая PATH-сборка", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "main.tsc"), "console.log(1)\n", "utf8")
    const r = await runCli(["build", "main.tsc", "--emit", "binary"], {
      cwd: dir, env: { ...process.env, TSC_HOME: mkTmp() },
    })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("requires a toolchain")
    expect(r.stderr).toContain("platform install @tsclang/desktop")
    expect(r.stderr).toContain("builds.<n>.toolchain")
  })

  test("явный пин имени, которого нет нигде → ConfigError про PATH (явное имя — PATH разрешён)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "main.tsc"), "console.log(1)\n", "utf8")
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "p", version: "0.0.1", type: "package", main: "main.tsc",
      builds: { app: { emit: "binary", toolchain: "tsc-fake-cc" } },
    }, null, 2), "utf8")
    const r = await runCli(["build", "--build", "app"], {
      cwd: dir, env: { ...process.env, TSC_HOME: mkTmp(), PATH: "", Path: "" },
    })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("requires tsc-fake-cc in PATH")
  })

  test("cmake-emit без пина: дефолтный компилятор в CMakeLists.txt — clang", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "main.tsc"), "console.log(1)\n", "utf8")
    const r = await runCli(["build", "main.tsc", "--emit", "cmake"], {
      cwd: dir, env: { ...process.env, TSC_HOME: mkTmp() },
    })
    expect(r.code).toBe(0)
    const cmake = readFileSync(join(dir, "CMakeLists.txt"), "utf8")
    expect(cmake).toContain("clang")
  })
})
