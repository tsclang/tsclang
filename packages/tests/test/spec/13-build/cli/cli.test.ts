// CLI surface tests driven by dictionary.json.
// The dictionary records what the BOOK (00.2.2 help output / 00.2.3 quick start /
// 00.7-cli-overview reference) claims about the CLI; these tests probe the actual
// binary against it.
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
// target, mcu, toolchain, toolchainFile, arch, emit, linkerScript, frequency, freq, allocator, debug, command
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

  test("--help печатает usage-строку из книги (00.2.2:49)", async () => {
    const r = await runCli(["--help"])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain(dict.usageLine)
  })

  test("-h — алиас --help", async () => {
    const r = await runCli(["-h"])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain(dict.usageLine)
  })

  test("--no-color не ломает глобальные флаги (00.2.2:72)", async () => {
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

describe("13-build/cli — help-вывод: команды из книги (00.2.2:45-75)", () => {
  test("все команды словаря присутствуют в help с книжными описаниями", async () => {
    const r = await runCli(["--help"])
    expect(r.code).toBe(0)
    for (const cmd of dict.commands) {
      expect(r.stdout).toContain(cmd.description)
    }
  })
})

describe("13-build/cli — помощь по команде (00.2.2:77-87)", () => {
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
  const missingInput = ["build", "debug", "lint", "format", "validate-config"]
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

  test("lsp — сервер живёт на stdio до kill (00.2.2:62)", async () => {
    const argv = USE_TSX ? ["--import", TSX_LOADER, SRC_BIN, "lsp"] : [DIST_BIN, "lsp"]
    const proc = spawn(process.execPath, argv, { cwd: mkTmp(), stdio: ["pipe", "pipe", "pipe"] })
    await new Promise((res) => setTimeout(res, 800))
    const exited = proc.exitCode !== null
    proc.kill("SIGKILL")
    expect(exited).toBe(false)
  })
})

// === build — claimed result (00.2.3) and options table (00.7.2) ===

describe("13-build/cli — build: заявленный результат и опции (00.2.3:37, таблица 00.7.2)", () => {
  test("build hello.tsc --out-dir out → out/hello.c + out/CMakeLists.txt (00.2.3:37)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "hello.tsc", "--out-dir", "out"], { cwd: dir })
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
    ["--ram-size 2048", ["--ram-size", "2048"]],
    ["--stack-size 1024", ["--stack-size", "1024"]],
  ]
  for (const [label, flags] of probes) {
    test(`build принимает ${label} (таблица 00.7.2)`, async () => {
      const dir = mkTmp()
      writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
      const r = await runCli(["build", "hello.tsc", ...flags, "--out-dir", "out"], { cwd: dir })
      expect(r.code).toBe(0)
    })
  }

  test("--build <имя> — именованная сборка из tsc.package.json (00.7.2:29,43-56)", async () => {
    const dir = mkTmp()
    mkdirSync(join(dir, "src"))
    writeFileSync(join(dir, "src", "main.tsc"), HELLO_TSC)
    writeFileSync(join(dir, "tsc.package.json"), PKG_JSON)
    const r = await runCli(["build", "src/main.tsc", "--build", "desktop", "--out-dir", "out"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "out", "main.c"))).toBe(true)
  })

  test("--emit foo → ConfigError unknown emit value (не тихий fallback на c)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "hello.tsc", "--emit", "foo", "--out-dir", "out"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("ConfigError: unknown emit value 'foo' (valid: c, binary, hex, flash, wasm, cmake)")
  })

  // Toolchain-gated emit values
  if (hasTool("gcc")) {
    test("--emit binary → бинарник (требует gcc)", async () => {
      const dir = mkTmp()
      writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
      const r = await runCli(["build", "hello.tsc", "--emit", "binary", "--out-dir", "out"], { cwd: dir, timeoutMs: 120000, viaMsys2: true })
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
      const r = await runCli(["build", "hello.tsc", "--emit", "wasm", "--out-dir", "out"], { cwd: dir, timeoutMs: 120000 })
      expect(r.code).toBe(0)
    })
  } else {
    test.skip("--emit wasm (пропуск: emcc недоступен)", () => {})
  }

  if (hasTool("avr-gcc")) {
    test("--target avr --emit hex (требует avr-gcc)", async () => {
      const dir = mkTmp()
      writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
      const r = await runCli(["build", "hello.tsc", "--target", "avr", "--emit", "hex", "--out-dir", "out"], { cwd: dir, timeoutMs: 120000 })
      expect(r.code).toBe(0)
    })
  } else {
    test.skip("--target avr --emit hex (пропуск: avr-gcc недоступен)", () => {})
  }

  test("--emit cmake → CMakeLists.txt в out-dir, без компиляции .c (toolchain не нужен)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "hello.tsc", "--emit", "cmake", "--out-dir", "out"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "out", "CMakeLists.txt"))).toBe(true)
    expect(existsSync(join(dir, "out", "hello.c"))).toBe(false)
    expect(readFileSync(join(dir, "out", "CMakeLists.txt"), "utf8")).toContain("project(hello C)")
  })

  if (hasTool("gcc")) {
    test("--emit binary --command <binary> — запуск собранного бинаря (gcc; host-shell синтаксис)", async () => {
      const dir = mkTmp()
      writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
      // host shell: cmd.exe on win32 (backslashes, no "./"), /bin/sh elsewhere
      const runCmd = process.platform === "win32" ? "out\\hello" : "./out/hello"
      const r = await runCli(["build", "hello.tsc", "--emit", "binary", "--out-dir", "out", "--command", runCmd], { cwd: dir, timeoutMs: 120000, viaMsys2: process.platform === "win32" })
      expect(r.code).toBe(0)
      expect(r.stdout).toContain("hi")
    })
  } else {
    test.skip("--emit binary --command — требует gcc", () => {})
  }
})

