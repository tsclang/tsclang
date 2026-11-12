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

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const DIST_BIN = join(ROOT, "packages", "cli", "dist", "index.js")
const PLATFORMS_ROOT = join(ROOT, "packages", "platforms")
const REGISTRY_DIR = join(ROOT, "packages", "registry")

// The reference platform set (#275 desktop, #276 avr + wasm): package
// source dir in the monorepo, published archive name in
// packages/registry/archives, toolchain names the builds resolve through
// findIsolatedToolchain. Since #282 phase 4 desktop ships clang/LLVM-only
// bundles (0.4.0, release tag toolchains-v2); avr/wasm stay on the
// original 0.3.0 / toolchains-v1 matrix — their content did not change.
const REFERENCE_PLATFORMS = [
  { name: "@tsclang/desktop", dir: "desktop", version: "0.4.0", file: "@tsclang-desktop-0.4.0.tspkg", repo: "platform-desktop", tag: "toolchains-v2", toolchains: ["clang"] },
  { name: "@tsclang/avr", dir: "avr", version: "0.3.0", file: "@tsclang-avr-0.3.0.tspkg", repo: "platform-avr", tag: "toolchains-v1", toolchains: ["avr-gcc", "avrdude"] },
  { name: "@tsclang/wasm", dir: "wasm", version: "0.3.0", file: "@tsclang-wasm-0.3.0.tspkg", repo: "platform-wasm", tag: "toolchains-v1", toolchains: ["emcc"] },
] as const

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

// ── source packages in the monorepo ────────────────────────────────────────

describe("13-build/platform 4.1 — эталонные пакеты в монорепо (#275, #276)", () => {
  for (const ref of REFERENCE_PLATFORMS) {
    test(`${ref.name}: манифест валиден — platform-секция, профиль, пресет билда`, () => {
      const manifest = JSON.parse(readFileSync(join(PLATFORMS_ROOT, ref.dir, "tsc.package.json"), "utf8"))
      expect(manifest.name).toBe(ref.name)
      expect(manifest.type).toBe("platform")
      expect(validatePlatformSection(manifest.platform)).toBe(null)
      expect(manifest.platform.profile).toBe(ref.dir)
      const preset = Object.values(manifest.platform.builds)[0] as { profile: string; emit: string }
      expect(preset.profile).toBe(ref.dir)
      expect(typeof preset.emit).toBe("string")
    })

    test(`${ref.name}: профиль-декларация едет внутри пакета (index.d.tsc)`, () => {
      const dts = readFileSync(join(PLATFORMS_ROOT, ref.dir, "index.d.tsc"), "utf8")
      expect(dts.includes("declare platform")).toBe(true)
    })

    test(`${ref.name}: тулчейны едут комплектом — секция toolchains с бандлами нашего релиза (#278)`, () => {
      const manifest = JSON.parse(readFileSync(join(PLATFORMS_ROOT, ref.dir, "tsc.package.json"), "utf8"))
      const toolchains = manifest.platform.toolchains as Record<string, { version: string; downloads: Record<string, { url: string; sha256: string; size?: number }> }>
      expect(JSON.stringify(Object.keys(toolchains).sort())).toBe(JSON.stringify([...ref.toolchains].sort()))
      for (const [tcName, tc] of Object.entries(toolchains)) {
        expect(typeof tc.version).toBe("string")
        const dl = tc.downloads["win32-x64"]
        expect(dl !== undefined).toBe(true)
        // Bundles are hosted on OUR platform repos' GitHub releases — never
        // direct upstream links (sha256 contract: upstream re-uploads must
        // not break users).
        expect(dl.url.startsWith(`https://github.com/tsclang/${ref.repo}/releases/download/${ref.tag}/`)).toBe(true)
        expect(dl.url.endsWith(".tar.gz")).toBe(true)
        expect(/^[0-9a-f]{64}$/.test(dl.sha256)).toBe(true)
        expect(typeof dl.size === "number" && dl.size > 0).toBe(true)
        // Matrix: every toolchain covers at least win32-x64 + linux-x64
        // (darwin-x64 is partial — Intel Macs get system/brew instructions)
        const keys = Object.keys(tc.downloads)
        expect(keys.includes("win32-x64") && keys.includes("linux-x64")).toBe(true)
      }
    })
  }
})

// ── registry catalog ↔ committed archive ───────────────────────────────────

