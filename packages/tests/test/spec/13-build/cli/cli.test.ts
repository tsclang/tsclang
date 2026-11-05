// CLI surface tests driven by dictionary.json.
// The dictionary records what the BOOK (00.2.2-installation / 00.2.3-cli-overview)
// claims about the CLI; these tests probe the actual binary against it.
// Run: pnpm tsx packages/tests/test/spec/13-build/cli/run.ts (pnpm build first).

import { spawn, spawnSync } from "node:child_process"
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

const dict = JSON.parse(readFileSync(join(here, "dictionary.json"), "utf8"))

interface CliResult { code: number; stdout: string; stderr: string }

function runCli(args: string[], opts: { cwd?: string; timeoutMs?: number; viaMsys2?: boolean } = {}): Promise<CliResult> {
  return new Promise((resolveFn, reject) => {
    const cwd = opts.cwd ?? ROOT
    let proc
    if (opts.viaMsys2 && process.platform === "win32") {
      // gcc invoked by the CLI needs the MSYS2 runtime environment (CONTEXT.md gotcha);
      // the corpus .sh tests do the same via the runner's bash wrapper
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
const notUnknown = (r: CliResult) => expect(out(r).includes("unknown command")).toBe(false)

// Toolchain gates probed once (spawnSync "--version" — presence only)
const tools = new Map<string, boolean>()
function hasTool(name: string): boolean {
  if (!tools.has(name)) {
    const r = spawnSync(name, ["--version"], { timeout: 15000, encoding: "utf8" })
    tools.set(name, r.status === 0)
  }
  return tools.get(name)!
}

const tmpDirs: string[] = []
function mkTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), `tsc-cli-${tmpDirs.length}-`))
  tmpDirs.push(dir)
  return dir
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }) })

const HELLO_TSC = 'console.log("hi");\n'
// builds.<name> keys must stay within VALID_BUILD_KEYS (config-validator.ts):
// target, mcu, toolchain, toolchainFile, arch, emit, linkerScript, frequency, freq, allocator, debug
const PKG_JSON = JSON.stringify({
  name: "probe", version: "0.1.0", type: "executable", main: "src/main.tsc",
  builds: { desktop: { emit: "c" } },
}, null, 2)

// === 00.2.2: version and global options ===

describe("13-build/cli — версия и глобальные флаги (00.2.2)", () => {
  test("--version печатает tsclang <semver>, exit 0", async () => {
    const r = await runCli(["--version"])
    expect(r.code).toBe(0)
    expect(r.stdout.trim()).toMatch("^tsclang \\d+\\.\\d+\\.\\d+$")
  })

  test("заявленный книгой вывод `tsclang 0.1.0` совпадает с фактическим (00.2.2:17-25)", async () => {
    const r = await runCli(["--version"])
    expect(r.stdout.trim()).toBe(dict.version.expectedOutput)
  })

  test("-v — алиас --version", async () => {
    const r = await runCli(["-v"])
    expect(r.code).toBe(0)
    expect(r.stdout.trim()).toBe(dict.version.expectedOutput)
  })

  test("--help печатает usage-строку из книги (00.2.2:36)", async () => {
    const r = await runCli(["--help"])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain(dict.usageLine)
  })

  test("-h — алиас --help", async () => {
    const r = await runCli(["-h"])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain(dict.usageLine)
  })

  test("--no-color не ломает глобальные флаги (00.2.2:59)", async () => {
    const r = await runCli(["--no-color", "--version"])
    expect(r.code).toBe(0)
    expect(r.stdout.trim()).toBe(dict.version.expectedOutput)
  })

  test("неизвестная команда — ошибка unknown command, ненулевой exit", async () => {
    const r = await runCli(["definitely-not-a-command"])
    expect(r.code === 0).toBe(false)
    expect(out(r)).toContain("unknown command")
  })
})

// === 00.2.2: help output — every dictionary command is dispatched ===

describe("13-build/cli — help-вывод: команды из книги (00.2.2:38-54)", () => {
  test("все команды словаря присутствуют в help с книжными описаниями", async () => {
    const r = await runCli(["--help"])
    expect(r.code).toBe(0)
    for (const cmd of dict.commands) {
      expect(r.stdout).toContain(cmd.description)
    }
  })
})

describe("13-build/cli — помощь по команде (00.2.2:63-69)", () => {
  for (const name of dict.perCommandHelp.examples) {
    test(`tsclang ${name} --help — exit 0, непустой вывод`, async () => {
      const r = await runCli([name, "--help"])
      expect(r.code).toBe(0)
      expect(r.stdout.length > 0).toBeTruthy()
    })
  }
})

// === smoke: every dictionary command is dispatched (not "unknown command") ===

