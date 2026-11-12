// #280 — versioned platform installs (`name@spec`) and ranged updates.
// The catalog carries a version history; install resolves bare/exact/range
// specs against it, dependencies record the REQUESTED spec (npm semantics:
// bare writes ^latest) while the lock pins the resolved exact version, and
// `platform update` moves within the range — an exact spec is a pin and is
// never updated. e2e spawns the CLI against local registry fixtures (no network).

import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"

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
  const d = mkdtempSync(join(tmpdir(), "tsc-platver-"))
  tmpDirs.push(d)
  return d
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

// ── fixtures: one platform, three versions, latest = last ───────────────────

const NAME = "@nes/zxdev"

function makeTspkg(dir: string, version: string, buildExtra = ""): { path: string; sha256: string } {
  const manifest = {
    name: NAME, version, type: "platform",
    platform: {
      profile: "zxdev",
      builds: { zxdev: { profile: "zxdev", emit: "c" }, ...(buildExtra ? { [buildExtra]: { profile: "zxdev", emit: "hex" } } : {}) },
      scripts: { dev: "tsclang build --build nes:zxdev" },
    },
  }
  const archive = JSON.stringify({
    name: NAME, version,
    files: {
      "tsc.package.json": JSON.stringify(manifest, null, 2) + "\n",
      "index.d.tsc": "declare platform {\n  bits: 8\n}\n",
    },
  }, null, 2)
  const path = join(dir, `${NAME.replace("/", "-")}-${version}.tspkg`)
  writeFileSync(path, archive, "utf8")
  return { path, sha256: createHash("sha256").update(archive, "utf8").digest("hex") }
}

let catalogSeq = 0

/** A versioned catalog entry over the given versions (latest = last). Every
 *  version may carry its own minCli. */
function versionedEntry(dir: string, versions: string[], minCli: Record<string, string> = {}): Record<string, unknown> {
  const made = versions.map((v) => ({ v, ...makeTspkg(dir, v) }))
  const latest = made[made.length - 1]
  const history: Record<string, unknown> = {}
  for (const m of made) {
    history[m.v] = { location: { url: m.path, sha256: m.sha256 }, ...(minCli[m.v] ? { minCli: minCli[m.v] } : {}) }
  }
  return {
    name: NAME, type: "platform", version: latest.v, description: "fixture",
    location: { url: latest.path, sha256: latest.sha256 },
    versions: history,
  }
}

function envFor(dir: string, entry: Record<string, unknown>): NodeJS.ProcessEnv {
  const catalogPath = join(dir, `catalog-v${++catalogSeq}.json`)
  writeFileSync(catalogPath, JSON.stringify({ version: 1, packages: [entry] }, null, 2), "utf8")
  return { ...process.env, TSC_REGISTRY: catalogPath, TSC_CATALOG_CACHE: join(dir, "cache.json") }
}

function readJson(p: string): Record<string, unknown> {
  return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>
}

const installedVersion = (dir: string): string =>
  (readJson(join(dir, "tsc_packages", "@nes", "zxdev", "tsc.package.json")) as { version: string }).version

const depSpec = (dir: string): string =>
  (readJson(join(dir, "tsc.package.json")).dependencies as Record<string, string>)[NAME]

const lockVersion = (dir: string): string =>
  ((readJson(join(dir, "tsc.package.lock")).packages as Record<string, { version: string }>)[NAME]).version

// ── e2e: install name@spec ─────────────────────────────────────────────────

describe("13-build/platform #280 — e2e: platform install name@spec", () => {
  test("exact-спека ставит выбранную версию; dependencies — exact, lock — exact", async () => {
    const dir = mkTmp()
    const env = envFor(dir, versionedEntry(dir, ["0.3.1", "0.4.0", "0.5.0"]))
    const r = await runCli(["platform", "install", `${NAME}@0.3.1`], { cwd: dir, env })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Installed @nes/zxdev@0.3.1")
    expect(installedVersion(dir)).toBe("0.3.1")
    expect(depSpec(dir)).toBe("0.3.1")
    expect(lockVersion(dir)).toBe("0.3.1")
  })

  test("диапазон ^ ставит старшую в диапазоне, не latest; dependencies — диапазон, lock — exact", async () => {
    const dir = mkTmp()
    const env = envFor(dir, versionedEntry(dir, ["0.3.1", "0.4.0", "0.5.0"]))
    const r = await runCli(["platform", "install", `${NAME}@^0.4`], { cwd: dir, env })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Installed @nes/zxdev@0.4.0")
    expect(installedVersion(dir)).toBe("0.4.0")
    expect(depSpec(dir)).toBe("^0.4")
    expect(lockVersion(dir)).toBe("0.4.0")
  })

  test("bare install ставит latest и записывает caret от него (npm-семантика)", async () => {
    const dir = mkTmp()
    const env = envFor(dir, versionedEntry(dir, ["0.3.1", "0.4.0", "0.5.0"]))
    const r = await runCli(["platform", "install", NAME], { cwd: dir, env })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Installed @nes/zxdev@0.5.0")
    expect(installedVersion(dir)).toBe("0.5.0")
    expect(depSpec(dir)).toBe("^0.5.0")
    expect(lockVersion(dir)).toBe("0.5.0")
  })

  test("нет версии по спеке — громкий отказ со списком доступных", async () => {
    const dir = mkTmp()
    const env = envFor(dir, versionedEntry(dir, ["0.3.1", "0.4.0"]))
    const r = await runCli(["platform", "install", `${NAME}@9.9.9`], { cwd: dir, env })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("no version matching '9.9.9'")
    expect(r.stderr).toContain("0.3.1")
    expect(r.stderr).toContain("0.4.0")
  })

  test("minCli новее текущего CLI — громкий отказ с требуемой версией", async () => {
    const dir = mkTmp()
    const env = envFor(dir, versionedEntry(dir, ["0.4.0"], { "0.4.0": "9.9.9" }))
    const r = await runCli(["platform", "install", `${NAME}@0.4.0`], { cwd: dir, env })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("requires tsclang >= 9.9.9")
  })

  test("повторный install с другой спекой перезаписывает dependencies-спеку", async () => {
    const dir = mkTmp()
    const env = envFor(dir, versionedEntry(dir, ["0.3.1", "0.4.0"]))
    expect((await runCli(["platform", "install", `${NAME}@^0.3`], { cwd: dir, env })).code).toBe(0)
    expect((await runCli(["platform", "install", `${NAME}@0.4.0`], { cwd: dir, env })).code).toBe(0)
    expect(depSpec(dir)).toBe("0.4.0")
    expect(installedVersion(dir)).toBe("0.4.0")
  })
})

