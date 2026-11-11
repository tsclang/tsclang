// 1.2 (#267): platform install — lock ownership of manifest entries, docker
// name mapping, conflict policy (never overwrite), honest not-found, .tspkg
// extraction with path-escape guards. Unit tests import pm source directly;
// e2e spawns the CLI against a local registry fixture (zero network).

import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import {
  stableStringify, entryHash, planPlatformApply, applyPlatformPlan,
  ownershipFromPlan, extractTspkg,
} from "../../../../../pm/src/platform-install.js"
import { platformNames } from "../../../../../pm/src/platform.js"
import type { CatalogPackage } from "../../../../../pm/src/platform-registry.js"

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
    proc.on("close", (code) => { clearTimeout(timer); resolveFn({ code: code ?? -1, stdout, stderr }) }
    )
  })
}

const tmpDirs: string[] = []
function mkTmp(): string {
  const d = mkdtempSync(join(tmpdir(), "tsc-platinst-"))
  tmpDirs.push(d)
  return d
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

// ── fixtures ────────────────────────────────────────────────────────────────

const ZXDEV_V1 = {
  name: "@nes/zxdev", version: "0.3.1",
  platform: {
    profile: "zxdev",
    builds: { zxdev: { profile: "zxdev", emit: "c" } },
    scripts: { dev: "tsclang build --build nes:zxdev" },
  },
}

interface TspkgFixture { path: string; sha256: string; entry: CatalogPackage }

function makeTspkg(dir: string, spec: typeof ZXDEV_V1): TspkgFixture {
  const manifest = {
    name: spec.name, version: spec.version, type: "platform",
    platform: spec.platform,
  }
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

function fixtureCatalog(dir: string, packages: CatalogPackage[]): string {
  const p = join(dir, "catalog.json")
  writeFileSync(p, JSON.stringify({ version: 1, packages }, null, 2), "utf8")
  return p
}

function readJson(p: string): Record<string, unknown> {
  return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>
}

// ── unit: stableStringify / entryHash ──────────────────────────────────────

describe("13-build/platform 1.2 — entryHash: стабильный канонический хеш (#267)", () => {
  test("порядок ключей не влияет на хеш", () => {
    expect(stableStringify({ a: 1, b: { d: 4, c: 3 } })).toBe(stableStringify({ b: { c: 3, d: 4 }, a: 1 }))
    expect(entryHash({ a: 1, b: 2 })).toBe(entryHash({ b: 2, a: 1 }))
  })

  test("разные значения — разные хеши, скаляры и строки хешируемы", () => {
    expect(entryHash({ a: 1 })).not.toBe(entryHash({ a: 2 }))
    expect(entryHash("tsclang build").length).toBe(64)
  })
})

// ── unit: planPlatformApply — ownership decision matrix ────────────────────

describe("13-build/platform 1.2 — planPlatformApply: матрица владения (#267)", () => {
  const names = platformNames("@nes/zxdev")!
  const platform = ZXDEV_V1.platform
  const presetBuild = { profile: "zxdev", emit: "c", outDir: "build/nes-zxdev" }

  test("свежий манифест — все add, имена docker-модели, outDir по умолчанию", () => {
    const plan = planPlatformApply(platform, names, {}, undefined)
    const add = plan.actions.filter((a) => a.kind === "add")
    expect(JSON.stringify(add.map((a) => `${a.target}:${a.key}`).sort())).toBe(JSON.stringify(["builds:nes:zxdev", "scripts:nes:zxdev:dev"]))
    const buildAction = plan.actions.find((a) => a.target === "builds")!
    expect(JSON.stringify(buildAction.value)).toBe(JSON.stringify(presetBuild))
    expect(buildAction.hash).toBe(entryHash(presetBuild))
  })

  test("явный outDir пресета не переконвертируется", () => {
    const p = { ...platform, builds: { zxdev: { profile: "zxdev", emit: "c", outDir: "custom/dir" } } }
    const plan = planPlatformApply(p, names, {}, undefined)
    expect(JSON.stringify(plan.actions[0].value)).toBe(JSON.stringify({ profile: "zxdev", emit: "c", outDir: "custom/dir" }))
  })

  test("чужая запись (нет во владении) — skip exists, никогда не перезапись", () => {
    const manifest = { builds: { "nes:zxdev": { profile: "user" } } }
    const plan = planPlatformApply(platform, names, manifest, undefined)
    const a = plan.actions.find((x) => x.target === "builds")!
    expect(a.kind).toBe("skip")
    expect(a.reason).toBe("exists")
  })

  test("своя запись без изменений — keep (идемпотентность)", () => {
    const owned = { builds: { "nes:zxdev": entryHash(presetBuild) }, scripts: { "nes:zxdev:dev": entryHash(platform.scripts!.dev) } }
    const manifest = { builds: { "nes:zxdev": presetBuild }, scripts: { "nes:zxdev:dev": platform.scripts!.dev } }
    const plan = planPlatformApply(platform, names, manifest, owned)
    expect(plan.actions.every((a) => a.kind === "keep")).toBe(true)
  })

  test("своя запись, пресет изменился — update", () => {
    const owned = { builds: { "nes:zxdev": entryHash(presetBuild) } }
    const manifest = { builds: { "nes:zxdev": presetBuild } }
    const newPlatform = { ...platform, builds: { zxdev: { profile: "zxdev", emit: "c", optimize: "2" } } }
    const plan = planPlatformApply(newPlatform, names, manifest, owned)
    const a = plan.actions.find((x) => x.target === "builds")!
    expect(a.kind).toBe("update")
    expect((a.value as Record<string, unknown>).optimize).toBe("2")
  })

  test("свою запись отредактировал пользователь — skip edited", () => {
    const owned = { builds: { "nes:zxdev": entryHash(presetBuild) } }
    const manifest = { builds: { "nes:zxdev": { ...presetBuild, userEdit: true } } }
    const plan = planPlatformApply(platform, names, manifest, owned)
    const a = plan.actions.find((x) => x.target === "builds")!
    expect(a.kind).toBe("skip")
    expect(a.reason).toBe("edited")
  })

  test("исчезнувшие свои имена — remove; чужие не трогаются", () => {
    const owned = {
      builds: { "nes:zxdev": entryHash(presetBuild), "nes:oldthing": entryHash({ profile: "x" }) },
      scripts: { "nes:zxdev:dev": entryHash(platform.scripts!.dev), "nes:zxdev:old": entryHash("echo old") },
    }
    const manifest = {
      builds: { "nes:zxdev": presetBuild, "nes:oldthing": { profile: "x" }, "user:manual": { profile: "u" } },
      scripts: { "nes:zxdev:dev": platform.scripts!.dev, "nes:zxdev:old": "echo old", "user:task": "echo u" },
    }
    const plan = planPlatformApply(platform, names, manifest, owned)
    const removals = plan.actions.filter((a) => a.kind === "remove").map((a) => `${a.target}:${a.key}`).sort()
    expect(JSON.stringify(removals)).toBe(JSON.stringify(["builds:nes:oldthing", "scripts:nes:zxdev:old"]))
  })

  test("официальный scope — имена без префикса", () => {
    const official = platformNames("@tsclang/spectrum")!
    const plan = planPlatformApply(
      { profile: "spectrum", builds: { spectrum: { emit: "c" } }, scripts: { dev: "echo hi" } },
      official, {}, undefined,
    )
    expect(JSON.stringify(plan.actions.map((a) => a.key).sort())).toBe(JSON.stringify(["spectrum", "spectrum:dev"]))
    expect((plan.actions.find((a) => a.target === "builds")!.value as Record<string, unknown>).outDir).toBe("build/spectrum")
  })
})

// ── unit: applyPlatformPlan + ownershipFromPlan ────────────────────────────

describe("13-build/platform 1.2 — apply + ownership (#267)", () => {
  const names = platformNames("@nes/zxdev")!
  const platform = ZXDEV_V1.platform
  const presetBuild = { profile: "zxdev", emit: "c", outDir: "build/nes-zxdev" }

  test("apply дописывает deps/builds/scripts, skip не трогает, remove чистит", () => {
    const manifest: Record<string, unknown> = {
      name: "proj", builds: { "nes:zxdev": { profile: "user" }, "nes:old": { profile: "x" } },
      scripts: { "nes:zxdev:old": "echo old" },
    }
    const owned = { builds: { "nes:old": entryHash({ profile: "x" }) }, scripts: { "nes:zxdev:old": entryHash("echo old") } }
    const plan = planPlatformApply(platform, names, manifest, owned)
    applyPlatformPlan(manifest, plan, { name: "@nes/zxdev", version: "0.3.1" })

    const builds = manifest.builds as Record<string, unknown>
    const scripts = manifest.scripts as Record<string, unknown>
    const deps = manifest.dependencies as Record<string, string>
    expect(deps["@nes/zxdev"]).toBe("0.3.1")
    expect(JSON.stringify(builds["nes:zxdev"])).toBe(JSON.stringify({ profile: "user" })) // user entry untouched
    expect(builds["nes:old"]).toBe(undefined)                 // stale own entry removed
    expect(scripts["nes:zxdev:old"]).toBe(undefined)
    expect(scripts["nes:zxdev:dev"]).toBe(platform.scripts!.dev)

    const ownership = ownershipFromPlan(plan)
    expect(ownership.builds?.["nes:zxdev"]).toBe(undefined) // skipped → not owned
    expect(ownership.scripts?.["nes:zxdev:dev"]).toBe(entryHash(platform.scripts!.dev))
  })

  test("ownership чистого add — все созданные записи принадлежат платформе", () => {
    const plan = planPlatformApply(platform, names, {}, undefined)
    const ownership = ownershipFromPlan(plan)
    expect(ownership.builds?.["nes:zxdev"]).toBe(entryHash(presetBuild))
    expect(ownership.scripts?.["nes:zxdev:dev"]).toBe(entryHash(platform.scripts!.dev))
  })
})

// ── unit: extractTspkg path safety ─────────────────────────────────────────

describe("13-build/platform 1.2 — extractTspkg: защита путей (#267)", () => {
  test("распаковывает вложенные файлы в tsc_packages/<имя>", () => {
    const dir = mkTmp()
    const dest = extractTspkg({ "index.d.tsc": "declare {}", "include/x.h": "int x;" }, join(dir, "tsc_packages"), "@nes/zxdev")
    expect(dest).toBe(join(dir, "tsc_packages", "@nes", "zxdev"))
    expect(existsSync(join(dest, "include", "x.h"))).toBe(true)
  })

  test(" '..' в пути архива — отказ (zip-slip)", () => {
    const dir = mkTmp()
    let threw = false
    try { extractTspkg({ "../evil": "x" }, join(dir, "tsc_packages"), "@nes/zxdev") } catch { threw = true }
    expect(threw).toBe(true)
    expect(existsSync(join(dir, "evil"))).toBe(false)
  })

  test("абсолютный путь в архиве — отказ", () => {
    const dir = mkTmp()
    let threw = false
    try { extractTspkg({ "/etc/passwd": "x" }, join(dir, "tsc_packages"), "@nes/zxdev") } catch { threw = true }
    expect(threw).toBe(true)
  })

  test("невалидное имя пакета — отказ", () => {
    const dir = mkTmp()
    let threw = false
    try { extractTspkg({ "a": "x" }, join(dir, "tsc_packages"), "../evil") } catch { threw = true }
    expect(threw).toBe(true)
  })
})

// ── e2e: tsclang platform install ──────────────────────────────────────────

describe("13-build/platform 1.2 — e2e: platform install (#267)", () => {
  test("установка из локального реестра: файлы, deps, builds/scripts, lock-владение", async () => {
    const dir = mkTmp()
    const fx = makeTspkg(dir, ZXDEV_V1)
    const catalog = fixtureCatalog(dir, [fx.entry])

    const r = await runCli(["platform", "install", "@nes/zxdev"], {
      cwd: dir, env: { ...process.env, TSC_REGISTRY: catalog, TSC_CATALOG_CACHE: join(dir, "cache.json") },
    })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Installed @nes/zxdev@0.3.1")
    expect(existsSync(join(dir, "tsc_packages", "@nes", "zxdev", "index.d.tsc"))).toBe(true)

    const manifest = readJson(join(dir, "tsc.package.json"))
    expect((manifest.dependencies as Record<string, string>)["@nes/zxdev"]).toBe("0.3.1")
    const builds = manifest.builds as Record<string, Record<string, unknown>>
    expect(JSON.stringify(builds["nes:zxdev"])).toBe(JSON.stringify({ profile: "zxdev", emit: "c", outDir: "build/nes-zxdev" }))
    expect((manifest.scripts as Record<string, string>)["nes:zxdev:dev"]).toBe("tsclang build --build nes:zxdev")

    const lock = readJson(join(dir, "tsc.package.lock")) as { packages: Record<string, Record<string, unknown>> }
    const entry = lock.packages["@nes/zxdev"]
    expect(entry.version).toBe("0.3.1")
    expect(entry.source).toBe("registry")
    expect(entry.resolved).toBe(fx.path)
    expect(typeof entry.integrity).toBe("string")
    expect((entry.platform as { builds: Record<string, string> }).builds["nes:zxdev"]).toBe(entryHash({ profile: "zxdev", emit: "c", outDir: "build/nes-zxdev" }))

    // integration with 1.1: installed platform is now listed
    const ls = await runCli(["platform", "list"], { cwd: dir })
    expect(ls.stdout).toContain("@nes/zxdev@0.3.1")
    expect(ls.stdout).toContain("profile: zxdev")
  })

  test("честный not-found: имени нет в каталоге — exit 1", async () => {
    const dir = mkTmp()
    const catalog = fixtureCatalog(dir, [])
    const r = await runCli(["platform", "install", "@nes/nope"], {
      cwd: dir, env: { ...process.env, TSC_REGISTRY: catalog, TSC_CATALOG_CACHE: join(dir, "cache.json") },
    })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("not found in the platform registry")
  })

  test("библиотека в каталоге — не платформа, подсказка tsclang install", async () => {
    const dir = mkTmp()
    const catalog = fixtureCatalog(dir, [{ name: "@tsclang/sqlite3", type: "library", version: "1.0.0", description: "lib", location: { url: "https://example.com/x.tspkg" } }])
    const r = await runCli(["platform", "install", "@tsclang/sqlite3"], {
      cwd: dir, env: { ...process.env, TSC_REGISTRY: catalog, TSC_CATALOG_CACHE: join(dir, "cache.json") },
    })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("not a platform")
    expect(r.stderr).toContain("tsclang install")
  })

  test("sha256 не совпал — exit 1", async () => {
    const dir = mkTmp()
    const fx = makeTspkg(dir, ZXDEV_V1)
    const bad = { ...fx.entry, location: { url: fx.path, sha256: "f".repeat(64) } }
    const catalog = fixtureCatalog(dir, [bad])
    const r = await runCli(["platform", "install", "@nes/zxdev"], {
      cwd: dir, env: { ...process.env, TSC_REGISTRY: catalog, TSC_CATALOG_CACHE: join(dir, "cache.json") },
    })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("sha256 mismatch")
  })

  test("офлайн без кэша каталога — громкий отказ (write-операция), exit 1", async () => {
    const dir = mkTmp()
    const r = await runCli(["platform", "install", "@nes/zxdev"], {
      cwd: dir, env: { ...process.env, TSC_NO_NETWORK: "1", TSC_CATALOG_CACHE: join(dir, "cache.json") },
    })
    expect(r.code).toBe(1)
    expect(r.stderr.toLowerCase()).toContain("offline")
  })

  test("конфликт с ручной записью (не-TTY) — запись не тронута, notice, exit 0", async () => {
    const dir = mkTmp()
    const fx = makeTspkg(dir, ZXDEV_V1)
    const catalog = fixtureCatalog(dir, [fx.entry])
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "proj", version: "0.1.0", type: "executable",
      builds: { "nes:zxdev": { profile: "my-custom" } },
    }, null, 2), "utf8")

    const r = await runCli(["platform", "install", "@nes/zxdev"], {
      cwd: dir, env: { ...process.env, TSC_REGISTRY: catalog, TSC_CATALOG_CACHE: join(dir, "cache.json") },
    })
    expect(r.code).toBe(0)
    expect(r.stdout + r.stderr).toContain("skipped")
    const manifest = readJson(join(dir, "tsc.package.json"))
    expect(JSON.stringify((manifest.builds as Record<string, unknown>)["nes:zxdev"])).toBe(JSON.stringify({ profile: "my-custom" }))
    // the script (no conflict) is still installed
    expect((manifest.scripts as Record<string, string>)["nes:zxdev:dev"]).toBe("tsclang build --build nes:zxdev")
  })

  test("повторная установка — идемпотентна: манифест и lock не меняются", async () => {
    const dir = mkTmp()
    const fx = makeTspkg(dir, ZXDEV_V1)
    const catalog = fixtureCatalog(dir, [fx.entry])
    const env = { ...process.env, TSC_REGISTRY: catalog, TSC_CATALOG_CACHE: join(dir, "cache.json") }
    await runCli(["platform", "install", "@nes/zxdev"], { cwd: dir, env })
    const manifest1 = readFileSync(join(dir, "tsc.package.json"), "utf8")
    const lock1 = readFileSync(join(dir, "tsc.package.lock"), "utf8")

    const r = await runCli(["platform", "install", "@nes/zxdev"], { cwd: dir, env })
    expect(r.code).toBe(0)
    expect(r.stdout + r.stderr).not.toContain("skipped")
    expect(readFileSync(join(dir, "tsc.package.json"), "utf8")).toBe(manifest1)
    expect(readFileSync(join(dir, "tsc.package.lock"), "utf8")).toBe(lock1)
  })

  test("обновление до новой версии: свой пресет обновлён, новый дописан, исчезнувший убран, чужие не тронуты", async () => {
    const dir = mkTmp()
    const v1 = makeTspkg(dir, ZXDEV_V1)
    const catalog = fixtureCatalog(dir, [v1.entry])
    const env = { ...process.env, TSC_REGISTRY: catalog, TSC_CATALOG_CACHE: join(dir, "cache.json") }
    await runCli(["platform", "install", "@nes/zxdev"], { cwd: dir, env })

    // user adds their own build; also edits the platform's script (owned)
    const manifest = readJson(join(dir, "tsc.package.json"))
    ;(manifest.builds as Record<string, unknown>)["user:mine"] = { profile: "user" }
    ;(manifest.scripts as Record<string, string>)["nes:zxdev:dev"] = "echo user edited"
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8")

    const v2spec = {
      name: "@nes/zxdev", version: "0.4.0",
      platform: {
        profile: "zxdev",
        builds: {
          zxdev: { profile: "zxdev", emit: "c", optimize: "2" },
          "zxdev-mini": { profile: "zxdev", emit: "c" },
        },
        scripts: { dist: "tsclang build --build nes:zxdev --optimize 2" },
      },
    }
    const v2 = makeTspkg(dir, v2spec)
    fixtureCatalog(dir, [v2.entry])

    const r = await runCli(["platform", "install", "@nes/zxdev"], { cwd: dir, env })
    expect(r.code).toBe(0)

    const m2 = readJson(join(dir, "tsc.package.json"))
    const builds = m2.builds as Record<string, Record<string, unknown>>
    const scripts = m2.scripts as Record<string, string>
    // own unedited preset → updated; new preset → added; user build → untouched;
    // disappeared own script (dev) → removed, but the user EDITED it → kept + warning
    expect(JSON.stringify(builds["nes:zxdev"])).toBe(JSON.stringify({ profile: "zxdev", emit: "c", optimize: "2", outDir: "build/nes-zxdev" }))
    expect(JSON.stringify(builds["nes:zxdev-mini"])).toBe(JSON.stringify({ profile: "zxdev", emit: "c", outDir: "build/nes-zxdev-mini" }))
    expect(JSON.stringify(builds["user:mine"])).toBe(JSON.stringify({ profile: "user" }))
    expect(scripts["nes:zxdev:dev"]).toBe("echo user edited") // edited by user — never touched
    expect(scripts["nes:zxdev:dist"]).toBe("tsclang build --build nes:zxdev --optimize 2")
    expect(r.stdout + r.stderr).toContain("edited")

    const lock = readJson(join(dir, "tsc.package.lock")) as { packages: Record<string, { platform?: { scripts?: Record<string, string> } }> }
    const own = lock.packages["@nes/zxdev"].platform?.scripts ?? {}
    expect(typeof own["nes:zxdev:dist"]).toBe("string")
    expect(own["nes:zxdev:dev"]).toBe(undefined) // not ours anymore (edited)
  })

  test("интерактивный конфликт: отказ пропустить — установка прервана, exit 1", async () => {
    const dir = mkTmp()
    const fx = makeTspkg(dir, ZXDEV_V1)
    const catalog = fixtureCatalog(dir, [fx.entry])
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "proj", version: "0.1.0", type: "executable",
      builds: { "nes:zxdev": { profile: "my-custom" } },
    }, null, 2), "utf8")

    const r = await runCli(["platform", "install", "@nes/zxdev"], {
      cwd: dir, input: "n\n",
      env: { ...process.env, TSC_REGISTRY: catalog, TSC_CATALOG_CACHE: join(dir, "cache.json"), TSC_PLATFORM_INTERACTIVE: "1" },
    })
    expect(r.code).toBe(1)
    const manifest = readJson(join(dir, "tsc.package.json"))
    expect(JSON.stringify((manifest.builds as Record<string, unknown>)["nes:zxdev"])).toBe(JSON.stringify({ profile: "my-custom" }))
    expect(manifest.scripts).toBe(undefined) // aborted before any manifest write
  })

  test("без имени — usage-ошибка, exit 1", async () => {
    const r = await runCli(["platform", "install"], { cwd: mkTmp() })
    expect(r.code).toBe(1)
    expect(r.stderr).toContain("usage")
  })
})
