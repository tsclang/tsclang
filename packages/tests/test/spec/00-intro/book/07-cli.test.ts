// Book coverage: packages/spec/book/00-intro/00.7-cli-overview/ (16 chapters).
// Most of 00.7 is probed command-by-command by the 13-build/cli dictionary
// suite (help/build/run/debug/lint/explain/install/update/remove/lsp...).
// This file covers the GAPS that suite and the corpus leave open:
//   - `tsclang test` end-to-end (00.7.5: exit codes, ✓/✗ lines, recursion, timeout dir)
//   - `tsclang emit-dts` positive path (00.7.10)
//   - `tsclang search` empty query / no match (00.7.14)
//   - `tsclang publish` positive path (00.7.15)
//   - build never overwrites an existing CMakeLists.txt (00.4.4:41)
// Run: pnpm tsx packages/tests/test/spec/00-intro/book/run.ts (pnpm build first).

import { spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { after, describe, expect, test } from "@tsclang/test-engine"
import { bashLoginArgs, msys2Bash, shQuote, toMsysPath } from "@tsclang/test-engine"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const DIST_BIN = join(ROOT, "packages", "cli", "dist", "index.js")
const SRC_BIN = join(ROOT, "packages", "cli", "src", "index.ts")
const USE_TSX = !existsSync(DIST_BIN)
const TSX_LOADER = pathToFileURL(join(ROOT, "node_modules", "tsx", "dist", "esm", "index.mjs")).href

interface CliResult { code: number; stdout: string; stderr: string }

function runCli(args: string[], opts: { cwd?: string; timeoutMs?: number; viaMsys2?: boolean } = {}): Promise<CliResult> {
  return new Promise((resolveFn, reject) => {
    const cwd = opts.cwd ?? ROOT
    let proc
    if (opts.viaMsys2 && process.platform === "win32") {
      // gcc invoked by the CLI needs the MSYS2 runtime environment (CONTEXT.md gotcha)
      const binMsys = toMsysPath(USE_TSX ? SRC_BIN : DIST_BIN)
      const nodeMsys = toMsysPath(process.execPath)
      const tail = USE_TSX ? ["--import", TSX_LOADER, binMsys, ...args] : [binMsys, ...args]
      const script = `cd ${shQuote(toMsysPath(cwd))} && ${shQuote(nodeMsys)} ${tail.map(shQuote).join(" ")}`
      proc = spawn(msys2Bash(), bashLoginArgs(script), { cwd, stdio: ["ignore", "pipe", "pipe"] })
    } else {
      const argv = USE_TSX ? ["--import", TSX_LOADER, SRC_BIN, ...args] : [DIST_BIN, ...args]
      proc = spawn(process.execPath, argv, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    }
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

const out = (r: CliResult) => `${r.stdout}${r.stderr}`

const tmpDirs: string[] = []
function mkTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), `tsc-book7-${tmpDirs.length}-`))
  tmpDirs.push(dir)
  return dir
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

// === 00.7.5 test — end-to-end ===

describe("00-intro/book — 00.7.5 tsclang test e2e", () => {
  // 00.7.5:33-39 — init scaffolds test/main.test.tsc, `tsclang test` passes it
  test("init myapp → test/main.test.tsc; tsclang test → 1 passed, exit 0", async () => {
    const dir = mkTmp()
    const init = await runCli(["init", "myapp"], { cwd: dir })
    expect(init.code).toBe(0)
    expect(existsSync(join(dir, "myapp", "test", "main.test.tsc"))).toBe(true)

    const r = await runCli(["test"], { cwd: join(dir, "myapp"), viaMsys2: true })
    expect(r.code).toBe(0)
    expect(out(r)).toContain("1 passed")
    expect(out(r)).toContain("✓")
  }, 120000)

  // 00.7.5:44 — no test/ directory → exit 1
  test("test без каталога test/ — exit 1", async () => {
    const r = await runCli(["test"], { cwd: mkTmp() })
    expect(r.code).toBe(1)
  })

  // 00.7.5:14 — a test fails iff the program exits non-zero
  test("упавший тест (process.exit(1)) — ✗, 1 failed, exit 1", async () => {
    const dir = mkTmp()
    mkdirSync(join(dir, "test"), { recursive: true })
    writeFileSync(join(dir, "test", "main.test.tsc"), 'console.error("boom");\nprocess.exit(1);\n')
    const r = await runCli(["test"], { cwd: dir, viaMsys2: true })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("1 failed")
    expect(out(r)).toContain("✗")
  }, 120000)

  // 00.7.5:12 — recursive discovery of *.test.tsc under test/
  test("поиск рекурсивный: test/unit/deep/a.test.tsc находится", async () => {
    const dir = mkTmp()
    const deep = join(dir, "test", "unit", "deep")
    mkdirSync(deep, { recursive: true })
    writeFileSync(join(deep, "a.test.tsc"), 'console.log("deep");\n')
    const r = await runCli(["test"], { cwd: dir, viaMsys2: true })
    expect(r.code).toBe(0)
    expect(out(r)).toContain("a.test.tsc")
    expect(out(r)).toContain("1 passed")
  }, 120000)

  // 00.7.5:23-27 — the book's own test-file example passes
  test("книжный пример теста (add + PASS-вывод) проходит", async () => {
    const dir = mkTmp()
    mkdirSync(join(dir, "test"), { recursive: true })
    writeFileSync(join(dir, "test", "main.test.tsc"), `
function add(a: i32, b: i32): i32 {
  return a + b
}

let result = add(1, 1)
if (result != 2) {
  console.error("FAIL: add(1, 1) = " + result.toString())
  process.exit(1)
}
console.log("PASS: add(1, 1) = " + result.toString())
`)
    const r = await runCli(["test"], { cwd: dir, viaMsys2: true })
    expect(r.code).toBe(0)
    expect(out(r)).toContain("1 passed")
  }, 120000)
})

// === 00.7.10 emit-dts — positive path ===

describe("00-intro/book — 00.7.10 emit-dts", () => {
  test("emit-dts hello.tsc → hello.d.tsc + «Emitted … (N declarations)», exit 0", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), `
export function add(a: i32, b: i32): i32 { return a + b }
export const version: string = "1.0.0"
`)
    const r = await runCli(["emit-dts", "hello.tsc"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "hello.d.tsc"))).toBe(true)
    expect(r.stdout).toContain("Emitted hello.d.tsc")
    expect(r.stdout).toMatch(/\(\d+ declarations?\)/)
  })

  test("emit-dts без файла — exit 1 (00.7.10:26)", async () => {
    const r = await runCli(["emit-dts"], { cwd: mkTmp() })
    expect(r.code).toBe(1)
  })
})

