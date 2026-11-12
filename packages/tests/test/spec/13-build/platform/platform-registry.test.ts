// 1.1 (#266): platform registry v1 — catalog parsing, cache TTL, offline
// gates, TSC_REGISTRY fixtures; search/list command behavior. Unit tests
// import pm source directly; e2e spawns the CLI.

import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import {
  parseCatalog, loadCatalog, filterCatalog, CatalogError, CATALOG_CACHE_TTL_MS,
  parsePlatformRequest, resolveCatalogVersion, planPlatformUpdates,
} from "../../../../../pm/src/platform-registry.js"

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
  const d = mkdtempSync(join(tmpdir(), "tsc-platreg-"))
  tmpDirs.push(d)
  return d
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

const VALID_CATALOG = JSON.stringify({
  version: 1,
  packages: [
    { name: "@tsclang/desktop", type: "platform", version: "1.0.0", description: "Official desktop platform (gcc, make, cmake)", location: { url: "https://example.com/desktop-1.0.0.tspkg", sha256: "0".repeat(64) } },
    { name: "@nes/zxdev", type: "platform", version: "0.3.1", description: "ZX Spectrum dev platform (z88dk)", location: { url: "https://example.com/zxdev-0.3.1.tspkg" } },
    { name: "@tsclang/sqlite3", type: "library", version: "1.2.0", description: "SQLite C wrapper", location: { url: "https://example.com/sqlite3-1.2.0.tspkg" } },
  ],
})

function fixtureCatalog(dir: string, content = VALID_CATALOG): string {
  const p = join(dir, "catalog.json")
  writeFileSync(p, content, "utf8")
  return p
}

// === parseCatalog: valid / broken / unknown schema ===

describe("13-build/platform 1.1 — parseCatalog: схема каталога v1 (#266)", () => {
  test("валидный каталог разбирается: 3 записи, type несётся явно", () => {
    const cat = parseCatalog(VALID_CATALOG)
    expect(cat.version).toBe(1)
    expect(cat.packages.length).toBe(3)
    expect(cat.packages[0].type).toBe("platform")
    expect(cat.packages[2].type).toBe("library")
    expect(cat.packages[1].location?.url).toBe("https://example.com/zxdev-0.3.1.tspkg")
  })

  test("битый JSON → CatalogError", () => {
    let threw = false
    try { parseCatalog("{ not json") } catch (e) { threw = e instanceof CatalogError }
    expect(threw).toBe(true)
  })

  test("неизвестная версия схемы → CatalogError с версией", () => {
    let msg = ""
    try { parseCatalog(JSON.stringify({ version: 7, packages: [] })) } catch (e) { msg = (e as Error).message }
    expect(msg.includes("7")).toBe(true)
  })

  test("запись без имени/type/version → CatalogError (схема)", () => {
    let threw = false
    try { parseCatalog(JSON.stringify({ version: 1, packages: [{ name: "x", version: "1.0.0" }] })) } catch (e) { threw = e instanceof CatalogError }
    expect(threw).toBe(true)
  })
})

// === filterCatalog: search semantics ===

describe("13-build/platform 1.1 — filterCatalog: поиск (#266)", () => {
  test("подстрока в имени, без учёта регистра", () => {
    const cat = parseCatalog(VALID_CATALOG)
    expect(filterCatalog(cat, "ZXDEV").length).toBe(1)
    expect(filterCatalog(cat, "zxdev")[0].name).toBe("@nes/zxdev")
  })

  test("подстрока в описании находит запись", () => {
    const cat = parseCatalog(VALID_CATALOG)
    expect(filterCatalog(cat, "spectrum").map((p) => p.name)).toContain("@nes/zxdev")
  })

  test("пустой запрос — все записи (type column различает платформы/библиотеки)", () => {
    const cat = parseCatalog(VALID_CATALOG)
    expect(filterCatalog(cat, "").length).toBe(3)
  })

  test("нет совпадений — пустой массив", () => {
    const cat = parseCatalog(VALID_CATALOG)
    expect(filterCatalog(cat, "frobnicate").length).toBe(0)
  })
})

