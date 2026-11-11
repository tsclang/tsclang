// 3.1 (#274): first-run onboarding wizard. Gates: TTY (or
// TSC_WIZARD_INTERACTIVE=1), no ~/.tsclang yet, TSC_WIZARD=off/0 disables.
// Checkbox screen (desktop preselected); 's' writes the skip marker (the
// wizard never asks again); a selection installs the machine-level toolchains
// through the SAME install mechanics (registry → archive manifest →
// installToolchains download matrix) without touching any project manifest.

import { spawn } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import { wizardDue } from "../../../../../cli/src/cli/wizard.js"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const DIST_BIN = join(ROOT, "packages", "cli", "dist", "index.js")
const FIXTURE_TGZ = join(here, "fixtures", "tscfixt-1.0.0.tar.gz")

const tmpDirs: string[] = []
function mkTmp(): string {
  const d = mkdtempSync(join(tmpdir(), "tsc-wiz-"))
  tmpDirs.push(d)
  return d
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

function runCli(args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; stdin?: string }): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveFn, reject) => {
    const proc = spawn(process.execPath, [DIST_BIN, ...args], { cwd: opts.cwd, env: opts.env, stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("runCli timeout")) }, 60000)
    if (opts.stdin !== undefined) proc.stdin.write(opts.stdin)
    proc.stdin.end()
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString() })
    proc.on("error", (e) => { clearTimeout(timer); reject(e) })
    proc.on("close", (code) => { clearTimeout(timer); resolveFn({ code: code ?? -1, stdout, stderr }) })
  })
}

// A registry fixture: @tsclang/desktop shipping the tscfixt toolchain. The
// catalog location points to a .tspkg (JSON text); the toolchain tarball is
// referenced from platform.toolchains.*.downloads inside that .tspkg.
const TGZ_URL = `file://${FIXTURE_TGZ.replace(/\\/g, "/")}`
const FIXTURE_SHA = createHash("sha256").update(readFileSync(FIXTURE_TGZ)).digest("hex")

function makeRegistry(dir: string): void {
  const manifest = {
    name: "@tsclang/desktop", version: "1.0.0", type: "platform",
    platform: {
      profile: "desktop",
      builds: { desktop: { profile: "desktop", emit: "c" } },
      toolchains: {
        tscfixt: {
          version: "1.0.0",
          downloads: {
            "win32-x64": { url: TGZ_URL, sha256: FIXTURE_SHA },
            "linux-x64": { url: TGZ_URL, sha256: FIXTURE_SHA },
            "darwin-arm64": { url: TGZ_URL, sha256: FIXTURE_SHA },
          },
        },
      },
    },
  }
  const archive = JSON.stringify({
    name: "@tsclang/desktop", version: "1.0.0",
    files: { "tsc.package.json": JSON.stringify(manifest, null, 2) + "\n" },
  }, null, 2)
  writeFileSync(join(dir, "desktop-1.0.0.tspkg"), archive, "utf8")
  writeFileSync(join(dir, "catalog.json"), JSON.stringify({
    version: 1,
    packages: [
      { name: "@tsclang/desktop", version: "1.0.0", type: "platform",
        description: "desktop reference platform",
        location: { url: "desktop-1.0.0.tspkg", sha256: createHash("sha256").update(archive, "utf8").digest("hex") } },
    ],
  }, null, 2), "utf8")
}

// ── wizardDue (gates, pure) ────────────────────────────────────────────────

