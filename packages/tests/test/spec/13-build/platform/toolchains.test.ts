// 2.1 (#270): toolchain downloader — pure decision core (selectDownload,
// decideToolchain, consent, paths, per-OS instructions), download via DI fetch
// + system tar, and CLI e2e on a file:// toolchain fixture (zero network).

import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import {
  decideToolchain, downloadToolchain, osArchKey,
  platformToolchainDir, readConsent, selectDownload, toolchainInstructions,
  writeConsent,
} from "../../../../../pm/src/toolchains.js"
import type { PlatformToolchain } from "../../../../../pm/src/platform.js"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const DIST_BIN = join(ROOT, "packages", "cli", "dist", "index.js")
const SRC_BIN = join(ROOT, "packages", "cli", "src", "index.ts")
const USE_TSX = !existsSync(DIST_BIN)
const TSX_LOADER = new URL(`file://${join(ROOT, "node_modules", "tsx", "dist", "esm", "index.mjs")}`).href
const FIXTURE_TGZ = join(here, "fixtures", "tscfixt-1.0.0.tar.gz")
const FIXTURE_SHA = createHash("sha256").update(readFileSync(FIXTURE_TGZ)).digest("hex")

const tmpDirs: string[] = []
function mkTmp(): string {
  const d = mkdtempSync(join(tmpdir(), "tsc-tc-"))
  tmpDirs.push(d)
  return d
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

const TC: PlatformToolchain = {
  version: "1.0.0",
  downloads: {
    "win32-x64": { url: "https://example.com/t.tgz", sha256: "a".repeat(64) },
    "linux-x64": { url: "https://example.com/l.tgz", sha256: "b".repeat(64), size: 12 },
    "darwin-arm64": { url: "https://example.com/d.tgz", sha256: "c".repeat(64) },
  },
}

// ── os-arch selection ───────────────────────────────────────────────────────

describe("13-build/platform 2.1 — selectDownload / osArchKey (#270)", () => {
  test("точное совпадение os-arch выбирается", () => {
    expect(selectDownload(TC, "win32", "x64")?.url).toBe("https://example.com/t.tgz")
    expect(selectDownload(TC, "linux", "x64")?.sha256).toBe("b".repeat(64))
    expect(selectDownload(TC, "linux", "x64")?.size).toBe(12)
    expect(selectDownload(TC, "darwin", "arm64")?.url).toBe("https://example.com/d.tgz")
  })

  test("нет записи под платформу → null", () => {
    expect(selectDownload(TC, "linux", "arm64")).toBe(null)
    expect(selectDownload(TC, "sunos", "x64")).toBe(null)
  })

  test("osArchKey текущего процесса", () => {
    expect(osArchKey("win32", "x64")).toBe("win32-x64")
    expect(osArchKey("darwin", "arm64")).toBe("darwin-arm64")
  })
})

// ── install paths ───────────────────────────────────────────────────────────

describe("13-build/platform 2.1 — platformToolchainDir (#270)", () => {
  test("официальный scope — без префикса", () => {
    const dir = platformToolchainDir("@tsclang/desktop", "1.0.0", "gcc", "13.2.0", "/home/T")
    expect(dir).toBe(join("/home/T", ".tsclang", "platforms", "desktop@1.0.0", "gcc@13.2.0"))
  })

  test("чужой scope — build-имя, ':' материализуется в '-'", () => {
    const dir = platformToolchainDir("@nes/zxdev", "0.3.1", "z88dk", "2.2.0", "/home/T")
    expect(dir).toBe(join("/home/T", ".tsclang", "platforms", "nes-zxdev@0.3.1", "z88dk@2.2.0"))
  })
})

// ── decision core ───────────────────────────────────────────────────────────

describe("13-build/platform 2.1 — decideToolchain (#270; #282: система не участвует)", () => {
  const base = { hasDownload: true }

  test("#282: системный тулчейн не ищется и не предлагается — только бандл или инструкция", () => {
    // even with gcc sitting in PATH the decision never mentions the system:
    // a platform is self-sufficient, the toolchain name must equal the content
    const actions = new Set<string>()
    for (const tty of [true, false])
      for (const consent of [undefined, "yes", "no"] as const)
        for (const envPolicy of [undefined, "always", "never"] as const)
          actions.add(decideToolchain({ hasDownload: true, tty, consent, envPolicy }).action)
    expect(JSON.stringify([...actions].sort())).toBe(JSON.stringify(["ask-download", "download", "instruct"]))
  })

  test("env TSC_TOOLCHAINS=always — качать без вопросов; нет сборки под os-arch — инструкция", () => {
    expect(decideToolchain({ ...base, envPolicy: "always" }).action).toBe("download")
    expect(decideToolchain({ hasDownload: false, envPolicy: "always" }).action).toBe("instruct")
  })

  test("env never — инструкция (системный тулчейн больше не вариант)", () => {
    expect(decideToolchain({ ...base, envPolicy: "never" }).action).toBe("instruct")
  })

  test("консент-файл: yes — качать, no — инструкция", () => {
    expect(decideToolchain({ ...base, consent: "yes" }).action).toBe("download")
    expect(decideToolchain({ ...base, consent: "no" }).action).toBe("instruct")
  })

  test("нет консента: TTY — спросить, не-TTY — инструкция (молча, не запоминаем)", () => {
    expect(decideToolchain({ ...base, tty: true }).action).toBe("ask-download")
    expect(decideToolchain({ ...base, tty: false }).action).toBe("instruct")
  })

  test("нет сборки под os-arch — инструкция даже с консентом yes", () => {
    expect(decideToolchain({ hasDownload: false, consent: "yes", tty: true }).action).toBe("instruct")
  })
})

// ── consent storage ─────────────────────────────────────────────────────────

describe("13-build/platform 2.1 — consent file (#270)", () => {
  test("write → read roundtrip; отсутствует → undefined; кривой JSON → undefined", () => {
    const home = mkTmp()
    expect(readConsent(home)).toBe(undefined)
    writeConsent("no", home)
    expect(readConsent(home)).toBe("no")
    writeConsent("yes", home)
    expect(readConsent(home)).toBe("yes")
    writeFileSync(join(home, ".tsclang", "toolchain-consent.json"), "{oops", "utf8")
    expect(readConsent(home)).toBe(undefined)
  })
})

// ── per-OS instructions ─────────────────────────────────────────────────────

describe("13-build/platform 2.1 — toolchainInstructions (#270; #282 clang)", () => {
  test("инструкция per-OS содержит имя тулчейна и пакетный менеджер", () => {
    expect(toolchainInstructions("z88dk", "win32")).toContain("z88dk")
    expect(toolchainInstructions("z88dk", "win32")).toContain("MSYS2")
    expect(toolchainInstructions("z88dk", "linux")).toContain("apt")
    expect(toolchainInstructions("z88dk", "darwin")).toContain("brew")
  })

  test("clang на darwin — Xcode Command Line Tools (darwin-x64 без апстрим-бандла)", () => {
    expect(toolchainInstructions("clang", "darwin")).toContain("xcode-select --install")
  })
})

// ── download: DI fetch + system tar ─────────────────────────────────────────

describe("13-build/platform 2.1 — downloadToolchain (#270)", () => {
  const home = mkTmp()

  function fakeFetch(body: Buffer): typeof fetch {
    return (async () => new Response(body, { status: 200 })) as unknown as typeof fetch
  }

  test("успех: download → tar -xf → файл на месте; повтор — skip без fetch", async () => {
    const body = readFileSync(FIXTURE_TGZ)
    let fetchCalls = 0
    const fetchImpl = (async () => { fetchCalls++; return new Response(body, { status: 200 }) }) as unknown as typeof fetch
    const spec: PlatformToolchain = { version: "1.0.0", downloads: { "win32-x64": { url: "https://x/t.tgz", sha256: FIXTURE_SHA } } }

    const r1 = await downloadToolchain({
      pkgName: "@nes/zxdev", pkgVersion: "0.3.1", toolchain: "tscfixt", spec,
      download: spec.downloads["win32-x64"]!, home, fetchImpl,
    })
    expect(r1.skipped).toBe(false)
    expect(existsSync(join(r1.dir, "bin", "tscfixt"))).toBe(true)
    expect(r1.dir.endsWith(join("nes-zxdev@0.3.1", "tscfixt@1.0.0"))).toBe(true)

    const r2 = await downloadToolchain({
      pkgName: "@nes/zxdev", pkgVersion: "0.3.1", toolchain: "tscfixt", spec,
      download: spec.downloads["win32-x64"]!, home, fetchImpl,
    })
    expect(r2.skipped).toBe(true)
    expect(fetchCalls).toBe(1)
  })

  test("file:// url работает (локальные зеркала/тесты)", async () => {
    const spec: PlatformToolchain = {
      version: "1.0.0",
      downloads: { "win32-x64": { url: `file://${FIXTURE_TGZ.replace(/\\/g, "/")}`, sha256: FIXTURE_SHA } },
    }
    const r = await downloadToolchain({
      pkgName: "@tsclang/desktop", pkgVersion: "1.0.0", toolchain: "tscfixt", spec,
      download: spec.downloads["win32-x64"]!, home,
    })
    expect(existsSync(join(r.dir, "bin", "tscfixt"))).toBe(true)
  })

  test("sha256 мисматч — громкая ошибка до распаковки", async () => {
    const fetchImpl = fakeFetch(readFileSync(FIXTURE_TGZ))
    const bad = { url: "https://x/t.tgz", sha256: "0".repeat(64) }
    const spec: PlatformToolchain = { version: "2.0.0", downloads: { "win32-x64": bad } }
    let threw = ""
    await downloadToolchain({
      pkgName: "@nes/zxdev", pkgVersion: "0.3.1", toolchain: "badtc", spec,
      download: bad, home, fetchImpl,
    }).catch((e: Error) => { threw = e.message })
    expect(threw).toContain("sha256 mismatch")
    expect(existsSync(join(home, ".tsclang", "platforms", "nes-zxdev@0.3.1", "badtc@2.0.0", "bin"))).toBe(false)
  })

  test("офлайн — громкий отказ", async () => {
    const spec: PlatformToolchain = { version: "3.0.0", downloads: { "win32-x64": { url: "https://x/t.tgz", sha256: FIXTURE_SHA } } }
    let threw = ""
    await downloadToolchain({
      pkgName: "@nes/zxdev", pkgVersion: "0.3.1", toolchain: "tscfixt", spec,
      download: spec.downloads["win32-x64"]!, home, offline: true,
    }).catch((e: Error) => { threw = e.message })
    expect(threw).toContain("offline")
  })
})

// ── e2e: platform install with a toolchain ─────────────────────────────────

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

describe("13-build/platform 2.1 — e2e: toolchains via platform install (#270)", () => {
  const TGZ_URL = `file://${FIXTURE_TGZ.replace(/\\/g, "/")}`

  function makeProject(dir: string): void {
    const manifest = {
      name: "@nes/zxdev", version: "0.3.1", type: "platform",
      platform: {
        profile: "zxdev",
        toolchains: { tscfixt: { version: "1.0.0", downloads: { "win32-x64": { url: TGZ_URL, sha256: FIXTURE_SHA }, "linux-x64": { url: TGZ_URL, sha256: FIXTURE_SHA } } } },
        builds: { zxdev: { profile: "zxdev", emit: "c" } },
        scripts: { dev: "tsclang build --build nes:zxdev" },
      },
    }
    const archive = JSON.stringify({
      name: "@nes/zxdev", version: "0.3.1",
      files: { "tsc.package.json": JSON.stringify(manifest, null, 2) + "\n" },
    }, null, 2)
    writeFileSync(join(dir, "nes-zxdev-0.3.1.tspkg"), archive, "utf8")
    writeFileSync(join(dir, "catalog.json"), JSON.stringify({
      version: 1,
      packages: [{
        name: "@nes/zxdev", type: "platform", version: "0.3.1", description: "fixture",
        location: { url: "nes-zxdev-0.3.1.tspkg", sha256: createHash("sha256").update(archive, "utf8").digest("hex") },
      }],
    }), "utf8")
  }

  test("TSC_TOOLCHAINS=always: скачивает изолированно в TSC_HOME; повтор — already installed", async () => {
    const dir = mkTmp()
    const home = mkTmp()
    makeProject(dir)
    const env = {
      ...process.env, TSC_REGISTRY: join(dir, "catalog.json"), TSC_HOME: home,
      TSC_TOOLCHAINS: "always", TSC_CATALOG_CACHE: join(dir, "cache.json"),
    }
    const r1 = await runCli(["platform", "install", "@nes/zxdev"], { cwd: dir, env })
    expect(r1.code).toBe(0)
    expect(r1.stdout).toContain("toolchain tscfixt: downloaded")
    expect(existsSync(join(home, ".tsclang", "platforms", "nes-zxdev@0.3.1", "tscfixt@1.0.0", "bin", "tscfixt"))).toBe(true)

    const r2 = await runCli(["platform", "install", "@nes/zxdev"], { cwd: dir, env })
    expect(r2.code).toBe(0)
    expect(r2.stdout).toContain("toolchain tscfixt: already installed")
  })

  test("TSC_TOOLCHAINS=never: инструкция вместо скачивания, ничего не скачано", async () => {
    const dir = mkTmp()
    const home = mkTmp()
    makeProject(dir)
    const r = await runCli(["platform", "install", "@nes/zxdev"], {
      cwd: dir,
      env: {
        ...process.env, TSC_REGISTRY: join(dir, "catalog.json"), TSC_HOME: home,
        TSC_TOOLCHAINS: "never", TSC_CATALOG_CACHE: join(dir, "cache.json"),
      },
    })
    expect(r.code).toBe(0)
    expect(r.stdout + r.stderr).toContain("tscfixt")
    expect(r.stdout + r.stderr).toMatch(/manual|instruction/i)
    expect(existsSync(join(home, ".tsclang", "platforms"))).toBe(false)
  })
})