// === 00.7.14 search — empty query and no match ===

describe("00-intro/book — 00.7.14 search: края запросов", () => {
  // 00.7.14:20 — без запроса выводится весь реестр
  test("search без запроса — весь реестр, exit 0", async () => {
    const r = await runCli(["search"], { cwd: mkTmp() })
    expect(r.code).toBe(0)
    expect(out(r).length).toBeGreaterThan(0)
    expect(out(r)).not.toContain("No packages found")
  })

  // 00.7.14:20 — нет совпадений — не ошибка
  test("search zzqqxx → No packages found, exit 0", async () => {
    const r = await runCli(["search", "zzqqxx-no-such-package"], { cwd: mkTmp() })
    expect(r.code).toBe(0)
    expect(out(r)).toContain("No packages found")
  })
})

// === 00.7.15 publish — positive path ===

describe("00-intro/book — 00.7.15 publish: успех", () => {
  test("publish с манифестом → mylib-0.1.0.tspkg + Published mylib@0.1.0 (N files)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "mylib", version: "0.1.0", type: "package", main: "src/index.tsc",
    }, null, 2))
    mkdirSync(join(dir, "src"), { recursive: true })
    writeFileSync(join(dir, "src", "index.tsc"), `export function hi(): string { return "hi" }\n`)
    const r = await runCli(["publish"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "mylib-0.1.0.tspkg"))).toBe(true)
    expect(r.stdout).toContain("Published mylib@0.1.0")
    expect(r.stdout).toMatch(/\(\d+ files?\)/)
  })

  test("publish без манифеста — exit 1 (00.7.15:29)", async () => {
    const r = await runCli(["publish"], { cwd: mkTmp() })
    expect(r.code).toBe(1)
  })
})

// === 00.4.4 build never overwrites an existing CMakeLists.txt ===

describe("00-intro/book — 00.4.4 CMakeLists не перезаписывается", () => {
  test("существующий CMakeLists.txt в out-dir survives build", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), 'console.log("hi");\n')
    mkdirSync(join(dir, "out"), { recursive: true })
    const custom = "# my custom build, hands off\n"
    writeFileSync(join(dir, "out", "CMakeLists.txt"), custom)

    const r = await runCli(["build", "hello.tsc", "--out-dir", "out"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "out", "hello.c"))).toBe(true)
    expect(readFileSync(join(dir, "out", "CMakeLists.txt"), "utf8")).toBe(custom)
  })
})