// === --command: пост-билд хук (#238) ===

describe("13-build/cli — --command post-build hook", () => {
  test("--command 'echo ok' (emit c) — выполняется после успешной сборки", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "hello.tsc", "--command", "echo ok"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("ok")
  })

  test("TSC_OUT_DIR виден команде", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "hello.tsc", "--out-dir", "out", "--command", "node -p process.env.TSC_OUT_DIR"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain(join(dir, "out"))
  })

  test("--command 'exit 7' — код выхода команды пробрасывается", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "hello.tsc", "--command", "exit 7"], { cwd: dir })
    expect(r.code).toBe(7)
  })

  test("провал сборки — команда НЕ выполняется", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "bad.tsc"), "let x: = ;\n")
    const r = await runCli(["build", "bad.tsc", "--command", "echo no"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(r.stdout).not.toContain("no")
  })

  test("builds.<name>.command в манифесте — авто-запуск именованной сборки", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "app", version: "0.1.0", type: "executable", main: "hello.tsc",
      builds: { x: { emit: "c", command: "echo from-manifest" } },
    }))
    const r = await runCli(["build", "x"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("from-manifest")
  })

  test("CLI --command перекрывает манифестную builds.<name>.command", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "app", version: "0.1.0", type: "executable", main: "hello.tsc",
      builds: { x: { emit: "c", command: "echo from-manifest" } },
    }))
    const r = await runCli(["build", "x", "--command", "echo from-flag"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("from-flag")
    expect(r.stdout).not.toContain("from-manifest")
  })

  test("--emit cmake --command — команда выполняется и после cmake-генерации", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "hello.tsc", "--emit", "cmake", "--out-dir", "out", "--command", "echo cmake-ok"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("cmake-ok")
  })

  test("validate-config принимает builds.<name>.command", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "app", version: "0.1.0", type: "executable", main: "hello.tsc",
      builds: { x: { emit: "c", command: "echo hi" } },
    }))
    const r = await runCli(["validate-config", "tsc.package.json"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(out(r)).not.toContain("unknown key 'command'")
  })

  test("validate-config принимает library-манифест без main (run-проверка удалена вместе с run)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "mylib", version: "0.1.0", type: "library",
    }))
    const r = await runCli(["validate-config", "tsc.package.json"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(out(r)).not.toContain("tsclang run")
  })
})

// === debug (00.7.3-debug; живёт после удаления run — #238) ===

describe("13-build/cli — debug (00.7.3-debug)", () => {
  // run удалён (заменён `build --emit binary --command`); покрытие запуска бинаря —
  // в "build: заявленный результат и опции" (--emit binary --command)
  test("debug --help — exit 0 (команда живёт после удаления run)", async () => {
    const r = await runCli(["debug", "--help"])
    expect(r.code).toBe(0)
    expect(r.stdout.length > 0).toBeTruthy()
  })
})

// === 00.2.3: init ===

describe("13-build/cli — init (00.2.3:5-20)", () => {
  test("init myapp создаёт tsc.package.json + src/main.tsc (00.2.3:13-20)", async () => {
    const dir = mkTmp()
    const r = await runCli(["init", "myapp"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "myapp", "tsc.package.json"))).toBe(true)
    expect(existsSync(join(dir, "myapp", "src", "main.tsc"))).toBe(true)
  })

  test("init mylib --library (00.2.3:9)", async () => {
    const dir = mkTmp()
    const r = await runCli(["init", "mylib", "--library"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "mylib", "tsc.package.json"))).toBe(true)
  })

  test("init mywrapper --declaration (00.2.3:10)", async () => {
    const dir = mkTmp()
    const r = await runCli(["init", "mywrapper", "--declaration"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "mywrapper", "tsc.package.json"))).toBe(true)
  })
})

// === lint / format / explain / emit-dts / validate-config / packages (00.7.6-00.7.14) ===