// === loadCatalog: sources & gates (DI fetch + injected clock) ===

describe("13-build/platform 1.1 — loadCatalog: источники и гейты (#266)", () => {
  test("TSC_REGISTRY-путь читается напрямую: source file, сеть не зовётся, кэш не пишется", async () => {
    const dir = mkTmp()
    const fixture = fixtureCatalog(dir)
    const cachePath = join(dir, "cache.json")
    const boom = async () => { throw new Error("network must not be touched") }
    const res = await loadCatalog({ registry: fixture, cachePath, fetchImpl: boom as unknown as typeof fetch })
    expect(res.source).toBe("file")
    expect(res.catalog.packages.length).toBe(3)
    expect(existsSync(cachePath)).toBe(false)
  })

  test("свежий кэш (TTL) используется без сети", async () => {
    const dir = mkTmp()
    const cachePath = join(dir, "cache.json")
    writeFileSync(cachePath, JSON.stringify({ fetchedAt: Date.now(), catalog: JSON.parse(VALID_CATALOG) }), "utf8")
    const boom = async () => { throw new Error("network must not be touched") }
    const res = await loadCatalog({ cachePath, fetchImpl: boom as unknown as typeof fetch })
    expect(res.source).toBe("cache")
    expect(res.catalog.packages.length).toBe(3)
  })

  test("протухший кэш (старше TTL) → fetch и перезапись кэша", async () => {
    const dir = mkTmp()
    const cachePath = join(dir, "cache.json")
    const stale = Date.now() - CATALOG_CACHE_TTL_MS - 1000
    writeFileSync(cachePath, JSON.stringify({ fetchedAt: stale, catalog: { version: 1, packages: [] } }), "utf8")
    let fetched = 0
    const fetchImpl = (async () => {
      fetched++
      return new Response(VALID_CATALOG, { status: 200 })
    }) as unknown as typeof fetch
    const res = await loadCatalog({ cachePath, fetchImpl })
    expect(fetched).toBe(1)
    expect(res.source).toBe("registry")
    expect(res.catalog.packages.length).toBe(3)
    const cached = JSON.parse(readFileSync(cachePath, "utf8"))
    expect(cached.catalog.packages.length).toBe(3)
  })

  test("офлайн + нет кэша → CatalogError 'offline' (тихий провал, не крэш)", async () => {
    const dir = mkTmp()
    let threw: unknown = null
    try { await loadCatalog({ offline: true, cachePath: join(dir, "cache.json") }) } catch (e) { threw = e }
    expect(threw instanceof CatalogError).toBe(true)
    expect((threw as Error).message.includes("offline")).toBe(true)
  })

  test("офлайн + свежий кэш → кэш, сеть не зовётся", async () => {
    const dir = mkTmp()
    const cachePath = join(dir, "cache.json")
    writeFileSync(cachePath, JSON.stringify({ fetchedAt: Date.now(), catalog: JSON.parse(VALID_CATALOG) }), "utf8")
    const boom = async () => { throw new Error("network must not be touched") }
    const res = await loadCatalog({ offline: true, cachePath, fetchImpl: boom as unknown as typeof fetch })
    expect(res.source).toBe("cache")
  })

  test("fetch-таймаут/сбой сети → CatalogError (не системное исключение)", async () => {
    const dir = mkTmp()
    const fetchImpl = (async () => { throw new TypeError("fetch failed") }) as unknown as typeof fetch
    let threw: unknown = null
    try { await loadCatalog({ cachePath: join(dir, "cache.json"), fetchImpl }) } catch (e) { threw = e }
    expect(threw instanceof CatalogError).toBe(true)
  })
})

// === e2e: tsclang platform search / list ===

