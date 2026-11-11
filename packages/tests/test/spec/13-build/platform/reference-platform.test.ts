// 4.1 (#275): the reference platform package @tsclang/desktop lives in the
// monorepo (packages/platforms/desktop) and is published into the in-repo
// registry (packages/registry). These tests pin the contract: the catalog
// entry matches the committed archive byte-for-byte (sha256), the archive
// carries a valid platform section + the profile declaration, and the
// crash test replays the clean-machine flow — fresh dir → platform install
// (local catalog fixture pointing at the REAL archive) → build --build
// desktop → the binary runs. Zero network: the https url is asserted
// statically, installs go through a file:// fixture.

import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import { bashLoginArgs, msys2Bash, shQuote, toMsysPath } from "@tsclang/test-engine"
import { parseCatalog } from "../../../../../pm/src/platform-registry.js"
import { validatePlatformSection } from "../../../../../pm/src/platform.js"
import { detectSystemCommand } from "../../../../../pm/src/toolchains.js"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const DIST_BIN = join(ROOT, "packages", "cli", "dist", "index.js")
const PLATFORM_DIR = join(ROOT, "packages", "platforms", "desktop")
const REGISTRY_DIR = join(ROOT, "packages", "registry")
const ARCHIVE = join(REGISTRY_DIR, "archives", "@tsclang-desktop-0.1.0.tspkg")

const tmpDirs: string[] = []
function mkTmp(): string {
  const d = mkdtempSync(join(tmpdir(), "tsc-ref-"))
  tmpDirs.push(d)
  return d
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

function shaText(path: string): string {
  return createHash("sha256").update(readFileSync(path, "utf8"), "utf8").digest("hex")
}

// ── source package in the monorepo ─────────────────────────────────────────

describe("13-build/platform 4.1 — эталон packages/platforms/desktop (#275)", () => {
  test("манифест валиден: platform-секция, профиль, пресет билда", () => {
    const manifest = JSON.parse(readFileSync(join(PLATFORM_DIR, "tsc.package.json"), "utf8"))
    expect(manifest.name).toBe("@tsclang/desktop")
    expect(manifest.type).toBe("platform")
    expect(validatePlatformSection(manifest.platform)).toBe(null)
    expect(manifest.platform.profile).toBe("desktop")
    const build = manifest.platform.builds.desktop
    expect(build.profile).toBe("desktop")
    expect(typeof build.emit).toBe("string")
    expect(typeof manifest.platform.scripts.start).toBe("string")
  })

  test("профиль-декларация едет внутри пакета (index.d.tsc)", () => {
    const dts = readFileSync(join(PLATFORM_DIR, "index.d.tsc"), "utf8")
    expect(dts.includes("declare platform")).toBe(true)
    expect(dts.includes("allocator")).toBe(true)
  })
})

// ── registry catalog ↔ committed archive ───────────────────────────────────

describe("13-build/platform 4.1 — каталог реестра синхронен с архивом (#275)", () => {
  test("catalog.json валиден; запись @tsclang/desktop указывает на https нашего репо", () => {
    const catalog = parseCatalog(readFileSync(join(REGISTRY_DIR, "catalog.json"), "utf8"))
    const entry = catalog.packages.find((p) => p.name === "@tsclang/desktop")
    expect(entry !== undefined).toBe(true)
    expect(entry!.type).toBe("platform")
    expect(entry!.version).toBe("0.1.0")
    expect(entry!.location?.url.startsWith("https://raw.githubusercontent.com/tsclang/tsclang/")).toBe(true)
    expect(/^[0-9a-f]{64}$/.test(entry!.location?.sha256 ?? "")).toBe(true)
  })

  test("коммитнутый .tspkg: sha совпадает с каталогом, состав валиден", () => {
    const catalog = parseCatalog(readFileSync(join(REGISTRY_DIR, "catalog.json"), "utf8"))
    const entry = catalog.packages.find((p) => p.name === "@tsclang/desktop")!
    expect(existsSync(ARCHIVE)).toBe(true)
    expect(shaText(ARCHIVE)).toBe(entry.location!.sha256)
    const archive = JSON.parse(readFileSync(ARCHIVE, "utf8"))
    expect(archive.name).toBe("@tsclang/desktop")
    expect(archive.version).toBe("0.1.0")
    expect(typeof archive.files["tsc.package.json"]).toBe("string")
    expect(typeof archive.files["index.d.tsc"]).toBe("string")
    const manifest = JSON.parse(archive.files["tsc.package.json"])
    expect(validatePlatformSection(manifest.platform)).toBe(null)
  })

  test("архив не протух: platform-секция совпадает с исходником в монорепо", () => {
    const archive = JSON.parse(readFileSync(ARCHIVE, "utf8"))
    const manifest = JSON.parse(archive.files["tsc.package.json"])
    const source = JSON.parse(readFileSync(join(PLATFORM_DIR, "tsc.package.json"), "utf8"))
    expect(JSON.stringify(manifest.platform)).toBe(JSON.stringify(source.platform))
    expect(archive.files["index.d.tsc"]).toBe(readFileSync(join(PLATFORM_DIR, "index.d.tsc"), "utf8"))
  })
})

// ── e2e crash test: clean machine → install → build → run ──────────────────

function runCli(args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }): Promise<{ code: number; stdout: string; stderr: string }> {
  // On win32 MSYS2 gcc compiles only from a login bash (cc1 needs the MSYS2
  // runtime; a direct spawn dies with status 1 and empty stderr) — the corpus
  // runner does the same (test-engine compilers/msys2.ts).
  const bash = process.platform === "win32" ? msys2Bash() : null
  const argv: string[] = []
  let cmd: string
  if (bash) {
    const script = `cd ${shQuote(toMsysPath(opts.cwd))} && ${shQuote(toMsysPath(process.execPath))} ${shQuote(toMsysPath(DIST_BIN))} ${args.map(shQuote).join(" ")}`
    cmd = bash
    argv.push(...bashLoginArgs(script))
  } else {
    cmd = process.execPath
    argv.push(DIST_BIN, ...args)
  }
  return new Promise((resolveFn, reject) => {
    const proc = spawn(cmd, argv, { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("runCli timeout")) }, 60000)
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString() })
    proc.on("error", (e) => { clearTimeout(timer); reject(e) })
    proc.on("close", (code) => { clearTimeout(timer); resolveFn({ code: code ?? -1, stdout, stderr }) })
  })
}