describe("13-build/cli — lint (00.7.7)", () => {
  test("lint файл с no-unreachable — ненулевой exit, LintError в выводе", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "bad.tsc"), 'function f(): void { return; console.log("x"); }\n')
    const r = await runCli(["lint", "bad.tsc"], { cwd: dir })
    expect(r.code === 0).toBe(false)
    expect(out(r)).toContain("no-unreachable")
  })

  test("lint --rule=prefer-const — фильтр по одному правилу (00.7.7:30)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "letty.tsc"), "let x = 1;\nconsole.log(x);\n")
    const r = await runCli(["lint", "letty.tsc", "--rule=prefer-const"], { cwd: dir })
    expect(out(r)).toContain("prefer-const")
  })

  test("lint --fix переписывает let → const (00.7.7:29)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "letty.tsc"), "let x = 1;\nconsole.log(x);\n")
    await runCli(["lint", "letty.tsc", "--fix"], { cwd: dir })
    const fixed = readFileSync(join(dir, "letty.tsc"), "utf8")
    expect(fixed).toContain("const x = 1")
  })
})

describe("13-build/cli — format/explain/emit-dts/validate-config (00.7.8-00.7.10, 00.7.6)", () => {
  test("format hello.tsc — exit 0", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["format", "hello.tsc"], { cwd: dir })
    expect(r.code).toBe(0)
  })

  test("explain E012 — объяснение кода ошибки (00.7.9)", async () => {
    const r = await runCli(["explain", "E012"], { cwd: mkTmp() })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("E012")
  })

  test("emit-dts hello.tsc создаёт hello.d.tsc (00.7.10)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["emit-dts", "hello.tsc"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "hello.d.tsc"))).toBe(true)
  })

  test("validate-config tsc.package.json — exit 0 (00.7.6)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), PKG_JSON)
    const r = await runCli(["validate-config", "tsc.package.json"], { cwd: dir })
    expect(r.code).toBe(0)
  })
})

describe("13-build/cli — install/update/search/publish (00.2.3:39-46, 00.7.11-00.7.14)", () => {
  test("search regex — exit 0, непустой вывод (00.7.13)", async () => {
    const r = await runCli(["search", "regex"], { cwd: mkTmp() })
    expect(r.code).toBe(0)
    expect(r.stdout.length > 0).toBeTruthy()
  })

  test("search несуществующего — не unknown command", async () => {
    const r = await runCli(["search", "zzz-no-such"], { cwd: mkTmp() })
    notUnknown(r)
  })

  test("update mylib в изолированном cwd — не unknown command (00.7.12)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), PKG_JSON)
    const r = await runCli(["update", "mylib"], { cwd: dir })
    notUnknown(r)
  })
})

// === surface fixes: #247 bare exit 0, #243 universal --help, #244 unknown-option errors, #242 run --no-cache ===

describe("13-build/cli — фиксы поверхности CLI (#242 #243 #244 #247)", () => {
  test("пустой вызов: печатает help, exit 0 (#247)", async () => {
    const r = await runCli([])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain(dict.usageLine)
  })

  test("<cmd> --help — exit 0 и справка для ВСЕХ команд словаря (#243)", async () => {
    for (const cmd of dict.commands) {
      const r = await runCli([cmd.name, "--help"], { cwd: mkTmp(), timeoutMs: 15000 })
      expect(r.code).toBe(0)
      expect(r.stdout.length > 0).toBeTruthy()
      expect(out(r).includes("unknown command")).toBe(false)
    }
  })

  test("опечатка --outdir → unknown option, exit 1, артефакты не пишутся (#244)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "hello.tsc", "--outdir", "out"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("unknown option '--outdir'")
    expect(existsSync(join(dir, "hello.c"))).toBe(false)
  })

  test("инлайн-форма --emit=c → точная подсказка про '=' (#244)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "hello.tsc", "--emit=c"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("does not support the inline '='")
  })

  test("unknown-опция у команды без опций (format --watch) → ошибка (#244)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["format", "hello.tsc", "--watch"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("unknown option '--watch' for 'format'")
  })

  test("-w больше не алиас --watch → unknown option (алиас вычищен)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "hello.tsc", "-w"], { cwd: dir, timeoutMs: 15000 })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("unknown option '-w'")
  })

  test("build-cmake удалена — unknown command (заменена на build --emit cmake)", async () => {
    const r = await runCli(["build-cmake"], { cwd: mkTmp() })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("unknown command 'build-cmake'")
  })

  test("run удалена — unknown command (заменена на build --emit binary --command)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["run", "hello.tsc"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("unknown command 'run'")
  })

  test("--outDir (camelCase) → unknown option (переименован в --out-dir, без алиаса)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "hello.tsc", "--outDir", "out"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("unknown option '--outDir'")
  })

  test("глобальный help не рекламирует пер-командную --no-cache — она в справке build", async () => {
    const r = await runCli(["--help"])
    expect(r.code).toBe(0)
    expect(r.stdout).not.toContain("Bypass compilation cache")
    const h = await runCli(["build", "--help"])
    expect(h.code).toBe(0)
    expect(h.stdout).toContain("--no-cache")
  })
})
