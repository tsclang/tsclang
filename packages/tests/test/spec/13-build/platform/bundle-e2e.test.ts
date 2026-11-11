// #278 toolchain bundles — opt-in e2e. Downloads the REAL bundles from the
// tsclang GitHub release into a throwaway TSC_HOME and builds through the
// isolated toolchains (not PATH). Gated: network + ~1.5 GB of downloads are
// not part of a normal test run.
//
//   TSC_E2E_BUNDLES=desktop   pnpm tsx packages/tests/test/spec/13-build/platform/run.ts
//   TSC_E2E_BUNDLES=avr
//   TSC_E2E_BUNDLES=wasm
//   TSC_E2E_BUNDLES=all
//
// The catalog fixture is the committed catalog.json with the .tspkg url
// pointed at the local archive (like reference-platform's crash test); the
// toolchain urls stay REAL — the download path is what this suite tests.

import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import { bashLoginArgs, msys2Bash, shQuote, toMsysPath } from "@tsclang/test-engine"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const DIST_BIN = join(ROOT, "packages", "cli", "dist", "index.js")
const REGISTRY_DIR = join(ROOT, "packages", "registry")

const MODE = process.env.TSC_E2E_BUNDLES ?? ""
const SELECTED = MODE === "all"
  ? ["desktop", "avr", "wasm"]
  : MODE.split(",").map((s) => s.trim()).filter(Boolean)

const tmpDirs: string[] = []
function mkTmp(): string {
  const d = mkdtempSync(join(tmpdir(), "tsc-bundle-"))
  tmpDirs.push(d)
  return d
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

function runCli(args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }): Promise<{ code: number; stdout: string; stderr: string }> {
  // Same win32 MSYS2-login wrapper as reference-platform.test.ts — the CLI
  // itself then spawns the ISOLATED toolchains directly (no MSYS2 needed
  // for them: WinLibs/Zak's are standalone mingw distros).
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
    // Bundles are big (gcc ~400 MB, emcc ~750 MB): download+extract can take
    // minutes on slow links.
    const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("runCli timeout")) }, 20 * 60_000)
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString() })
    proc.on("error", (e) => { clearTimeout(timer); reject(e) })
    proc.on("close", (code) => { clearTimeout(timer); resolveFn({ code: code ?? -1, stdout, stderr }) })
  })
}

interface Case {
  platform: string
  toolchains: Array<[name: string, version: string, dir: string]>
  source: string
  buildArgs: string[]
  verify: (dir: string) => void
}

const CASES: Case[] = [
  {
    platform: "desktop",
    toolchains: [["gcc", "16.2.0", "desktop@0.2.0/gcc@16.2.0"]],
    source: 'function main(): void {\n    console.log("hello isolated gcc");\n}\n\nmain();\n',
    buildArgs: ["build", "--build", "desktop"],
    verify: () => { /* emit exec: the program's stdout is checked directly */ },
  },
  {
    platform: "avr",
    toolchains: [["avr-gcc", "16.1.0", "avr@0.2.0/avr-gcc@16.1.0"], ["avrdude", "8.3", "avr@0.2.0/avrdude@8.3"]],
    source: "function main(): void {\n    let x: u8 = 1;\n    x = (x + 2) as u8;\n}\n\nmain();\n",
    buildArgs: ["build", "--build", "avr"],
    verify: (dir) => {
      expect(existsSync(join(dir, "build", "avr", "main.hex"))).toBe(true)
    },
  },
  {
    platform: "wasm",
    toolchains: [["emcc", "7.0.0", "wasm@0.2.0/emcc@7.0.0"]],
    source: 'function main(): void {\n    console.log("hello wasm");\n}\n\nmain();\n',
    buildArgs: ["build", "--build", "wasm"],
    verify: (dir) => {
      expect(existsSync(join(dir, "build", "wasm", "main.wasm"))).toBe(true)
    },
  },
]

describe("13-build/platform бандлы тулчейнов — opt-in e2e (TSC_E2E_BUNDLES, #278)", () => {
  if (!MODE) return

  for (const c of CASES.filter((x) => SELECTED.includes(x.platform))) {
    test(`${c.platform}: install качает бандлы в изолированный TSC_HOME; build идёт через них`, async () => {
      const dir = mkTmp()
      const home = mkTmp()
      writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
        name: "@demo/e2e", version: "0.1.0", main: "main.tsc",
      }, null, 2), "utf8")
      writeFileSync(join(dir, "main.tsc"), c.source, "utf8")
      // Catalog fixture: committed catalog, .tspkg urls → local files,
      // toolchain urls stay real (GitHub release).
      const catalog = JSON.parse(readFileSync(join(REGISTRY_DIR, "catalog.json"), "utf8"))
      // Archive files are committed as "@tsclang-desktop-0.2.0.tspkg" — the
      // leading @ survives the scope→dash rewrite of the inner "/" only.
      for (const pkg of catalog.packages) {
        const file = `${pkg.name.replace("/", "-")}-${pkg.version}.tspkg`
        const local = join(REGISTRY_DIR, "archives", file)
        if (existsSync(local)) pkg.location.url = `file://${local.replace(/\\/g, "/")}`
      }
      const fixture = join(dir, "catalog.json")
      writeFileSync(fixture, JSON.stringify(catalog), "utf8")
      const env = {
        ...process.env,
        TSC_HOME: home,
        TSC_REGISTRY: fixture,
        TSC_TOOLCHAINS: "always",
        TSC_CATALOG_CACHE: join(home, "catalog-cache.json"),
      }

      const install = await runCli(["platform", "install", `@tsclang/${c.platform}`], { cwd: dir, env })
      expect(install.code).toBe(0)
      expect(install.stdout).toContain(`Installed @tsclang/${c.platform}@0.2.0`)
      for (const [name, version, rel] of c.toolchains) {
        const tcDir = join(home, ".tsclang", "platforms", ...rel.split("/"))
        expect(existsSync(tcDir)).toBe(true)
        // The layout contract findIsolatedToolchain relies on: bin/ at the
        // root (or a flat root) with the tool inside.
        const bin = existsSync(join(tcDir, "bin")) ? join(tcDir, "bin") : tcDir
        expect(existsSync(join(bin, process.platform === "win32" ? `${name}.exe` : name))).toBe(true)
      }

      const build = await runCli(c.buildArgs, { cwd: dir, env })
      expect(build.code).toBe(0)
      c.verify(dir)
      if (c.platform === "desktop") expect(build.stdout).toContain("hello isolated gcc")
    })
  }
})
