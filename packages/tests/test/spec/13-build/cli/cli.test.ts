// CLI surface tests driven by dictionary.json.
// The dictionary records what the BOOK (00.2.2 help output / 00.2.4 quick start /
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
import { buildAvrdudeArgs } from "../../../../../cli/src/cli/flash.js"

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, "..", "..", "..", "..", "..", "..")
const DIST_BIN = join(ROOT, "packages", "cli", "dist", "index.js")
const SRC_BIN = join(ROOT, "packages", "cli", "src", "index.ts")
const USE_TSX = !existsSync(DIST_BIN)
const TSX_LOADER = pathToFileURL(join(ROOT, "node_modules", "tsx", "dist", "esm", "index.mjs")).href

const dict = JSON.parse(readFileSync(join(here, "dictionary.json"), "utf8"))

interface CliResult { code: number; stdout: string; stderr: string }

function runCli(args: string[], opts: { cwd?: string; timeoutMs?: number; viaMsys2?: boolean; env?: NodeJS.ProcessEnv } = {}): Promise<CliResult> {
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
      proc = spawn(msys2Bash(), bashLoginArgs(script), { cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"] })
    } else {
      const argv = USE_TSX ? ["--import", TSX_LOADER, SRC_BIN, ...args] : [DIST_BIN, ...args]
      proc = spawn(process.execPath, argv, { cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"] })
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
  const missingInput = ["build", "debug", "lint", "validate-config"]
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

// === build — claimed result (00.2.4) and options table (00.7.2) ===

describe("13-build/cli — build: заявленный результат и опции (00.2.4:37, таблица 00.7.2)", () => {
  test("build hello.tsc --out-dir out → out/hello.c + out/CMakeLists.txt (00.2.4:37)", async () => {
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
    expect(out(r)).toContain("ConfigError: unknown emit value 'foo' (valid: c, binary, exec, hex, flash, wasm, cmake, dts)")
  })

  test("--build <имя> без позиционного файла — input из main манифеста (#240)", async () => {
    const dir = mkTmp()
    mkdirSync(join(dir, "src"))
    writeFileSync(join(dir, "src", "main.tsc"), HELLO_TSC)
    writeFileSync(join(dir, "tsc.package.json"), PKG_JSON)
    const r = await runCli(["build", "--build", "desktop", "--out-dir", "out"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "out", "main.c"))).toBe(true)
  })

  test("--emit c перед файлом — позиционный определяется верно (не значение флага)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "--emit", "c", "hello.tsc", "--out-dir", "out"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "out", "hello.c"))).toBe(true)
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

  // #241: a missing toolchain must produce a clear ConfigError, not "gcc failed:"
  // with empty diagnostics (spawnSync returns status:null + .error when the
  // binary is not found). Empty PATH makes the absence deterministic everywhere.
  test("--emit binary без gcc в PATH — ConfigError requires gcc, не 'gcc failed:'", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "hello.tsc", "--emit", "binary", "--out-dir", "out"], { cwd: dir, env: { ...process.env, PATH: "" } })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("ConfigError: --emit binary requires gcc in PATH")
    expect(out(r)).not.toContain("gcc failed")
  })

  test("--emit hex/flash без avr-gcc в PATH — ConfigError (pre-check существует)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "hello.tsc", "--target", "avr", "--emit", "hex", "--out-dir", "out"], { cwd: dir, env: { ...process.env, PATH: "" } })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("ConfigError: --emit hex/flash requires avr-gcc in PATH")
  })

  // #241: the avrdude command line is pure string-building (flash delivery has no
  // hardware-free E2E on win32 — spawn can't exec script shims), so it is a unit
  // test against the real builder used by build.ts
  test("buildAvrdudeArgs: programmer/port/baud/extraFlags → полная команда", () => {
    const args = buildAvrdudeArgs(
      { programmer: "arduino", port: "COM3", baud: 115200, extraFlags: ["-v"] },
      "atmega328p",
      "out/main.hex",
    )
    expect(args.join(" ")).toBe("-c arduino -p atmega328p -P COM3 -b 115200 -v -U flash:w:out/main.hex:i")
  })

  test("buildAvrdudeArgs: без baud/extraFlags — флаги не добавляются", () => {
    const args = buildAvrdudeArgs({ programmer: "usbasp", port: "/dev/ttyUSB0" }, "atmega2560", "build/uno/app.hex")
    expect(args.join(" ")).toBe("-c usbasp -p atmega2560 -P /dev/ttyUSB0 -U flash:w:build/uno/app.hex:i")
  })

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

  // --emit exec (#238): emit axis = pipeline ladder; exec = binary + launch the
  // artifact by direct spawn (no shell, absolute path — the cmd.exe "./x" vs "x\"
  // quirk never applies). Symmetry: exec:binary = flash:hex.
  test("--emit exec --command — конфликт: exec сам запускает артефакт (ConfigError)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["build", "hello.tsc", "--emit", "exec", "--command", "echo no"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("ConfigError: --emit exec already launches the built artifact")
    expect(out(r)).not.toContain("no")
  })

  if (hasTool("gcc")) {
    test("--emit exec — запускает собранный бинарник, stdout программы виден", async () => {
      const dir = mkTmp()
      writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
      const r = await runCli(["build", "hello.tsc", "--emit", "exec", "--out-dir", "out"], { cwd: dir, timeoutMs: 120000, viaMsys2: process.platform === "win32" })
      expect(r.code).toBe(0)
      expect(r.stdout).toContain("hi")
    })

    test("--emit exec — бинарник остаётся на диске после запуска", async () => {
      const dir = mkTmp()
      writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
      const r = await runCli(["build", "hello.tsc", "--emit", "exec", "--out-dir", "out"], { cwd: dir, timeoutMs: 120000, viaMsys2: process.platform === "win32" })
      expect(r.code).toBe(0)
      expect(existsSync(join(dir, "out", "hello.exe")) || existsSync(join(dir, "out", "hello"))).toBe(true)
    })

    test("--emit exec — exit-код программы пробрасывается (process.exit(7))", async () => {
      const dir = mkTmp()
      writeFileSync(join(dir, "exit7.tsc"), 'console.log("running");\nprocess.exit(7);\n')
      const r = await runCli(["build", "exit7.tsc", "--emit", "exec", "--out-dir", "out"], { cwd: dir, timeoutMs: 120000, viaMsys2: process.platform === "win32" })
      expect(r.stdout).toContain("running")
      expect(r.code).toBe(7)
    })

    test("манифест builds.dev = {emit: exec} через --build — запускает", async () => {
      const dir = mkTmp()
      mkdirSync(join(dir, "src"), { recursive: true })
      writeFileSync(join(dir, "src", "main.tsc"), HELLO_TSC)
      writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
        name: "app", version: "0.1.0", type: "executable", main: "src/main.tsc",
        builds: { dev: { emit: "exec" } },
      }))
      const r = await runCli(["build", "dev", "--out-dir", "out"], { cwd: dir, timeoutMs: 120000, viaMsys2: process.platform === "win32" })
      expect(r.code).toBe(0)
      expect(r.stdout).toContain("hi")
    })
  } else {
    test.skip("--emit exec — требует gcc", () => {})
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

  test("validate-config принимает все ключи build-записи, которые build читает (#239)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "main.tsc"), HELLO_TSC)
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "x", version: "0.1.0", type: "executable", main: "main.tsc",
      builds: { uno: {
        emit: "hex", outDir: "dist", optimize: "Os", profile: "avr",
        defaultNumber: "i32", mcu: "atmega328p",
        flash: { programmer: "arduino", port: "COM3" },
      } },
    }))
    const r = await runCli(["validate-config", "tsc.package.json"], { cwd: dir })
    expect(r.code).toBe(0)
  })

  test("validate-config требует type — отсутствует → ConfigError (#252)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "app", version: "0.1.0", main: "main.tsc",
    }))
    const r = await runCli(["validate-config", "tsc.package.json"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("missing required field 'type'")
  })

  test("validate-config принимает type package — родовый тип (#252)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "app", version: "0.1.0", type: "package",
    }))
    const r = await runCli(["validate-config", "tsc.package.json"], { cwd: dir })
    expect(r.code).toBe(0)
  })

  test("validate-config отвергает неизвестный type (#252)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "app", version: "0.1.0", type: "weird",
    }))
    const r = await runCli(["validate-config", "tsc.package.json"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("'type' must be one of")
    expect(out(r)).toContain("package")
  })
})