describe("13-build/cli — smoke: каждая команда словаря диспетчеризуется", () => {
  const missingInput = ["build", "run", "debug", "build-cmake", "lint", "format", "validate-config"]
  for (const name of missingInput) {
    test(`${name} без аргументов — ошибка входа, не unknown command`, async () => {
      const r = await runCli([name], { cwd: mkTmp() })
      expect(r.code === 0).toBe(false)
      notUnknown(r)
    })
  }

  test("explain без кода ошибки — не unknown command", async () => {
    const r = await runCli(["explain"], { cwd: mkTmp() })
    notUnknown(r)
  })

  test("test в пустом cwd — не unknown command", async () => {
    const r = await runCli(["test"], { cwd: mkTmp() })
    notUnknown(r)
  })

  test("install несуществующего пакета — ошибка реестра, не unknown command", async () => {
    const r = await runCli(["install", "no-such-pkg-xyz"], { cwd: mkTmp() })
    notUnknown(r)
  })

  test("update без аргументов в изолированном cwd — не unknown command", async () => {
    const r = await runCli(["update"], { cwd: mkTmp() })
    notUnknown(r)
  })

  test("publish в изолированном cwd — не unknown command", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), PKG_JSON)
    const r = await runCli(["publish"], { cwd: dir })
    notUnknown(r)
  })

  test("lsp — сервер живёт на stdio до kill (00.2.2:49)", async () => {
    const argv = USE_TSX ? ["--import", TSX_LOADER, SRC_BIN, "lsp"] : [DIST_BIN, "lsp"]
    const proc = spawn(process.execPath, argv, { cwd: mkTmp(), stdio: ["pipe", "pipe", "pipe"] })
    await new Promise((res) => setTimeout(res, 800))
    const exited = proc.exitCode !== null
    proc.kill("SIGKILL")
    expect(exited).toBe(false)
  })
})

// === 00.2.3: build — claimed options table ===

describe("13-build/cli — build: заявленный результат и опции (00.2.3:11-30)", () => {
  test("build hello.tsc --outDir out → out/hello.c + out/CMakeLists.txt (00.2.3:30)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "hello.tsc", "--outDir", "out"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "out", "hello.c"))).toBe(true)
    expect(existsSync(join(dir, "out", "CMakeLists.txt"))).toBe(true)
  })

  // Table-driven: every option claimed in the book's table must be accepted
  const probes: Array<[string, string[]]> = [
    ["--emit c", ["--emit", "c"]],
    ["--target desktop", ["--target", "desktop"]],
    ["--platform avr", ["--platform", "avr"]],
    ["--mcu atmega328p", ["--mcu", "atmega328p"]],
    ["--default-number i32", ["--default-number", "i32"]],
    ["--allocator static", ["--allocator", "static"]],
    ["--async none", ["--async", "none"]],
    ["--strict no-any,safe-math,no-lossy-cast", ["--strict", "no-any,safe-math,no-lossy-cast"]],
    ["--optimize O2", ["--optimize", "O2"]],
    ["--debug", ["--debug"]],
    ["--sourcemap", ["--sourcemap"]],
    ["--all-errors", ["--all-errors"]],
    ["--no-cache", ["--no-cache"]],
  ]
  for (const [label, flags] of probes) {
    test(`build принимает ${label} (таблица 00.2.3)`, async () => {
      const dir = mkTmp()
      writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
      const r = await runCli(["build", "hello.tsc", ...flags, "--outDir", "out"], { cwd: dir })
      expect(r.code).toBe(0)
    })
  }

  test("--build <имя> — именованная сборка из tsc.package.json (00.2.3:17)", async () => {
    const dir = mkTmp()
    mkdirSync(join(dir, "src"))
    writeFileSync(join(dir, "src", "main.tsc"), HELLO_TSC)
    writeFileSync(join(dir, "tsc.package.json"), PKG_JSON)
    const r = await runCli(["build", "src/main.tsc", "--build", "desktop", "--outDir", "out"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "out", "main.c"))).toBe(true)
  })

  // Toolchain-gated emit values
  if (hasTool("gcc")) {
    test("--emit binary → бинарник (требует gcc)", async () => {
      const dir = mkTmp()
      writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
      const r = await runCli(["build", "hello.tsc", "--emit", "binary", "--outDir", "out"], { cwd: dir, timeoutMs: 120000, viaMsys2: true })
      expect(r.code).toBe(0)
      expect(existsSync(join(dir, "out", "hello.exe")) || existsSync(join(dir, "out", "hello"))).toBe(true)
    })
  } else {
    test.skip("--emit binary → бинарник (пропуск: gcc недоступен)", () => {})
  }

  if (hasTool("emcc")) {
    test("--emit wasm (требует emcc)", async () => {
      const dir = mkTmp()
      writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
      const r = await runCli(["build", "hello.tsc", "--emit", "wasm", "--outDir", "out"], { cwd: dir, timeoutMs: 120000 })
      expect(r.code).toBe(0)
    })
  } else {
    test.skip("--emit wasm (пропуск: emcc недоступен)", () => {})
  }

  if (hasTool("avr-gcc")) {
    test("--target avr --emit hex (требует avr-gcc)", async () => {
      const dir = mkTmp()
      writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
      const r = await runCli(["build", "hello.tsc", "--target", "avr", "--emit", "hex", "--outDir", "out"], { cwd: dir, timeoutMs: 120000 })
      expect(r.code).toBe(0)
    })
  } else {
    test.skip("--target avr --emit hex (пропуск: avr-gcc недоступен)", () => {})
  }
})