describe("13-build/platform 1.1 — e2e: platform search / list (#266)", () => {
  test("platform search по TSC_REGISTRY-фикстуре: находит платформу, type отличим", async () => {
    const dir = mkTmp()
    const fixture = fixtureCatalog(dir)
    const r = await runCli(["platform", "search", "zxdev"], { cwd: dir, env: { ...process.env, TSC_REGISTRY: fixture, TSC_CATALOG_CACHE: join(dir, "cache.json") } })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("@nes/zxdev@0.3.1")
    expect(r.stdout).toContain("platform")
  })

  test("platform search без совпадений — пустой результат, exit 0", async () => {
    const dir = mkTmp()
    const fixture = fixtureCatalog(dir)
    const r = await runCli(["platform", "search", "frobnicate"], { cwd: dir, env: { ...process.env, TSC_REGISTRY: fixture, TSC_CATALOG_CACHE: join(dir, "cache.json") } })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("No platforms found")
  })

  test("platform search оффлайн без кэша — тихий отказ, exit 0, не unknown command", async () => {
    const dir = mkTmp()
    const r = await runCli(["platform", "search", "zxdev"], { cwd: dir, env: { ...process.env, TSC_NO_NETWORK: "1", TSC_CATALOG_CACHE: join(dir, "cache.json") } })
    expect(r.code).toBe(0)
    expect(r.stdout + r.stderr).toContain("offline")
    expect((r.stdout + r.stderr).includes("unknown")).toBe(false)
  })

  test("platform list: установленная платформа в tsc_packages видна с профилем", async () => {
    const dir = mkTmp()
    const pkgDir = join(dir, "tsc_packages", "@nes", "zxdev")
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, "tsc.package.json"), JSON.stringify({
      name: "@nes/zxdev", version: "0.3.1", type: "platform",
      platform: { profile: "zxdev", builds: { "nes:zxdev": { emit: "c" } } },
    }, null, 2))
    writeFileSync(join(pkgDir, "index.d.tsc"), "declare platform {\n  bits: 8\n}\n")

    const r = await runCli(["platform", "list"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("@nes/zxdev@0.3.1")
    expect(r.stdout).toContain("zxdev")
  })

  test("platform list: обычные библиотеки не показываются как платформы", async () => {
    const dir = mkTmp()
    const pkgDir = join(dir, "tsc_packages", "mylib")
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, "tsc.package.json"), JSON.stringify({
      name: "mylib", version: "1.0.0", type: "library",
    }, null, 2))

    const r = await runCli(["platform", "list"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("No platforms installed")
  })

  test("platform list вне проекта — не ошибка", async () => {
    const r = await runCli(["platform", "list"], { cwd: mkTmp() })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("No platforms installed")
  })
})

// === #280: version history (versions map + minCli) and name@spec resolution ===

const HISTORY_CATALOG = JSON.stringify({
  version: 1,
  packages: [
    {
      name: "@nes/zxdev", type: "platform", version: "0.5.0", description: "ZX dev",
      location: { url: "https://example.com/zxdev-0.5.0.tspkg" },
      versions: {
        "0.3.1": { location: { url: "https://example.com/zxdev-0.3.1.tspkg", sha256: "a".repeat(64) } },
        "0.4.0": { location: { url: "https://example.com/zxdev-0.4.0.tspkg" }, minCli: "0.9.0" },
        "0.5.0": { location: { url: "https://example.com/zxdev-0.5.0.tspkg" } },
      },
    },
    { name: "@old/legacy", type: "platform", version: "1.0.0", description: "no versions map", location: { url: "https://example.com/legacy-1.0.0.tspkg" } },
  ],
})

function historyEntry(): ReturnType<typeof parseCatalog>["packages"][number] {
  return parseCatalog(HISTORY_CATALOG).packages[0]
}

