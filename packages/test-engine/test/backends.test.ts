// Self-test: backend availability contracts + msvc env capture
// Ref: #206 step 5 (bug 2)
import { describe, test, expect, run, getBackend, getDefaultCompiler, CompileError } from "../src/engine.ts"
import { parseSetOutput } from "../src/compilers/msvc.ts"

describe("msvc — parseSetOutput", () => {
  test("parses KEY=VALUE lines with CRLF and LF", () => {
    const env = parseSetOutput("PATH=C:\\a;D\r\nINCLUDE=C:\\inc\nLIB=C:\\lib")
    expect(env["PATH"] ?? "").toBe("C:\\a;D")
    expect(env["INCLUDE"] ?? "").toBe("C:\\inc")
    expect(env["LIB"] ?? "").toBe("C:\\lib")
  })

  test("skips cmd dynamic =X:= vars, blank and junk lines", () => {
    const env = parseSetOutput("=C:=C:\\tmp\n\nno-equals-here\nLIB=C:\\lib")
    expect(String(Object.keys(env).length)).toBe("1")
    expect(env["LIB"] ?? "").toBe("C:\\lib")
  })
})

describe("msvc — availability contract", () => {
  test("isAvailable() is an honest boolean (no VS on this machine → false)", () => {
    const b = getBackend("msvc")
    expect(String(b !== undefined)).toBe("true")
    const avail = b!.isAvailable()
    expect(String(typeof avail)).toBe("boolean")
  })

  test("run() with unavailable msvc → CompileError naming msvc", () => {
    const b = getBackend("msvc")
    if (b?.isAvailable()) return // VS present: availability is real, nothing to assert here
    let message = ""
    try {
      run("console.log(1)", { compiler: "msvc" })
    } catch (e) {
      expect(e instanceof CompileError).toBe(true)
      message = (e as Error).message
    }
    expect(message).toContain("msvc")
  })
})

describe("default compiler", () => {
  test("getDefaultCompiler() names a registered, available backend", () => {
    const name = getDefaultCompiler()
    const b = getBackend(name)
    expect(String(b !== undefined)).toBe("true")
    expect(String(b!.isAvailable())).toBe("true")
  })
})

describe("e2e — wasm (gated on emcc in PATH)", () => {
  test("run() compiles with emcc and executes the JS glue", () => {
    const b = getBackend("wasm")
    if (!b?.isAvailable()) return
    const out = run("console.log(41 + 1)", { compiler: "wasm" })
    expect(out).toBe("42")
  })
})

describe("e2e — avr (gated on avr-gcc + simavr)", () => {
  test("run() compiles with avr-gcc and simavr prints to stdout", () => {
    const b = getBackend("avr-gcc")
    if (!b?.isAvailable()) return
    // target:"avr" loads the profile: i16 codegen + CONSOLE_UART define, so
    // printf reaches the UART simavr bridges to stdout
    const out = run("console.log(41 + 1)", { target: "avr", compiler: "avr-gcc", timeoutMs: 15_000 })
    expect(out).toBe("42")
  })
})