// === run: именованные задачи из scripts (#251; npm-модель) ===

describe("13-build/cli — run named scripts", () => {
  function writeScriptsPkg(dir: string, scripts: Record<string, unknown>) {
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "app", version: "0.1.0", type: "executable", main: "hello.tsc",
      scripts,
    }))
  }

  test("run <name> — выполняет скрипт, stdout виден", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    writeScriptsPkg(dir, { hello: "echo from-script" })
    const r = await runCli(["run", "hello"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("from-script")
  })

  test("exit-код скрипта пробрасывается (exit 7)", async () => {
    const dir = mkTmp()
    writeScriptsPkg(dir, { fail: "exit 7" })
    const r = await runCli(["run", "fail"], { cwd: dir })
    expect(r.code).toBe(7)
  })

  test("unknown script — ConfigError + список доступных", async () => {
    const dir = mkTmp()
    writeScriptsPkg(dir, { build: "echo b", flash: "echo f" })
    const r = await runCli(["run", "ghost"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("unknown script 'ghost'")
    expect(out(r)).toContain("build")
    expect(out(r)).toContain("flash")
  })

  test("run без аргумента — список скриптов, exit 0", async () => {
    const dir = mkTmp()
    writeScriptsPkg(dir, { build: "echo b", dev: "echo d" })
    const r = await runCli(["run"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("build")
    expect(r.stdout).toContain("dev")
  })

  test("tsclang внутри скрипта резолвится (self-shim в PATH)", async () => {
    const dir = mkTmp()
    writeScriptsPkg(dir, { probe: "tsclang --version" })
    const r = await runCli(["run", "probe"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/tsclang \d+\.\d+\.\d+/)
  })

  test("скрипт вызывает tsclang build — компилирует через self-shim", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    writeScriptsPkg(dir, { build: "tsclang build hello.tsc --emit c" })
    const r = await runCli(["run", "build"], { cwd: dir, timeoutMs: 90000 })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "hello.c"))).toBeTruthy()
  })

  test("scripts из манифеста зависимости не читаются (только корневой)", async () => {
    const dir = mkTmp()
    writeScriptsPkg(dir, { build: "echo root" })
    mkdirSync(join(dir, "tsc_packages", "dep"), { recursive: true })
    writeFileSync(join(dir, "tsc_packages", "dep", "tsc.package.json"), JSON.stringify({
      name: "dep", version: "0.1.0", type: "library", scripts: { ghost: "echo dep" },
    }))
    const r = await runCli(["run", "ghost"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("unknown script 'ghost'")
  })

  test("без tsc.package.json — понятная ошибка", async () => {
    const r = await runCli(["run", "hello"], { cwd: mkTmp() })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("requires a tsc.package.json")
  })

  test("validate-config принимает корректный scripts", async () => {
    const dir = mkTmp()
    writeScriptsPkg(dir, { build: "tsclang build", test: "tsclang test" })
    const r = await runCli(["validate-config", "tsc.package.json"], { cwd: dir })
    expect(r.code).toBe(0)
  })

  test("validate-config отвергает scripts с не-строковым значением", async () => {
    const dir = mkTmp()
    writeScriptsPkg(dir, { build: 42 })
    const r = await runCli(["validate-config", "tsc.package.json"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("scripts.build")
  })

  test("validate-config отвергает scripts не-объект", async () => {
    const dir = mkTmp()
    writeScriptsPkg(dir, {})
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "app", version: "0.1.0", type: "executable", main: "hello.tsc", scripts: ["a", "b"],
    }))
    const r = await runCli(["validate-config", "tsc.package.json"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("scripts")
  })

  test("run --help — exit 0", async () => {
    const r = await runCli(["run", "--help"])
    expect(r.code).toBe(0)
    expect(r.stdout.length > 0).toBeTruthy()
  })

  test("run — известная команда (не unknown; npm-семантика #251)", async () => {
    const dir = mkTmp()
    writeScriptsPkg(dir, { hello: "echo hi" })
    const r = await runCli(["run", "hello"], { cwd: dir })
    expect(out(r).includes("unknown command 'run'")).toBe(false)
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

// === 00.2.4: init ===

describe("13-build/cli — init (00.2.4:5-20)", () => {
  test("init myapp создаёт tsc.package.json + src/main.tsc (00.2.4:13-20)", async () => {
    const dir = mkTmp()
    const r = await runCli(["init", "myapp"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "myapp", "tsc.package.json"))).toBe(true)
    expect(existsSync(join(dir, "myapp", "src", "main.tsc"))).toBe(true)
  })

  test("init mylib --library (00.2.4:9)", async () => {
    const dir = mkTmp()
    const r = await runCli(["init", "mylib", "--library"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "mylib", "tsc.package.json"))).toBe(true)
  })

  test("init mywrapper --declaration (00.2.4:10)", async () => {
    const dir = mkTmp()
    const r = await runCli(["init", "mywrapper", "--declaration"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "mywrapper", "tsc.package.json"))).toBe(true)
  })

  test("init --type library mylib — имя читается после значения флага (#252)", async () => {
    const dir = mkTmp()
    const r = await runCli(["init", "--type", "library", "mylib"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "mylib", "tsc.package.json"))).toBe(true)
    expect(existsSync(join(dir, "library"))).toBe(false)
  })

  test("init mylib --library — создаёт index.tsc (#252)", async () => {
    const dir = mkTmp()
    const r = await runCli(["init", "mylib", "--library"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "mylib", "index.tsc"))).toBe(true)
  })

  test("init mywrapper --declaration — создаёт index.d.tsc (#252)", async () => {
    const dir = mkTmp()
    const r = await runCli(["init", "mywrapper", "--declaration"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "mywrapper", "index.d.tsc"))).toBe(true)
  })

  test("init myapp — манифест со scripts (start/dev) и builds.desktop (#252)", async () => {
    const dir = mkTmp()
    const r = await runCli(["init", "myapp"], { cwd: dir })
    expect(r.code).toBe(0)
    const pkg = JSON.parse(readFileSync(join(dir, "myapp", "tsc.package.json"), "utf8"))
    expect(pkg.scripts?.start).toBe("tsclang build --emit exec")
    expect(pkg.scripts?.dev).toBe("tsclang build --watch --emit exec")
    expect(pkg.builds?.desktop?.emit).toBe("binary")
  })

  test("init mylib --library — манифест с builds.dts и scripts.dts (#252)", async () => {
    const dir = mkTmp()
    const r = await runCli(["init", "mylib", "--library"], { cwd: dir })
    expect(r.code).toBe(0)
    const pkg = JSON.parse(readFileSync(join(dir, "mylib", "tsc.package.json"), "utf8"))
    expect(pkg.builds?.dts?.main).toBe("index.tsc")
    expect(pkg.builds?.dts?.emit).toBe("dts")
    expect(pkg.scripts?.dts).toBe("tsclang build --build dts")
  })

  test("init myavr --avr — builds.avr + scripts.flash + файлы executable (#252)", async () => {
    const dir = mkTmp()
    const r = await runCli(["init", "myavr", "--avr"], { cwd: dir })
    expect(r.code).toBe(0)
    const pkg = JSON.parse(readFileSync(join(dir, "myavr", "tsc.package.json"), "utf8"))
    expect(pkg.type).toBe("executable")
    expect(pkg.builds?.avr?.profile).toBe("avr")
    expect(pkg.builds?.avr?.mcu).toBe("atmega328p")
    expect(pkg.builds?.avr?.emit).toBe("flash")
    expect(pkg.builds?.avr?.flash?.programmer).toBe("arduino")
    expect(pkg.scripts?.flash).toBe("tsclang build --build avr")
    expect(existsSync(join(dir, "myavr", "src", "main.tsc"))).toBe(true)
    expect(existsSync(join(dir, "myavr", "test", "main.test.tsc"))).toBe(true)
  })
})

// === emit dts + builds.<n>.main (#252) ===

describe("13-build/cli — emit dts + builds.<n>.main (#252)", () => {
  test("build --build dts генерирует build/dts/index.d.tsc", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "index.tsc"), "export function hello(): string {\n  return \"Hello, World!\"\n}\n")
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "mylib", version: "0.1.0", type: "library",
      builds: { dts: { main: "index.tsc", emit: "dts", outDir: "build/dts" } },
    }))
    const r = await runCli(["build", "--build", "dts"], { cwd: dir })
    expect(r.code).toBe(0)
    const dts = join(dir, "build", "dts", "index.d.tsc")
    expect(existsSync(dts)).toBe(true)
    expect(readFileSync(dts, "utf8")).toContain("hello")
  })

  test("builds.<n>.main переопределяет main манифеста (#252)", async () => {
    const dir = mkTmp()
    mkdirSync(join(dir, "src"))
    writeFileSync(join(dir, "src", "main.tsc"), HELLO_TSC)
    writeFileSync(join(dir, "other.tsc"), HELLO_TSC)
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "app", version: "0.1.0", type: "executable", main: "src/main.tsc",
      builds: { dev: { main: "other.tsc", emit: "c", outDir: "out" } },
    }))
    const r = await runCli(["build", "--build", "dev"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "out", "other.c"))).toBe(true)
    expect(existsSync(join(dir, "out", "main.c"))).toBe(false)
  })

  test("validate-config принимает builds.<n>.main (#252)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "index.tsc"), HELLO_TSC)
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "mylib", version: "0.1.0", type: "library",
      builds: { dts: { main: "index.tsc", emit: "dts", outDir: "build/dts" } },
    }))
    const r = await runCli(["validate-config", "tsc.package.json"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(out(r)).not.toContain("unknown key 'main'")
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

// === #256: format command removed, formatter folded into lint as --format ===

describe("13-build/cli — lint --format: форматтер как опция линтера (#256)", () => {
  test("lint messy.tsc --format — exit 0, файл нормализован in-place", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "messy.tsc"), 'if   (true)   {\n  console.log(  "hi"  );\n}\n')
    const r = await runCli(["lint", "messy.tsc", "--format"], { cwd: dir })
    expect(r.code).toBe(0)
    const after = readFileSync(join(dir, "messy.tsc"), "utf8")
    expect(after).toContain("if (true) {")
    expect(after).toContain('    console.log( "hi" );')
  })

  test("lint warn.tsc --format — exit 1 (warning остаётся), но файл отформатирован", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "warn.tsc"), "let   x   =   1;\nconsole.log(x);\n")
    const r = await runCli(["lint", "warn.tsc", "--format"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("prefer-const")
    const after = readFileSync(join(dir, "warn.tsc"), "utf8")
    expect(after).toContain("let x = 1;")
  })

  test("lint broken.tsc --format — parse error → exit 1, файл нетронут", async () => {
    const dir = mkTmp()
    const broken = "console.log(\n"
    writeFileSync(join(dir, "broken.tsc"), broken)
    const r = await runCli(["lint", "broken.tsc", "--format"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(readFileSync(join(dir, "broken.tsc"), "utf8")).toBe(broken)
  })

  test("lint --fix --format — фиксы, потом форматирование, одним проходом", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "letty.tsc"), "let   x   =   1;\nconsole.log(x);\n")
    const r = await runCli(["lint", "letty.tsc", "--fix", "--format"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(readFileSync(join(dir, "letty.tsc"), "utf8")).toContain("const x = 1;")
  })

  test("format удалена — unknown command (#256)", async () => {
    const r = await runCli(["format", "x.tsc"], { cwd: mkTmp() })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("unknown command 'format'")
  })

  test("lint --format=x → подсказка про inline '=' (#244 guard)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["lint", "hello.tsc", "--format=x"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("does not support the inline '='")
  })
})

