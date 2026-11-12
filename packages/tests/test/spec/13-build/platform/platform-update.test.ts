// 1.5 (#279): platform update — lifecycle of installed platforms. Compares
// installed platforms against the catalog and reapplies the install mechanics
// with lock ownership (#267): new preset names appear, disappeared own names
// go away, user-edited entries are never touched. Unit tests import pm
// source; e2e spawns the CLI against local registry fixtures (zero network).

import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import { planPlatformUpdates } from "../../../../../pm/src/platform-registry.js"
import type { Catalog } from "../../../../../pm/src/platform-registry.js"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const DIST_BIN = join(ROOT, "packages", "cli", "dist", "index.js")
const SRC_BIN = join(ROOT, "packages", "cli", "src", "index.ts")
const USE_TSX = !existsSync(DIST_BIN)
const TSX_LOADER = new URL(`file://${join(ROOT, "node_modules", "tsx", "dist", "esm", "index.mjs")}`).href

interface CliResult { code: number; stdout: string; stderr: string }

function runCli(args: string[], opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; input?: string } = {}): Promise<CliResult> {
  return new Promise((resolveFn, reject) => {
    const argv = USE_TSX ? ["--import", TSX_LOADER, SRC_BIN, ...args] : [DIST_BIN, ...args]
    const proc = spawn(process.execPath, argv, { cwd: opts.cwd ?? ROOT, env: opts.env, stdio: [opts.input !== undefined ? "pipe" : "ignore", "pipe", "pipe"] })
    if (opts.input !== undefined && proc.stdin) { proc.stdin.write(opts.input); proc.stdin.end() }
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
  const d = mkdtempSync(join(tmpdir(), "tsc-platupd-"))
  tmpDirs.push(d)
  return d
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

// ── fixtures ────────────────────────────────────────────────────────────────

interface PkgSpec {
  name: string
  version: string
  platform: {
    profile: string
    builds: Record<string, Record<string, unknown>>
    scripts?: Record<string, string>
  }
}

const ZXDEV_V1: PkgSpec = {
  name: "@nes/zxdev", version: "0.3.1",
  platform: {
    profile: "zxdev",
    builds: {
      zxdev: { profile: "zxdev", emit: "c" },
      oldx: { profile: "zxdev", emit: "c" },
    },
    scripts: { dev: "tsclang build --build nes:zxdev" },
  },
}

const ZXDEV_V2: PkgSpec = {
  name: "@nes/zxdev", version: "0.4.0",
  platform: {
    profile: "zxdev",
    builds: {
      zxdev: { profile: "zxdev", emit: "c" },
      extra: { profile: "zxdev", emit: "hex" },
    },
    scripts: { dev: "tsclang build --build nes:zxdev" },
  },
}

function makeTspkg(dir: string, spec: PkgSpec): { path: string; sha256: string; entry: Record<string, unknown> } {
  const manifest = { name: spec.name, version: spec.version, type: "platform", platform: spec.platform }
  const archive = JSON.stringify({
    name: spec.name, version: spec.version,
    files: {
      "tsc.package.json": JSON.stringify(manifest, null, 2) + "\n",
      "index.d.tsc": "declare platform {\n  bits: 8\n}\n",
    },
  }, null, 2)
  const path = join(dir, `${spec.name.replace("/", "-")}-${spec.version}.tspkg`)
  writeFileSync(path, archive, "utf8")
  const sha256 = createHash("sha256").update(archive, "utf8").digest("hex")
  return { path, sha256, entry: { name: spec.name, type: "platform", version: spec.version, description: "fixture", location: { url: path, sha256 } } }
}

function fixtureCatalog(dir: string, packages: Record<string, unknown>[]): string {
  const p = join(dir, `catalog-${packages.map((e) => (e as { version: string }).version).join("-")}.json`)
  writeFileSync(p, JSON.stringify({ version: 1, packages }, null, 2), "utf8")
  return p
}

function readJson(p: string): Record<string, unknown> {
  return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>
}

/** Install the v1 fixture into a fresh project dir; returns the dir + env for
 *  later update runs against the v2 catalog. `extra` catalog entries are also
 *  installed (multi-platform scenarios). */
async function installV1(dir: string, v1: Record<string, unknown>, extra: { entry: Record<string, unknown> }[] = []): Promise<NodeJS.ProcessEnv> {
  const catalog = fixtureCatalog(dir, [v1, ...extra.map((e) => e.entry)])
  const env = { ...process.env, TSC_REGISTRY: catalog, TSC_CATALOG_CACHE: join(dir, "cache.json") }
  const r = await runCli(["platform", "install", "@nes/zxdev"], { cwd: dir, env })
  expect(r.code).toBe(0)
  for (const e of extra) {
    const re = await runCli(["platform", "install", (e.entry as { name: string }).name], { cwd: dir, env })
    expect(re.code).toBe(0)
  }
  return env
}

function v2Env(dir: string, v2: Record<string, unknown> | null, extra: Record<string, unknown>[] = []): NodeJS.ProcessEnv {
  const packages = [...(v2 ? [v2] : []), ...extra]
  return { ...process.env, TSC_REGISTRY: fixtureCatalog(dir, packages), TSC_CATALOG_CACHE: join(dir, "cache.json") }
}

/** Simulate a pre-#280 manifest: no dependency spec recorded — `platform
 *  update` then follows the flat catalog latest (legacy semantics, still
 *  supported; a spec recorded by a #280 install constrains the update). */
function stripDependencies(dir: string): void {
  const manifestPath = join(dir, "tsc.package.json")
  const manifest = readJson(manifestPath)
  delete (manifest as { dependencies?: unknown }).dependencies
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8")
}

// ── unit: planPlatformUpdates ───────────────────────────────────────────────

describe("13-build/platform 1.5 — planPlatformUpdates: installed vs catalog (#279)", () => {
  const catalogOf = (packages: Record<string, unknown>[]): Catalog =>
    ({ version: 1, packages: packages as unknown as Catalog["packages"] })

  test("каталог новее — попадает в updates с current/next", () => {
    const { updates, missingFromCatalog } = planPlatformUpdates(
      [{ name: "@nes/zxdev", version: "0.3.1" }],
      catalogOf([{ name: "@nes/zxdev", type: "platform", version: "0.4.0" }]),
    )
    expect(JSON.stringify(updates)).toBe(JSON.stringify([{ name: "@nes/zxdev", current: "0.3.1", next: "0.4.0", spec: "" }]))
    expect(missingFromCatalog.length).toBe(0)
  })

  test("версии равны — обновления нет", () => {
    const { updates } = planPlatformUpdates(
      [{ name: "@nes/zxdev", version: "0.4.0" }],
      catalogOf([{ name: "@nes/zxdev", type: "platform", version: "0.4.0" }]),
    )
    expect(updates.length).toBe(0)
  })

  test("каталог старее установленной — даунгрейда нет", () => {
    const { updates } = planPlatformUpdates(
      [{ name: "@nes/zxdev", version: "0.4.0" }],
      catalogOf([{ name: "@nes/zxdev", type: "platform", version: "0.3.1" }]),
    )
    expect(updates.length).toBe(0)
  })

  test("числовое сравнение сегментов: 0.10.0 новее 0.9.0", () => {
    const { updates } = planPlatformUpdates(
      [{ name: "@nes/zxdev", version: "0.9.0" }],
      catalogOf([{ name: "@nes/zxdev", type: "platform", version: "0.10.0" }]),
    )
    expect(updates.length).toBe(1)
    expect(updates[0].next).toBe("0.10.0")
  })

  test("платформы нет в каталоге — missingFromCatalog, не update", () => {
    const { updates, missingFromCatalog } = planPlatformUpdates(
      [{ name: "@gone/old", version: "1.0.0" }],
      catalogOf([]),
    )
    expect(updates.length).toBe(0)
    expect(JSON.stringify(missingFromCatalog)).toBe(JSON.stringify(["@gone/old"]))
  })

  test("несколько платформ — каждая фильтруется независимо", () => {
    const { updates, missingFromCatalog } = planPlatformUpdates(
      [
        { name: "@a/one", version: "1.0.0" },
        { name: "@a/two", version: "2.0.0" },
        { name: "@a/three", version: "3.0.0" },
      ],
      catalogOf([
        { name: "@a/one", type: "platform", version: "1.1.0" },
        { name: "@a/two", type: "platform", version: "2.0.0" },
      ]),
    )
    expect(JSON.stringify(updates)).toBe(JSON.stringify([{ name: "@a/one", current: "1.0.0", next: "1.1.0", spec: "" }]))
    expect(JSON.stringify(missingFromCatalog)).toBe(JSON.stringify(["@a/three"]))
  })
})

// ── e2e: tsclang platform update ────────────────────────────────────────────

describe("13-build/platform 1.5 — e2e: platform update (#279)", () => {
  test("не-TTY без --yes: печатает доступные обновления, ничего не меняет, exit 0", async () => {
    const dir = mkTmp()
    const fx1 = makeTspkg(dir, ZXDEV_V1)
    await installV1(dir, fx1.entry)
    stripDependencies(dir) // legacy: bare-latest semantics
    const env = v2Env(dir, makeTspkg(dir, ZXDEV_V2).entry)

    const r = await runCli(["platform", "update"], { cwd: dir, env })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Available platform updates")
    expect(r.stdout).toContain("@nes/zxdev 0.3.1 → 0.4.0")
    expect(r.stdout).toContain("--yes")

    const lock = readJson(join(dir, "tsc.package.lock")) as { packages: Record<string, { version: string }> }
    expect(lock.packages["@nes/zxdev"].version).toBe("0.3.1")
  })

  test("--yes: lock/deps/пакет на 0.4.0, новый билд дописан, исчезнувший убран", async () => {
    const dir = mkTmp()
    const fx1 = makeTspkg(dir, ZXDEV_V1)
    await installV1(dir, fx1.entry)
    stripDependencies(dir) // legacy: bare-latest semantics
    const env = v2Env(dir, makeTspkg(dir, ZXDEV_V2).entry)

    const r = await runCli(["platform", "update", "--yes"], { cwd: dir, env })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Updated @nes/zxdev 0.3.1 → 0.4.0")

    const lock = readJson(join(dir, "tsc.package.lock")) as { packages: Record<string, { version: string; platform?: { builds?: Record<string, string> } }> }
    expect(lock.packages["@nes/zxdev"].version).toBe("0.4.0")
    expect(JSON.stringify(Object.keys(lock.packages["@nes/zxdev"].platform!.builds!).sort())).toBe(JSON.stringify(["nes:extra", "nes:zxdev"]))

    const manifest = readJson(join(dir, "tsc.package.json")) as { dependencies: Record<string, string>; builds: Record<string, unknown>; scripts: Record<string, string> }
    // #280: the legacy bare update records a caret of the resolved version
    expect(manifest.dependencies["@nes/zxdev"]).toBe("^0.4.0")
    expect(manifest.builds["nes:extra"]).toBeTruthy()
    expect("nes:oldx" in manifest.builds).toBe(false)
    expect(manifest.scripts["nes:zxdev:dev"]).toBeTruthy()

    expect(JSON.parse(readFileSync(join(dir, "tsc_packages", "@nes", "zxdev", "tsc.package.json"), "utf8")).version).toBe("0.4.0")
  })

  test("пользователь отредактировал билд — запись не перезаписана, warning", async () => {
    const dir = mkTmp()
    const fx1 = makeTspkg(dir, ZXDEV_V1)
    await installV1(dir, fx1.entry)
    stripDependencies(dir) // legacy: bare-latest semantics

    const manifestPath = join(dir, "tsc.package.json")
    const manifest = readJson(manifestPath) as { builds: Record<string, Record<string, unknown>> }
    manifest.builds["nes:zxdev"].ram = 16 // user edit after install
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8")

    const env = v2Env(dir, makeTspkg(dir, ZXDEV_V2).entry)
    const r = await runCli(["platform", "update", "--yes"], { cwd: dir, env })
    expect(r.code).toBe(0)
    expect(r.stderr).toContain("skipped builds.nes:zxdev")

    const after = readJson(manifestPath) as { builds: Record<string, Record<string, unknown>> }
    expect(after.builds["nes:zxdev"].ram).toBe(16)
    expect(after.builds["nes:extra"]).toBeTruthy() // others still applied
  })

  test("TTY: отказ от подтверждения — ничего не тронуто", async () => {
    const dir = mkTmp()
    const fx1 = makeTspkg(dir, ZXDEV_V1)
    await installV1(dir, fx1.entry)
    stripDependencies(dir) // legacy: bare-latest semantics
    const env = v2Env(dir, makeTspkg(dir, ZXDEV_V2).entry)

    const r = await runCli(["platform", "update"], {
      cwd: dir, env: { ...env, TSC_PLATFORM_INTERACTIVE: "1" }, input: "n\n",
    })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("skipped @nes/zxdev")

    const lock = readJson(join(dir, "tsc.package.lock")) as { packages: Record<string, { version: string }> }
    expect(lock.packages["@nes/zxdev"].version).toBe("0.3.1")
  })

  test("актуальные версии — up to date, exit 0", async () => {
    const dir = mkTmp()
    const fx2 = makeTspkg(dir, ZXDEV_V2)
    const catalog = fixtureCatalog(dir, [fx2.entry])
    const env = { ...process.env, TSC_REGISTRY: catalog, TSC_CATALOG_CACHE: join(dir, "cache.json") }
    const ins = await runCli(["platform", "install", "@nes/zxdev"], { cwd: dir, env })
    expect(ins.code).toBe(0)

    const r = await runCli(["platform", "update", "--yes"], { cwd: dir, env })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("up to date")
  })

  test("без установленных платформ — подсказка, exit 0", async () => {
    const dir = mkTmp()
    const env = v2Env(dir, makeTspkg(dir, ZXDEV_V2).entry)
    const r = await runCli(["platform", "update"], { cwd: dir, env })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("No platforms installed")
  })

  test("явное имя, которого нет в установленных — exit 1", async () => {
    const dir = mkTmp()
    const env = v2Env(dir, makeTspkg(dir, ZXDEV_V2).entry)
    const r = await runCli(["platform", "update", "@nes/zxdev"], { cwd: dir, env })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("not installed")
  })

  test("явное имя есть в установленных, но нет в каталоге — exit 1", async () => {
    const dir = mkTmp()
    const fx1 = makeTspkg(dir, ZXDEV_V1)
    await installV1(dir, fx1.entry)
    const env = v2Env(dir, null) // empty catalog: nothing to serve
    const r = await runCli(["platform", "update", "@nes/zxdev", "--yes"], { cwd: dir, env })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("not found in the platform registry")
  })

  test("скан нескольких платформ: обновляется только устаревшая, остальных не трогает", async () => {
    const dir = mkTmp()
    const plain: PkgSpec = {
      name: "@two/plain", version: "1.0.0",
      platform: { profile: "plain", builds: { plain: { profile: "plain", emit: "c" } } },
    }
    const fxPlain = makeTspkg(dir, plain)
    const fx1 = makeTspkg(dir, ZXDEV_V1)
    await installV1(dir, fx1.entry, [fxPlain])
    stripDependencies(dir) // legacy: bare-latest semantics for both
    const env = v2Env(dir, makeTspkg(dir, ZXDEV_V2).entry, [fxPlain.entry])

    const r = await runCli(["platform", "update", "--yes"], { cwd: dir, env })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Updated @nes/zxdev 0.3.1 → 0.4.0")

    const lock = readJson(join(dir, "tsc.package.lock")) as { packages: Record<string, { version: string }> }
    expect(lock.packages["@two/plain"].version).toBe("1.0.0")
    expect(lock.packages["@nes/zxdev"].version).toBe("0.4.0")
  })

  test("offline — громкий отказ, exit 1", async () => {
    const dir = mkTmp()
    const fx1 = makeTspkg(dir, ZXDEV_V1)
    await installV1(dir, fx1.entry)
    stripDependencies(dir) // legacy: bare-latest semantics — an update is planned
    const env = v2Env(dir, makeTspkg(dir, ZXDEV_V2).entry)
    const r = await runCli(["platform", "update", "--yes", "--offline"], { cwd: dir, env })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("offline")
  })

  test("help и валидация флагов: --help работает, неизвестный флаг — exit 1", async () => {
    const dir = mkTmp()
    const h = await runCli(["platform", "update", "--help"], { cwd: dir })
    expect(h.code).toBe(0)
    expect(h.stdout).toContain("tsclang platform update")

    const env = v2Env(dir, makeTspkg(dir, ZXDEV_V2).entry)
    const bad = await runCli(["platform", "update", "--force"], { cwd: dir, env })
    expect(bad.code).toBe(1)
    expect(bad.stderr).toContain("unknown option")
  })
})