describe("13-build/platform #280 — parseCatalog: карта versions", () => {
  test("versions-карта разбирается, плоские поля остаются latest", () => {
    const entry = historyEntry()
    expect(entry.version).toBe("0.5.0")
    expect(entry.versions!["0.3.1"].location.url).toBe("https://example.com/zxdev-0.3.1.tspkg")
    expect(entry.versions!["0.3.1"].location.sha256).toBe("a".repeat(64))
    expect(entry.versions!["0.4.0"].minCli).toBe("0.9.0")
  })

  test("каталог без versions по-прежнему валиден (обратная совместимость)", () => {
    const cat = parseCatalog(VALID_CATALOG)
    expect(cat.packages.length).toBe(3)
    expect("versions" in cat.packages[0]).toBe(false)
  })

  test("versions без плоского location → schema error (latest обязан резолвиться)", () => {
    let msg = ""
    const bad = JSON.stringify({
      version: 1,
      packages: [{
        name: "@nes/zxdev", type: "platform", version: "0.5.0", description: "",
        versions: { "0.5.0": { location: { url: "https://example.com/z.tspkg" } } },
      }],
    })
    try { parseCatalog(bad) } catch (e) { msg = (e as Error).message }
    expect(msg.includes("location")).toBe(true)
  })

  test("versions, не содержащий плоский version → schema error", () => {
    let threw = false
    const bad = JSON.stringify({
      version: 1,
      packages: [{
        name: "@nes/zxdev", type: "platform", version: "0.5.0", description: "",
        location: { url: "https://example.com/zxdev-0.5.0.tspkg" },
        versions: { "0.3.1": { location: { url: "https://example.com/z.tspkg" } } },
      }],
    })
    try { parseCatalog(bad) } catch (e) { threw = e instanceof CatalogError }
    expect(threw).toBe(true)
  })

  test("versions[latest] разошёлся с плоским location → schema error (desync guard)", () => {
    let threw = false
    const bad = JSON.stringify({
      version: 1,
      packages: [{
        name: "@nes/zxdev", type: "platform", version: "0.5.0", description: "",
        location: { url: "https://example.com/zxdev-0.5.0.tspkg" },
        versions: { "0.5.0": { location: { url: "https://example.com/DIFFERENT.tspkg" } } },
      }],
    })
    try { parseCatalog(bad) } catch (e) { threw = e instanceof CatalogError }
    expect(threw).toBe(true)
  })

  test("неканонический ключ versions → schema error", () => {
    let threw = false
    const bad = JSON.stringify({
      version: 1,
      packages: [{
        name: "@nes/zxdev", type: "platform", version: "0.5.0", description: "",
        location: { url: "https://example.com/z.tspkg" },
        versions: { "0.4": { location: { url: "https://example.com/z.tspkg" } }, "0.5.0": { location: { url: "https://example.com/z.tspkg" } } },
      }],
    })
    try { parseCatalog(bad) } catch (e) { threw = e instanceof CatalogError }
    expect(threw).toBe(true)
  })

  test("versions-значение без url / битый minCli → schema error", () => {
    const base = (versions: unknown) => JSON.stringify({
      version: 1,
      packages: [{
        name: "@nes/zxdev", type: "platform", version: "0.5.0", description: "",
        location: { url: "https://example.com/z.tspkg" },
        versions: { "0.5.0": { location: { url: "https://example.com/z.tspkg" } }, ...versions as object },
      }],
    })
    let threwNoUrl = false
    try { parseCatalog(base({ "0.4.0": { location: {} } })) } catch (e) { threwNoUrl = e instanceof CatalogError }
    expect(threwNoUrl).toBe(true)
    let threwMinCli = false
    try { parseCatalog(base({ "0.4.0": { location: { url: "https://example.com/z.tspkg" }, minCli: "не-версия" } })) } catch (e) { threwMinCli = e instanceof CatalogError }
    expect(threwMinCli).toBe(true)
  })
})

describe("13-build/platform #280 — parsePlatformRequest: name@spec", () => {
  test("имя со scope без спеки — bare", () => {
    expect(JSON.stringify(parsePlatformRequest("@nes/zxdev"))).toBe(JSON.stringify({ name: "@nes/zxdev", spec: "" }))
  })

  test("имя со scope и диапазоном — split по ПОСЛЕДНЕМУ @", () => {
    expect(JSON.stringify(parsePlatformRequest("@nes/zxdev@^0.4"))).toBe(JSON.stringify({ name: "@nes/zxdev", spec: "^0.4" }))
  })

  test("имя со scope и exact-версией", () => {
    expect(JSON.stringify(parsePlatformRequest("@nes/zxdev@0.4.0"))).toBe(JSON.stringify({ name: "@nes/zxdev", spec: "0.4.0" }))
  })

  test("простое имя без scope", () => {
    expect(JSON.stringify(parsePlatformRequest("zxdev@~0.3"))).toBe(JSON.stringify({ name: "zxdev", spec: "~0.3" }))
    expect(JSON.stringify(parsePlatformRequest("zxdev"))).toBe(JSON.stringify({ name: "zxdev", spec: "" }))
  })

  test("мусор → null", () => {
    expect(parsePlatformRequest("")).toBe(null)
    expect(parsePlatformRequest("@")).toBe(null)
  })
})