// === 00.2.3: run / debug (gcc-gated) ===

describe("13-build/cli — run/debug (00.2.3:32-47)", () => {
  if (hasTool("gcc")) {
    test("run hello.tsc — компилирует, запускает, печатает вывод (00.2.3:35-39)", async () => {
      const dir = mkTmp()
      writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
      const r = await runCli(["run", "hello.tsc"], { cwd: dir, timeoutMs: 180000, viaMsys2: true })
      expect(r.code).toBe(0)
      expect(r.stdout).toContain("hi")
    })

    test("run hello.tsc --optimize O2 (00.4.5:57)", async () => {
      const dir = mkTmp()
      writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
      const r = await runCli(["run", "hello.tsc", "--optimize", "O2"], { cwd: dir, timeoutMs: 180000, viaMsys2: true })
      expect(r.code).toBe(0)
      expect(r.stdout).toContain("hi")
    })
  } else {
    test.skip("run — требует gcc", () => {})
    test.skip("run --optimize — требует gcc", () => {})
  }
})

// === 00.2.3: init ===

describe("13-build/cli — init (00.2.3:65-80)", () => {
  test("init myapp создаёт tsc.package.json + src/main.tsc (00.2.3:73-80)", async () => {
    const dir = mkTmp()
    const r = await runCli(["init", "myapp"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "myapp", "tsc.package.json"))).toBe(true)
    expect(existsSync(join(dir, "myapp", "src", "main.tsc"))).toBe(true)
  })

  test("init mylib --library (00.2.3:69)", async () => {
    const dir = mkTmp()
    const r = await runCli(["init", "mylib", "--library"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "mylib", "tsc.package.json"))).toBe(true)
  })

  test("init mywrapper --declaration (00.2.3:70)", async () => {
    const dir = mkTmp()
    const r = await runCli(["init", "mywrapper", "--declaration"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "mywrapper", "tsc.package.json"))).toBe(true)
  })
})

// === 00.2.3: lint / format / explain / emit-dts / validate-config / packages ===

describe("13-build/cli — lint (00.2.3:82-88)", () => {
  test("lint файл с no-unreachable — ненулевой exit, LintError в выводе", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "bad.tsc"), 'function f(): void { return; console.log("x"); }\n')
    const r = await runCli(["lint", "bad.tsc"], { cwd: dir })
    expect(r.code === 0).toBe(false)
    expect(out(r)).toContain("no-unreachable")
  })

  test("lint --rule=prefer-const — фильтр по одному правилу (00.2.3:87)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "letty.tsc"), "let x = 1;\nconsole.log(x);\n")
    const r = await runCli(["lint", "letty.tsc", "--rule=prefer-const"], { cwd: dir })
    expect(out(r)).toContain("prefer-const")
  })

  test("lint --fix переписывает let → const (00.2.3:86)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "letty.tsc"), "let x = 1;\nconsole.log(x);\n")
    await runCli(["lint", "letty.tsc", "--fix"], { cwd: dir })
    const fixed = readFileSync(join(dir, "letty.tsc"), "utf8")
    expect(fixed).toContain("const x = 1")
  })
})

describe("13-build/cli — format/explain/emit-dts/validate-config (00.2.3:90-124)", () => {
  test("format hello.tsc — exit 0", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["format", "hello.tsc"], { cwd: dir })
    expect(r.code).toBe(0)
  })

  test("explain E012 — объяснение кода ошибки (00.2.3:99)", async () => {
    const r = await runCli(["explain", "E012"], { cwd: mkTmp() })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("E012")
  })

  test("emit-dts hello.tsc создаёт hello.d.tsc (00.2.3:105-108)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["emit-dts", "hello.tsc"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "hello.d.tsc"))).toBe(true)
  })

  test("validate-config tsc.package.json — exit 0 (00.2.3:121)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), PKG_JSON)
    const r = await runCli(["validate-config", "tsc.package.json"], { cwd: dir })
    expect(r.code).toBe(0)
  })
})

describe("13-build/cli — install/update/search/publish (00.2.3:126-134)", () => {
  test("search regex — exit 0, непустой вывод (00.2.3:132)", async () => {
    const r = await runCli(["search", "regex"], { cwd: mkTmp() })
    expect(r.code).toBe(0)
    expect(r.stdout.length > 0).toBeTruthy()
  })

  test("search несуществующего — не unknown command", async () => {
    const r = await runCli(["search", "zzz-no-such"], { cwd: mkTmp() })
    notUnknown(r)
  })

  test("update mylib в изолированном cwd — не unknown command (00.2.3:131)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), PKG_JSON)
    const r = await runCli(["update", "mylib"], { cwd: dir })
    notUnknown(r)
  })
})
