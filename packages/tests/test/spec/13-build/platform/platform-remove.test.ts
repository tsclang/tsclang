// 1.3 (#268): platform remove — ownership-based cleanup: entries whose lock
// snapshot matches are removed, user-edited ones are kept with a warning,
// foreign entries are never touched. Unit tests import pm source; e2e spawns
// the CLI against a local registry fixture (zero network).

import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import { entryHash, planPlatformRemoval } from "../../../../../pm/src/platform-install.js"

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
  const d = mkdtempSync(join(tmpdir(), "tsc-platrm-"))
  tmpDirs.push(d)
  return d
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

const ZXDEV = {
  name: "@nes/zxdev", version: "0.3.1",
  platform: {
    profile: "zxdev",
    builds: { zxdev: { profile: "zxdev", emit: "c" } },
    scripts: { dev: "tsclang build --build nes:zxdev" },
  },
}

function makeTspkg(dir: string): { path: string; sha256: string } {
  const manifest = { name: ZXDEV.name, version: ZXDEV.version, type: "platform", platform: ZXDEV.platform }
  const archive = JSON.stringify({
    name: ZXDEV.name, version: ZXDEV.version,
    files: {
      "tsc.package.json": JSON.stringify(manifest, null, 2) + "\n",
      "index.d.tsc": "declare platform {\n  bits: 8\n}\n",
    },
  }, null, 2)
  const path = join(dir, "nes-zxdev-0.3.1.tspkg")
  writeFileSync(path, archive, "utf8")
  return { path, sha256: createHash("sha256").update(archive, "utf8").digest("hex") }
}

function fixtureRegistry(dir: string): string {
  const { path, sha256 } = makeTspkg(dir)
  const catalog = join(dir, "catalog.json")
  writeFileSync(catalog, JSON.stringify({
    version: 1,
    packages: [{ name: ZXDEV.name, type: "platform", version: ZXDEV.version, description: "fixture", location: { url: path, sha256 } }],
  }), "utf8")
  return catalog
}

async function installFixture(dir: string): Promise<CliResult> {
  return runCli(["platform", "install", ZXDEV.name], {
    cwd: dir,
    env: { ...process.env, TSC_REGISTRY: fixtureRegistry(dir), TSC_CATALOG_CACHE: join(dir, "cache.json") },
  })
}

function readJson(p: string): Record<string, unknown> {
  return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>
}

// ── unit: planPlatformRemoval ──────────────────────────────────────────────

describe("13-build/platform 1.3 — planPlatformRemoval: чистка по снапшотам (#268)", () => {
  const presetBuild = { profile: "zxdev", emit: "c", outDir: "build/nes-zxdev" }
  const devCmd = ZXDEV.platform.scripts!.dev

  test("хеш совпал — remove; не совпал — skip edited; записи нет — ничего", () => {
    const manifest = {
      builds: { "nes:zxdev": presetBuild, "nes:other": { ...presetBuild, edited: true } },
      scripts: { "nes:zxdev:dev": devCmd },
    }
    const owned = {
      builds: { "nes:zxdev": entryHash(presetBuild), "nes:other": entryHash(presetBuild), "nes:gone": entryHash(presetBuild) },
      scripts: { "nes:zxdev:dev": entryHash(devCmd) },
    }
    const actions = planPlatformRemoval(manifest, owned)
    const shape = actions.map((a) => `${a.kind}:${a.target}:${a.key}${a.reason ? `:${a.reason}` : ""}`).sort()
    expect(JSON.stringify(shape)).toBe(JSON.stringify([
      "remove:builds:nes:zxdev",
      "skip:builds:nes:other:edited",
      "remove:scripts:nes:zxdev:dev",
    ].sort()))
  })

  test("без владения — пустой план (чужое не трогаем)", () => {
    const manifest = { builds: { "user:mine": { profile: "u" } } }
    expect(planPlatformRemoval(manifest, undefined).length).toBe(0)
    expect(planPlatformRemoval(manifest, {}).length).toBe(0)
  })
})

// ── e2e: tsclang platform remove ───────────────────────────────────────────

describe("13-build/platform 1.3 — e2e: platform remove (#268)", () => {
  test("полный цикл: install → remove — всё своё вычищено, выход 0", async () => {
    const dir = mkTmp()
    const ins = await installFixture(dir)
    expect(ins.code).toBe(0)

    const r = await runCli(["platform", "remove", ZXDEV.name], { cwd: dir, env: { ...process.env } })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain(`Removed ${ZXDEV.name}`)

    const manifest = readJson(join(dir, "tsc.package.json"))
    expect(manifest.builds).toBe(undefined)   // empty maps are dropped, not left behind
    expect(manifest.scripts).toBe(undefined)
    expect((manifest.dependencies as Record<string, unknown> | undefined)?.[ZXDEV.name]).toBe(undefined)
    expect(existsSync(join(dir, "tsc_packages", "@nes", "zxdev"))).toBe(false)
    const lock = readJson(join(dir, "tsc.package.lock")) as { packages: Record<string, unknown> }
    expect(lock.packages[ZXDEV.name]).toBe(undefined)
  })

  test("install → пользователь правил запись → remove: правленое осталось + warning, остальное вычищено", async () => {
    const dir = mkTmp()
    expect((await installFixture(dir)).code).toBe(0)

    // user edits the platform's build entry
    const manifest = readJson(join(dir, "tsc.package.json"))
    ;(manifest.builds as Record<string, unknown>)["nes:zxdev"] = { profile: "my-tweaks" }
    ;(manifest.builds as Record<string, unknown>)["user:mine"] = { profile: "user" }
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8")

    const r = await runCli(["platform", "remove", ZXDEV.name], { cwd: dir, env: { ...process.env } })
    expect(r.code).toBe(0)
    expect(r.stdout + r.stderr).toContain("edited")
    expect(r.stdout + r.stderr).toContain("nes:zxdev")

    const m2 = readJson(join(dir, "tsc.package.json"))
    const builds = m2.builds as Record<string, unknown>
    expect(JSON.stringify(builds["nes:zxdev"])).toBe(JSON.stringify({ profile: "my-tweaks" })) // kept
    expect(JSON.stringify(builds["user:mine"])).toBe(JSON.stringify({ profile: "user" }))       // foreign — kept
    expect((m2.scripts as Record<string, unknown> | undefined)?.["nes:zxdev:dev"]).toBe(undefined) // unedited — removed
    expect(existsSync(join(dir, "tsc_packages", "@nes", "zxdev"))).toBe(false)
  })

  test("не установлена — честный not installed, exit 1", async () => {
    const r = await runCli(["platform", "remove", "@nes/zxdev"], { cwd: mkTmp(), env: { ...process.env } })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("not installed")
  })

  test("без имени — usage-ошибка, exit 1", async () => {
    const r = await runCli(["platform", "remove"], { cwd: mkTmp(), env: { ...process.env } })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("usage")
  })

  test("после remove platform list пуст", async () => {
    const dir = mkTmp()
    expect((await installFixture(dir)).code).toBe(0)
    expect((await runCli(["platform", "remove", ZXDEV.name], { cwd: dir, env: { ...process.env } })).code).toBe(0)
    const ls = await runCli(["platform", "list"], { cwd: dir })
    expect(ls.stdout).toContain("No platforms installed")
  })
})