describe("13-build/cli — explain/emit-dts/validate-config (00.7.9-00.7.10, 00.7.6)", () => {
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

describe("13-build/cli — install/update/search/publish (00.2.4:39-46, 00.7.11-00.7.14)", () => {
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

// === pm: remove + command aliases i/u/r + honest update (#254) ===

describe("13-build/cli — pm: remove + алиасы i/u/r + честный update (#254)", () => {
  const manifestWith = (deps: Record<string, string>) => JSON.stringify({
    name: "probe", version: "0.1.0", type: "package", dependencies: deps,
  }, null, 2)

  test("алиасы i/u/r диспетчеризуются — не unknown command (#254)", async () => {
    for (const alias of ["i", "u", "r"]) {
      const r = await runCli([alias], { cwd: mkTmp() })
      expect(out(r).includes(`unknown command '${alias}'`)).toBe(false)
    }
  })

  test("remove без имени — ошибка входа, не unknown command (#254)", async () => {
    const r = await runCli(["remove"], { cwd: mkTmp() })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("missing package name")
  })

  test("install mylib@^1.0.0 — Installed-вывод + запись в dependencies манифеста (#254)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), manifestWith({}))
    const r = await runCli(["install", "mylib@^1.0.0"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Installed mylib@1.0.0")
    const pkg = JSON.parse(readFileSync(join(dir, "tsc.package.json"), "utf8"))
    expect(pkg.dependencies.mylib).toBe("^1.0.0")
  })

  test("remove вычищает манифест + lock + tsc_packages (#254)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), manifestWith({}))
    await runCli(["install", "mylib@^1.0.0"], { cwd: dir })
    expect(existsSync(join(dir, "tsc_packages", "mylib"))).toBe(true)
    const r = await runCli(["remove", "mylib"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Removed mylib")
    const pkg = JSON.parse(readFileSync(join(dir, "tsc.package.json"), "utf8"))
    expect(pkg.dependencies?.mylib).toBe(undefined)
    const lock = JSON.parse(readFileSync(join(dir, "tsc.package.lock"), "utf8"))
    expect(lock.packages.mylib).toBe(undefined)
    expect(existsSync(join(dir, "tsc_packages", "mylib"))).toBe(false)
  })

  test("remove неустановленного пакета — exit 1 (#254)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), manifestWith({}))
    const r = await runCli(["remove", "ghost"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("not installed")
  })

  test("update <pkg> резолвит range из манифеста через реестр (#254)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), manifestWith({ lib: "^1.0.0" }))
    const r = await runCli(["update", "lib"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Updated lib")
    const lock = JSON.parse(readFileSync(join(dir, "tsc.package.lock"), "utf8"))
    expect(lock.packages.lib.version).toBe("1.2.3")
  })

  test("bare update не стирает lock: резолвит все deps (#254)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), manifestWith({ lib: "^1.0.0", mylib: "^1.0.0" }))
    const r = await runCli(["update"], { cwd: dir })
    expect(r.code).toBe(0)
    const lock = JSON.parse(readFileSync(join(dir, "tsc.package.lock"), "utf8"))
    expect(lock.packages.lib.version).toBe("1.2.3")
    expect(lock.packages.mylib.version).toBe("1.0.0")
  })

  test("update пакета вне манифеста — exit 1 (#254)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), manifestWith({}))
    const r = await runCli(["update", "ghost"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("not in tsc.package.json")
  })

  test("bare install --production — prod-only sync, не молчаливый exit (#254)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "probe", version: "0.1.0", type: "package",
      dependencies: { lib: "1.0.0" }, devDependencies: { pkgB: "2.0.0" },
    }, null, 2))
    const r = await runCli(["install", "--production"], { cwd: dir })
    expect(r.code).toBe(0)
    const lock = JSON.parse(readFileSync(join(dir, "tsc.package.lock"), "utf8"))
    expect(lock.packages.lib.version).toBe("1.0.0")
    expect(lock.packages.pkgB).toBe(undefined)
  })

  test("help-листинг показывает алиасы install (i) / update (u) / remove (r) (#254)", async () => {
    const r = await runCli(["--help"])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/install\s+\(i\)/)
    expect(r.stdout).toMatch(/update\s+\(u\)/)
    expect(r.stdout).toMatch(/remove\s+\(r\)/)
  })

  test("i --help показывает справку install (канонизация алиаса) (#254)", async () => {
    const r = await runCli(["i", "--help"], { cwd: mkTmp() })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("--production")
  })
})

// === command aliases b/t/l/s/p (#255) ===

describe("13-build/cli — алиасы команд b/t/l/s/p (#255)", () => {
  test("help-листинг показывает алиасы build (b) / test (t) / lint (l) / search (s) / publish (p) (#255)", async () => {
    const r = await runCli(["--help"])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/build\s+\(b\)/)
    expect(r.stdout).toMatch(/test\s+\(t\)/)
    expect(r.stdout).toMatch(/lint\s+\(l\)/)
    expect(r.stdout).toMatch(/search\s+\(s\)/)
    expect(r.stdout).toMatch(/publish\s+\(p\)/)
  })

  test("алиасы b/t/l/s/p канонизируются — не unknown command (#255)", async () => {
    for (const alias of ["b", "t", "l", "s", "p"]) {
      const r = await runCli([alias], { cwd: mkTmp() })
      expect(out(r).includes(`unknown command '${alias}'`)).toBe(false)
    }
  })

  test("b --help показывает справку build (канонизация алиаса) (#255)", async () => {
    const r = await runCli(["b", "--help"], { cwd: mkTmp() })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("--emit")
  })

  test("s <query> ищет по реестру через алиас (#255)", async () => {
    const r = await runCli(["s", "lib"], { cwd: mkTmp() })
    expect(r.code).toBe(0)
    expect(r.stdout).toContain("Found")
    expect(r.stdout).toContain("lib@2.0.0")
  })

  test("b <file> --out-dir — позиционный и флаги пробрасываются после алиаса (#255)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "main.tsc"), 'console.log("hello");\n')
    const r = await runCli(["b", "main.tsc", "--emit", "c", "--out-dir", "dist"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(existsSync(join(dir, "dist", "main.c"))).toBe(true)
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

  test("unknown-опция у lint (--watch) → ошибка (#244)", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "hello.tsc"), HELLO_TSC)
    const r = await runCli(["lint", "hello.tsc", "--watch"], { cwd: dir })
    expect(r.code).toBe(1)
    expect(out(r)).toContain("unknown option '--watch' for 'lint'")
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

  test("run возвращена с npm-семантикой (#251): unknown command нет, покрыто в run-блоке выше", async () => {
    const dir = mkTmp()
    writeFileSync(join(dir, "tsc.package.json"), JSON.stringify({
      name: "app", version: "0.1.0", type: "executable", main: "hello.tsc",
      scripts: { hello: "echo hi" },
    }))
    const r = await runCli(["run", "hello"], { cwd: dir })
    expect(r.code).toBe(0)
    expect(out(r).includes("unknown command 'run'")).toBe(false)
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