describe("13-build/platform #280 — resolveCatalogVersion: bare/exact/range + minCli", () => {
  test("bare и latest/* → плоская latest-версия", () => {
    expect(resolveCatalogVersion(historyEntry(), "").status).toBe("resolved")
    expect(resolveCatalogVersion(historyEntry(), "").version).toBe("0.5.0")
    expect(resolveCatalogVersion(historyEntry(), "*").version).toBe("0.5.0")
    expect(resolveCatalogVersion(historyEntry(), "latest").version).toBe("0.5.0")
  })

  test("bare отдаёт location версии, не плоский", () => {
    const r = resolveCatalogVersion(historyEntry(), "")
    expect(r.status).toBe("resolved")
    expect((r as { location: { sha256?: string } }).location.sha256).toBe(undefined)
  })

  test("exact из истории", () => {
    const r = resolveCatalogVersion(historyEntry(), "0.3.1")
    expect(r.status).toBe("resolved")
    expect((r as { version: string }).version).toBe("0.3.1")
    expect((r as { location: { sha256?: string } }).location.sha256).toBe("a".repeat(64))
  })

  test("exact, которого нет → no-version со списком доступных", () => {
    const r = resolveCatalogVersion(historyEntry(), "9.9.9")
    expect(r.status).toBe("no-version")
    expect(JSON.stringify((r as { available: string[] }).available)).toBe(JSON.stringify(["0.3.1", "0.4.0", "0.5.0"]))
  })

  test("диапазон → старшая удовлетворяющая", () => {
    expect(resolveCatalogVersion(historyEntry(), "^0.4").version).toBe("0.4.0")
    expect(resolveCatalogVersion(historyEntry(), ">=0.3.1").version).toBe("0.5.0")
  })

  test("запись без versions-карты: bare и exact=version работают", () => {
    const legacy = parseCatalog(HISTORY_CATALOG).packages[1]
    expect(resolveCatalogVersion(legacy, "").version).toBe("1.0.0")
    expect(resolveCatalogVersion(legacy, "1.0.0").version).toBe("1.0.0")
    expect(resolveCatalogVersion(legacy, "1.0.1").status).toBe("no-version")
  })

  test("minCli: CLI старее требуемого → cli-too-old с requires", () => {
    const r = resolveCatalogVersion(historyEntry(), "0.4.0", { cliVersion: "0.8.2" })
    expect(r.status).toBe("cli-too-old")
    expect((r as { version: string; requires: string }).version).toBe("0.4.0")
    expect((r as { version: string; requires: string }).requires).toBe("0.9.0")
  })

  test("minCli: CLI достаточно новый → resolved", () => {
    expect(resolveCatalogVersion(historyEntry(), "0.4.0", { cliVersion: "0.9.0" }).version).toBe("0.4.0")
    expect(resolveCatalogVersion(historyEntry(), "0.4.0", { cliVersion: "2.0.0" }).version).toBe("0.4.0")
  })

  test("диапазон: несовместимая по minCli старшая пропускается, берётся совместимая", () => {
    // 0.5.0 требует CLI 9.9.9, 0.4.0 — 0.9.0; на старых CLI диапазон
    // '>=0.3.1' резолвится в старшую СОВМЕСТИМУЮ, а не в старшую вообще.
    const entry = historyEntry()
    const withMinCli = { ...entry, versions: { ...entry.versions!, "0.5.0": { location: entry.versions!["0.5.0"].location, minCli: "9.9.9" } } }
    expect(resolveCatalogVersion(withMinCli, ">=0.3.1", { cliVersion: "0.8.2" }).version).toBe("0.3.1")
    expect(resolveCatalogVersion(withMinCli, ">=0.3.1", { cliVersion: "0.9.5" }).version).toBe("0.4.0")
    expect(resolveCatalogVersion(withMinCli, ">=0.3.1", { cliVersion: "9.9.9" }).version).toBe("0.5.0")
  })

  test("bare: latest несовместима по minCli → cli-too-old без отката на старые", () => {
    const entry = historyEntry()
    const withMinCli = { ...entry, versions: { ...entry.versions!, "0.5.0": { location: entry.versions!["0.5.0"].location, minCli: "9.9.9" } } }
    const r = resolveCatalogVersion(withMinCli, "", { cliVersion: "0.9.0" })
    expect(r.status).toBe("cli-too-old")
    expect((r as { requires: string }).requires).toBe("9.9.9")
  })

  test("без cliVersion minCli не фильтрует (неизвестный CLI не блокирует)", () => {
    expect(resolveCatalogVersion(historyEntry(), "0.4.0").version).toBe("0.4.0")
  })
})

