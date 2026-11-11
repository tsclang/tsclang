// 2.4 (#273): doctor gains a Platforms section — installed platform packages
// of the project with per-toolchain status: isolated (version + dir), system
// (PATH) or not found (+ install hint). No platforms — no section. A missing
// platform toolchain is informational only: it never flips the exit code
// (emit c + system tools is a valid setup). listIsolatedToolchains is the pm
// helper the section is built on.

import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import { listIsolatedToolchains } from "../../../../../pm/src/toolchains.js"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const DIST_BIN = join(ROOT, "packages", "cli", "dist", "index.js")

const tmpDirs: string[] = []
function mkTmp(): string {
  const d = mkdtempSync(join(tmpdir(), "tsc-doc-"))
  tmpDirs.push(d)
  return d
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

function runCli(args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveFn, reject) => {
    const proc = spawn(process.execPath, [DIST_BIN, ...args], { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("runCli timeout")) }, 60000)
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString() })
    proc.on("error", (e) => { clearTimeout(timer); reject(e) })
    proc.on("close", (code) => { clearTimeout(timer); resolveFn({ code: code ?? -1, stdout, stderr }) })
  })
}

// ── listIsolatedToolchains (pm helper) ─────────────────────────────────────

describe("13-build/platform 2.4 — listIsolatedToolchains (#273)", () => {
  test("перечисляет тулчейны платформы с версиями и bin-каталогами", () => {
    const home = mkTmp()
    const platformDir = join(home, ".tsclang", "platforms", "avrfake@1.0.0")
    mkdirSync(join(platformDir, "tscfixt@1.0.0", "bin"), { recursive: true })
    mkdirSync(join(platformDir, "flat-tool@2.0.0"), { recursive: true })
    writeFileSync(join(platformDir, "flat-tool@2.0.0", "flat-tool"), "", "utf8")
    const list = listIsolatedToolchains("@tsclang/avrfake", "1.0.0", home)
    const names = list.map((t) => `${t.name}@${t.version}`).sort()
    expect(JSON.stringify(names)).toBe(JSON.stringify(["flat-tool@2.0.0", "tscfixt@1.0.0"]))
    const tscfixt = list.find((t) => t.name === "tscfixt")
    expect(tscfixt?.binDir).toBe(join(platformDir, "tscfixt@1.0.0", "bin"))
    const flat = list.find((t) => t.name === "flat-tool")
    expect(flat?.binDir).toBe(join(platformDir, "flat-tool@2.0.0"))
  })

  test("чужой scope материализуется с префиксом; пусто — []", () => {
    const home = mkTmp()
    mkdirSync(join(home, ".tsclang", "platforms", "someuser-cpc@0.1.0", "z88dk@2.2.0", "bin"), { recursive: true })
    expect(listIsolatedToolchains("@someuser/cpc", "0.1.0", home)[0]?.name).toBe("z88dk")
    expect(JSON.stringify(listIsolatedToolchains("@tsclang/avrfake", "9.9.9", home))).toBe("[]")
    expect(JSON.stringify(listIsolatedToolchains("@tsclang/avrfake", "1.0.0", mkTmp()))).toBe("[]")
  })
})

// ── e2e: doctor Platforms section ──────────────────────────────────────────

function writeProject(dir: string, withPlatform: boolean): void {
  writeFileSync(join(dir, "main.tsc"), "console.log(1)\n", "utf8")
  writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
    name: "docproj", version: "0.0.1", type: "package", main: "main.tsc",
    builds: { app: { emit: "c", main: "main.tsc" } },
    scripts: { dev: "tsclang build --build app" },
  }, null, 2), "utf8")
  if (!withPlatform) return
  const pkgDir = join(dir, "tsc_packages", "@tsclang", "avrfake")
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(join(pkgDir, "index.d.tsc"), 'declare platform { target: "avr" }\n', "utf8")
  writeFileSync(join(pkgDir, "tsc.package.json"), JSON.stringify({
    name: "@tsclang/avrfake", version: "1.0.0", type: "platform",
    platform: {
      profile: "avrfake",
      toolchains: {
        tscfixt: { version: "1.0.0", downloads: { "win32-x64": { url: "https://x/f.tar.gz", sha256: "0".repeat(64) } } },
        sysfixt: { version: "1.0.0", downloads: { "win32-x64": { url: "https://x/s.tar.gz", sha256: "0".repeat(64) } } },
      },
    },
  }, null, 2), "utf8")
}

describe("13-build/platform 2.4 — doctor: секция Platforms (#273)", () => {
  test("нет платформ — секции нет", async () => {
    const dir = mkTmp()
    writeProject(dir, false)
    const r = await runCli(["doctor"], { cwd: dir, env: { ...process.env } })
    expect(r.code).toBe(0)
    expect(r.stdout.includes("Platforms:")).toBe(false)
  })

  test("платформа с тулчейнами: isolated/system/not found статусы, офлайн-тишина, exit 0", async () => {
    const dir = mkTmp()
    const home = mkTmp()
    writeProject(dir, true)
    // isolated tscfixt in the platform cache; sysfixt nowhere; 'gcc' system
    mkdirSync(join(home, ".tsclang", "platforms", "avrfake@1.0.0", "tscfixt@1.0.0", "bin"), { recursive: true })
    const pkgDir = join(dir, "tsc_packages", "@tsclang", "avrfake")
    const m = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(join(pkgDir, "tsc.package.json"), "utf8")))
    m.platform.toolchains.gcc = { version: "13.2.0", downloads: { "win32-x64": { url: "https://x/g.tar.gz", sha256: "0".repeat(64) } } }
    writeFileSync(join(pkgDir, "tsc.package.json"), JSON.stringify(m, null, 2), "utf8")

    // TSC_NO_NETWORK=1 keeps doctor offline — the section is local-only
    const r = await runCli(["doctor"], { cwd: dir, env: { ...process.env, TSC_HOME: home, TSC_NO_NETWORK: "1" } })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Platforms:")
    expect(r.stdout).toContain("@tsclang/avrfake 1.0.0")
    expect(r.stdout).toContain("tscfixt - isolated 1.0.0")
    expect(r.stdout).toContain("gcc - system (found in PATH)")
    expect(r.stdout).toContain("sysfixt - not found")
    expect(r.stdout).toContain("tsclang platform install @tsclang/avrfake")
  })
})
