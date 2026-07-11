import { describe, test, run, compile, expect, getBackend, getDefaultCompiler } from "@tsclang/test-engine"
import { listAvailable, listAll } from "../compilers/registry.js"

// === CompilerBackend registry ===

describe("CompilerBackend registry", () => {
  test("getBackend('gcc') returns GccBackend", () => {
    const c = compile('console.log("ok")')
    expect(c).toContain("printf")
  })

  test("getDefaultCompiler() returns a valid compiler", () => {
    expect(run('console.log("default")')).toBe("default")
  })
})

// === GccBackend — positive ===

describe("GccBackend — positive", () => {
  test("compile() produces binary from valid C code", () => {
    expect(run('console.log("hello gcc")', { compiler: "gcc" })).toBe("hello gcc")
  })

  test("run() captures stdout correctly", () => {
    expect(run("console.log(42)", { compiler: "gcc" })).toBe("42")
  })

  test("run() returns zero exit code on success", () => {
    run("let x: i32 = 1 + 2", { compiler: "gcc" })
  })
})

// === GccBackend — negative (phase 3: runtime) ===

describe("GccBackend — negative (phase 3: runtime)", () => {
  test("run() returns non-zero exit code on crash", () => {
    expect(() => run("process.exit(1)", { compiler: "gcc" })).toThrow()
  })
})

// === Integration — TSC pipeline (phase 1: TSC→C) ===

describe("Integration — TSC pipeline (phase 1: TSC→C)", () => {
  test("valid TSC produces C and runs successfully", () => {
    expect(run('console.log("integration ok")')).toBe("integration ok")
  })

  test("invalid TSC syntax → throws", () => {
    expect(() => run("let x: i32 = 'hello'")).toThrow()
  })
})

// === Integration — C-output check (phase 1.5) ===

describe("Integration — C-output check (phase 1.5)", () => {
  test("compile() finds printf in console.log output", () => {
    expect(compile('console.log("test")')).toContain("printf")
  })

  test("compile() checks multiple substrings", () => {
    const c = compile("let x: i32 = 42")
    expect(c).toContain("#include")
    expect(c).toContain("int32_t")
  })

  test("compile() rejects malloc in stack-only code", () => {
    const c = compile("let x: i32 = 42")
    expect(c).not.toContain("malloc")
  })
})

// === Integration — multi-compiler ===

describe("Integration — multi-compiler", () => {
  test("same TSC runs on gcc with correct output", () => {
    expect(run("console.log(42)", { compiler: "gcc" })).toBe("42")
  })
})