describe("13-build/platform 4.1 — краш-тест: чистая машина → hello-world (#275)", () => {
  test("install добавляет пресеты; build --build desktop компилирует и запускает", async () => {
    const dir = mkTmp()
    const home = mkTmp()
    // A user project: a manifest with main (install will add builds/scripts)
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "@demo/hello", version: "0.1.0", main: "hello.tsc",
    }, null, 2), "utf8")
    writeFileSync(join(dir, "hello.tsc"), 'function main(): void {\n    console.log("hello desktop");\n}\n\nmain();\n', "utf8")
    // Local catalog fixture: the REAL catalog with the url pointed at the
    // REAL committed archive (same bytes — sha still matches)
    const catalog = JSON.parse(readFileSync(join(REGISTRY_DIR, "catalog.json"), "utf8"))
    catalog.packages.find((p: { name: string }) => p.name === "@tsclang/desktop").location.url =
      `file://${ARCHIVE.replace(/\\/g, "/")}`
    const fixture = join(dir, "catalog.json")
    writeFileSync(fixture, JSON.stringify(catalog), "utf8")
    const env = {
      ...process.env,
      TSC_HOME: home,
      TSC_REGISTRY: fixture,
      TSC_TOOLCHAINS: "never",
      TSC_CATALOG_CACHE: join(home, "catalog-cache.json"),
    }

    const install = await runCli(["platform", "install", "@tsclang/desktop"], { cwd: dir, env })
    expect(install.code).toBe(0)
    expect(install.stdout).toContain("Installed @tsclang/desktop@0.1.0")
    // The package profile travels into tsc_packages and overrides built-ins
    expect(existsSync(join(dir, "tsc_packages", "@tsclang", "desktop", "index.d.tsc"))).toBe(true)
    const manifest = JSON.parse(readFileSync(join(dir, "tsc.package.json"), "utf8"))
    expect(typeof manifest.builds.desktop).toBe("object")
    expect(typeof manifest.scripts["desktop:start"]).toBe("string")

    if (!detectSystemCommand("gcc")) {
      // Crash part needs gcc; the install contract above is machine-independent
      process.stdout.write("    (gcc not found — crash run part skipped on this machine)\n")
      return
    }
    const build = await runCli(["build", "--build", "desktop"], { cwd: dir, env })
    expect(build.code).toBe(0)
    expect(build.stdout).toContain("hello desktop")
  })
})