// ── e2e: update within range ───────────────────────────────────────────────

describe("13-build/platform #280 — e2e: platform update в пределах диапазона", () => {
  test("обновление не выходит за диапазон dependencies: ^0.3 остаётся на 0.3.x при latest 0.5.0", async () => {
    const dir = mkTmp()
    const envOld = envFor(dir, versionedEntry(dir, ["0.3.1", "0.4.0", "0.5.0"]))
    expect((await runCli(["platform", "install", `${NAME}@^0.3`], { cwd: dir, env: envOld })).code).toBe(0)

    const r = await runCli(["platform", "update", "--yes"], { cwd: dir, env: envOld })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("up to date")
    expect(installedVersion(dir)).toBe("0.3.1")
  })

  test("новая версия ВНУТРИ диапазона применяется; dependencies-диапазон сохраняется, lock — exact", async () => {
    const dir = mkTmp()
    const envOld = envFor(dir, versionedEntry(dir, ["0.3.1", "0.5.0"]))
    expect((await runCli(["platform", "install", `${NAME}@^0.3`], { cwd: dir, env: envOld })).code).toBe(0)

    const envNew = envFor(dir, versionedEntry(dir, ["0.3.1", "0.3.2", "0.5.0"]))
    const r = await runCli(["platform", "update", "--yes"], { cwd: dir, env: envNew })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Updated @nes/zxdev 0.3.1 → 0.3.2")
    expect(installedVersion(dir)).toBe("0.3.2")
    expect(depSpec(dir)).toBe("^0.3")
    expect(lockVersion(dir)).toBe("0.3.2")
  })

  test("exact-спека — пин: update не трогает даже при более новом latest", async () => {
    const dir = mkTmp()
    const envOld = envFor(dir, versionedEntry(dir, ["0.3.1"]))
    expect((await runCli(["platform", "install", `${NAME}@0.3.1`], { cwd: dir, env: envOld })).code).toBe(0)

    const envNew = envFor(dir, versionedEntry(dir, ["0.3.1", "0.5.0"]))
    const r = await runCli(["platform", "update", "--yes"], { cwd: dir, env: envNew })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("up to date")
    expect(r.stderr).toContain("pinned to 0.3.1")
    expect(installedVersion(dir)).toBe("0.3.1")
  })

  test("bare-install (caret от latest): минорное обновление внутри каре применяется", async () => {
    const dir = mkTmp()
    const envOld = envFor(dir, versionedEntry(dir, ["0.4.0"]))
    expect((await runCli(["platform", "install", NAME], { cwd: dir, env: envOld })).code).toBe(0)
    expect(depSpec(dir)).toBe("^0.4.0")

    const envNew = envFor(dir, versionedEntry(dir, ["0.4.0", "0.4.1", "0.5.0"]))
    const r = await runCli(["platform", "update", "--yes"], { cwd: dir, env: envNew })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Updated @nes/zxdev 0.4.0 → 0.4.1")
    expect(depSpec(dir)).toBe("^0.4.0")
    expect(installedVersion(dir)).toBe("0.4.1")
  })

  test("legacy-манифест без спеки в dependencies: update ведёт на плоский latest", async () => {
    const dir = mkTmp()
    const envOld = envFor(dir, versionedEntry(dir, ["0.3.1"]))
    expect((await runCli(["platform", "install", NAME], { cwd: dir, env: envOld })).code).toBe(0)
    // simulate a pre-#280 manifest: dependencies entry gone entirely
    const manifestPath = join(dir, "tsc.package.json")
    const manifest = readJson(manifestPath)
    delete (manifest as { dependencies?: unknown }).dependencies
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8")

    const envNew = envFor(dir, versionedEntry(dir, ["0.3.1", "0.5.0"]))
    const r = await runCli(["platform", "update", "--yes"], { cwd: dir, env: envNew })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Updated @nes/zxdev 0.3.1 → 0.5.0")
    expect(depSpec(dir)).toBe("^0.5.0")
  })
})