describe("13-build/platform 4.1 — каталог реестра синхронен с архивами (#275, #276)", () => {
  test("catalog.json валиден; каждая запись указывает на https нашего репо + sha256", () => {
    const catalog = parseCatalog(readFileSync(join(REGISTRY_DIR, "catalog.json"), "utf8"))
    expect(catalog.packages.length).toBe(REFERENCE_PLATFORMS.length)
    for (const ref of REFERENCE_PLATFORMS) {
      const entry = catalog.packages.find((p) => p.name === ref.name)
      expect(entry !== undefined).toBe(true)
      expect(entry!.type).toBe("platform")
      expect(entry!.version).toBe(ref.version)
      expect(entry!.location?.url.startsWith("https://raw.githubusercontent.com/tsclang/tsclang/")).toBe(true)
      expect(/^[0-9a-f]{64}$/.test(entry!.location?.sha256 ?? "")).toBe(true)
    }
  })

  test("коммитнутые .tspkg: sha совпадает с каталогом, состав валиден", () => {
    const catalog = parseCatalog(readFileSync(join(REGISTRY_DIR, "catalog.json"), "utf8"))
    for (const ref of REFERENCE_PLATFORMS) {
      const entry = catalog.packages.find((p) => p.name === ref.name)!
      const archivePath = join(REGISTRY_DIR, "archives", ref.file)
      expect(existsSync(archivePath)).toBe(true)
      expect(shaText(archivePath)).toBe(entry.location!.sha256)
      const archive = JSON.parse(readFileSync(archivePath, "utf8"))
      expect(archive.name).toBe(ref.name)
      expect(archive.version).toBe(ref.version)
      expect(typeof archive.files["tsc.package.json"]).toBe("string")
      expect(typeof archive.files["index.d.tsc"]).toBe("string")
      const manifest = JSON.parse(archive.files["tsc.package.json"])
      expect(validatePlatformSection(manifest.platform)).toBe(null)
    }
  })

  test("архивы не протухли: platform-секция и профиль совпадают с исходниками", () => {
    for (const ref of REFERENCE_PLATFORMS) {
      const archive = JSON.parse(readFileSync(join(REGISTRY_DIR, "archives", ref.file), "utf8"))
      const manifest = JSON.parse(archive.files["tsc.package.json"])
      const source = JSON.parse(readFileSync(join(PLATFORMS_ROOT, ref.dir, "tsc.package.json"), "utf8"))
      expect(JSON.stringify(manifest.platform)).toBe(JSON.stringify(source.platform))
      expect(archive.files["index.d.tsc"]).toBe(readFileSync(join(PLATFORMS_ROOT, ref.dir, "index.d.tsc"), "utf8"))
    }
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
  test("install добавляет пресеты; без тулчейна build громко отказывает с инструкцией (#282)", async () => {
    const dir = mkTmp()
    const home = mkTmp()
    // A user project: a manifest with main (install will add builds/scripts)
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "@demo/hello", version: "0.1.0", main: "hello.tsc",
    }, null, 2), "utf8")
    writeFileSync(join(dir, "hello.tsc"), 'function main(): void {\n    console.log("hello desktop");\n}\n\nmain();\n', "utf8")
    // Local catalog fixture: the REAL catalog with the urls pointed at the
    // REAL committed archive (same bytes — sha still matches). The versions
    // map (#280) must follow the flat location, or the parser rejects the
    // entry as a flat/versions desync.
    const desktopArchive = join(REGISTRY_DIR, "archives", "@tsclang-desktop-0.4.0.tspkg")
    const catalog = JSON.parse(readFileSync(join(REGISTRY_DIR, "catalog.json"), "utf8"))
    const desktopEntry = catalog.packages.find((p: { name: string }) => p.name === "@tsclang/desktop")
    const flatUrl = desktopEntry.location.url as string
    const fileUrl = `file://${desktopArchive.replace(/\\/g, "/")}`
    desktopEntry.location.url = fileUrl
    for (const v of Object.values(desktopEntry.versions ?? {})) {
      if (v.location.url === flatUrl) v.location.url = fileUrl
    }
    const fixture = join(dir, "catalog.json")
    writeFileSync(fixture, JSON.stringify(catalog), "utf8")
    // TSC_TOOLCHAINS=never: the machine keeps NO isolated toolchain (the
    // declined-download path) — and even a system gcc in PATH must NOT be
    // silently picked up for a compiling emit (#282: bare = transpile-only)
    const env = {
      ...process.env,
      TSC_HOME: home,
      TSC_REGISTRY: fixture,
      TSC_TOOLCHAINS: "never",
      TSC_CATALOG_CACHE: join(home, "catalog-cache.json"),
    }

    const install = await runCli(["platform", "install", "@tsclang/desktop"], { cwd: dir, env })
    expect(install.code).toBe(0)
    expect(install.stdout).toContain(`Installed @tsclang/desktop@0.4.0`)
    // #282: even with a system gcc in PATH the platform never picks it up —
    // the machine keeps NO isolated toolchain (declined download), so the
    // honest outcome is a manual instruction, not a silent system ride
    expect(install.stdout).toContain("manual install")
    expect(install.stdout.includes("using system")).toBe(false)
    // The package profile travels into tsc_packages and overrides built-ins
    expect(existsSync(join(dir, "tsc_packages", "@tsclang", "desktop", "index.d.tsc"))).toBe(true)
    const manifest = JSON.parse(readFileSync(join(dir, "tsc.package.json"), "utf8"))
    expect(typeof manifest.builds.desktop).toBe("object")
    expect(typeof manifest.scripts["desktop:start"]).toBe("string")

    const build = await runCli(["build", "--build", "desktop"], { cwd: dir, env })
    expect(build.code).toBe(1)
    expect(build.stderr).toContain("requires a toolchain")
    expect(build.stderr).toContain("platform install @tsclang/desktop")
    expect(build.stderr).toContain("builds.<n>.toolchain")
    // The real compile-and-run path (an isolated clang bundle under TSC_HOME)
    // is covered by the gated bundle e2e (TSC_E2E_BUNDLES, bundle-e2e.test.ts)
  })
})
