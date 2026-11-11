// 2.3 (#272): platform scripts reach their inputs and toolchains through
// env — TSC_C_FILE (the generated .c), TSC_TOOLS (isolated toolchain bin
// dirs, delimiter-joined), TSC_PLATFORM (the profile name) on top of the
// existing TSC_OUT_DIR. The command's PATH gets the tool dirs prepended so a
// script can call its toolchain by name.

import { spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const DIST_BIN = join(ROOT, "packages", "cli", "dist", "index.js")

const tmpDirs: string[] = []
function mkTmp(): string {
  const d = mkdtempSync(join(tmpdir(), "tsc-env-"))
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

describe("13-build/platform 2.3 — --command env (#272)", () => {
  test("spawn команды видит TSC_C_FILE/TSC_TOOLS/TSC_PLATFORM + TSC_OUT_DIR; PATH содержит bin-dir тулчейна", async () => {
    const dir = mkTmp()
    const home = mkTmp()
    const gccBin = join(home, ".tsclang", "platforms", "desktop@1.2.0", "gcc@13.2.0", "bin")
    mkdirSync(gccBin, { recursive: true })

    // a platform profile package
    const pkgDir = join(dir, "tsc_packages", "@tsclang", "deskfake")
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, "index.d.tsc"), 'declare platform { target: "desktop" }\n', "utf8")
    writeFileSync(join(pkgDir, "tsc.package.json"), JSON.stringify({
      name: "@tsclang/deskfake", version: "1.0.0", type: "platform",
      platform: { profile: "deskfake", builds: { x: { profile: "deskfake", emit: "c" } } },
    }, null, 2), "utf8")

    // the command dumps its env into env.json (robust across shells)
    writeFileSync(join(dir, "printenv.cjs"),
      "const fs = require('fs')\n" +
      "fs.writeFileSync('env.json', JSON.stringify({\n" +
      "  C: process.env.TSC_C_FILE, TOOLS: process.env.TSC_TOOLS,\n" +
      "  PLATFORM: process.env.TSC_PLATFORM, OUT: process.env.TSC_OUT_DIR,\n" +
      "  PATH: process.env.PATH || process.env.Path,\n" +
      "}))\n", "utf8")

    writeFileSync(join(dir, "main.tsc"), "console.log(1)\n", "utf8")
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "envcheck", version: "0.0.1", type: "package", main: "main.tsc",
      builds: { app: { profile: "deskfake", emit: "c", toolchain: "gcc@13.2.0", command: "node printenv.cjs" } },
    }, null, 2), "utf8")

    const r = await runCli(["build", "--build", "app"], { cwd: dir, env: { ...process.env, TSC_HOME: home } })
    expect(r.code).toBe(0)
    const envPath = join(dir, "env.json")
    expect(existsSync(envPath)).toBe(true)
    const env = JSON.parse(readFileSync(envPath, "utf8")) as Record<string, string>
    expect(env.C).toBe(join(dir, "main.c"))
    expect(env.TOOLS).toBe(gccBin)
    expect(env.PLATFORM).toBe("deskfake")
    expect(env.OUT).toBe(dir)
    expect((env.PATH ?? "").startsWith(gccBin)).toBe(true)
  })
})