describe("13-build/platform 3.1 — wizardDue гейты (#274)", () => {
  test("не-TTY → нет; TTY + нет ~/.tsclang → да; ~/.tsclang есть → нет", () => {
    const home = mkTmp()
    expect(wizardDue({ tty: false, home })).toBe(false)
    expect(wizardDue({ tty: true, home })).toBe(true)
    mkdirSync(join(home, ".tsclang"), { recursive: true })
    expect(wizardDue({ tty: true, home })).toBe(false)
  })

  test("TSC_WIZARD=off отключает; TSC_WIZARD_INTERACTIVE=1 форсирует без TTY", () => {
    const home = mkTmp()
    process.env.TSC_WIZARD = "off"
    try {
      expect(wizardDue({ home })).toBe(false)
    } finally {
      delete process.env.TSC_WIZARD
    }
    process.env.TSC_WIZARD_INTERACTIVE = "1"
    try {
      expect(wizardDue({ home })).toBe(true)
    } finally {
      delete process.env.TSC_WIZARD_INTERACTIVE
    }
  })
})

// ── e2e: the wizard runs before the dispatcher ─────────────────────────────

describe("13-build/platform 3.1 — визард e2e (#274)", () => {
  test("выбор desktop → тулчейн скачан в кеш; повторный запуск молчит", async () => {
    const dir = mkTmp()
    const home = mkTmp()
    makeRegistry(dir)
    const env = {
      ...process.env,
      TSC_HOME: home,
      TSC_REGISTRY: "catalog.json",
      TSC_WIZARD_INTERACTIVE: "1",
      TSC_TOOLCHAINS: "always",
    }
    const r = await runCli(["platform", "list"], { cwd: dir, env, stdin: "1\n" })
    expect(r.stdout).toContain("Welcome to tsclang!")
    expect(r.stdout).toContain("platform desktop:")
    expect(r.stdout).toContain("toolchain tscfixt: downloaded to")
    expect(existsSync(join(home, ".tsclang", "platforms", "desktop@1.0.0", "tscfixt@1.0.0", "bin", "tscfixt"))).toBe(true)

    const again = await runCli(["platform", "list"], { cwd: dir, env, stdin: "" })
    expect(again.stdout.includes("Welcome to tsclang!")).toBe(false)
  })

  test("'s' → маркер skip, повторный запуск молчит, ничего не скачано", async () => {
    const dir = mkTmp()
    const home = mkTmp()
    makeRegistry(dir)
    const env = {
      ...process.env,
      TSC_HOME: home,
      TSC_REGISTRY: "catalog.json",
      TSC_WIZARD_INTERACTIVE: "1",
    }
    const r = await runCli(["platform", "list"], { cwd: dir, env, stdin: "s\n" })
    expect(r.stdout).toContain("Skipped")
    expect(existsSync(join(home, ".tsclang", "wizard.json"))).toBe(true)
    expect(existsSync(join(home, ".tsclang", "platforms"))).toBe(false)

    const again = await runCli(["platform", "list"], { cwd: dir, env, stdin: "" })
    expect(again.stdout.includes("Welcome to tsclang!")).toBe(false)
  })

  test("без TTY визард молчит (CI/пайпы)", async () => {
    const dir = mkTmp()
    const home = mkTmp()
    const r = await runCli(["platform", "list"], { cwd: dir, env: { ...process.env, TSC_HOME: home }, stdin: "" })
    expect(r.stdout.includes("Welcome to tsclang!")).toBe(false)
    expect(existsSync(join(home, ".tsclang"))).toBe(false)
  })

  test("платформы нет в реестре → 'not available' + install later, машина помечена", async () => {
    const dir = mkTmp()
    const home = mkTmp()
    writeFileSync(join(dir, "catalog.json"), JSON.stringify({ version: 1, packages: [] }), "utf8")
    const r = await runCli(["platform", "list"], {
      cwd: dir,
      env: { ...process.env, TSC_HOME: home, TSC_REGISTRY: "catalog.json", TSC_WIZARD_INTERACTIVE: "1" },
      stdin: "1\n",
    })
    expect(r.stdout).toContain("not available")
    expect(r.stdout).toContain("tsclang platform install @tsclang/desktop")
    expect(existsSync(join(home, ".tsclang", "wizard.json"))).toBe(true)
  })
})