describe("13-build/platform #280 — planPlatformUpdates: диапазоны и пины", () => {
  test("bare/legacy (без spec) → плоский latest, как в #279", () => {
    const { updates, pinned } = planPlatformUpdates([{ name: "@nes/zxdev", version: "0.3.1" }], parseCatalog(HISTORY_CATALOG))
    expect(updates.length).toBe(1)
    expect(updates[0].next).toBe("0.5.0")
    expect(updates[0].spec).toBe("")
    expect(pinned.length).toBe(0)
  })

  test("range: цель — старшая ВНУТРИ диапазона, а не latest", () => {
    const { updates } = planPlatformUpdates([{ name: "@nes/zxdev", version: "0.3.1", spec: "^0.4" }], parseCatalog(HISTORY_CATALOG))
    expect(updates.length).toBe(1)
    expect(updates[0].next).toBe("0.4.0")
  })

  test("range: установленная версия уже старшая в диапазоне — нет апдейта (no downgrade)", () => {
    const { updates } = planPlatformUpdates([{ name: "@nes/zxdev", version: "0.4.0", spec: "^0.4" }], parseCatalog(HISTORY_CATALOG))
    expect(updates.length).toBe(0)
  })

  test("'*' ведёт себя как bare latest", () => {
    const { updates } = planPlatformUpdates([{ name: "@nes/zxdev", version: "0.3.1", spec: "*" }], parseCatalog(HISTORY_CATALOG))
    expect(updates.length).toBe(1)
    expect(updates[0].next).toBe("0.5.0")
  })

  test("exact-спека — пин: не обновляется даже при более новом latest", () => {
    const { updates, pinned } = planPlatformUpdates([{ name: "@nes/zxdev", version: "0.3.1", spec: "0.3.1" }], parseCatalog(HISTORY_CATALOG))
    expect(updates.length).toBe(0)
    expect(JSON.stringify(pinned)).toBe(JSON.stringify([{ name: "@nes/zxdev", version: "0.3.1" }]))
  })

  test("диапазон пуст в каталоге — тихо нет апдейта (юзер сам выбрал диапазон)", () => {
    const { updates } = planPlatformUpdates([{ name: "@nes/zxdev", version: "0.5.0", spec: "^0.4" }], parseCatalog(HISTORY_CATALOG))
    expect(updates.length).toBe(0)
  })

  test("minCli тихо исключает несовместимые версии из целей update", () => {
    const entry = historyEntry()
    const withMinCli = { ...entry, versions: { ...entry.versions!, "0.5.0": { location: entry.versions!["0.5.0"].location, minCli: "9.9.9" } } }
    const cat = { version: 1, packages: [withMinCli, ...parseCatalog(HISTORY_CATALOG).packages.slice(1)] }
    const { updates } = planPlatformUpdates([{ name: "@nes/zxdev", version: "0.3.1", spec: ">=0.3.1" }], cat, { cliVersion: "0.9.5" })
    expect(updates.length).toBe(1)
    expect(updates[0].next).toBe("0.4.0")
  })
})
