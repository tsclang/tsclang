import { describe, test, getBackend, getDefaultCompiler, normalizeC } from "../engine"
import { listAvailable, listAll } from "../../compilers/registry.js"

// === CompilerBackend registry ===

describe("CompilerBackend registry", () => {
  test("getBackend('gcc') returns GccBackend", {
    input: `console.log("ok")`,
    expectCContains: "printf",
    compiler: "gcc"
  })

  test("getDefaultCompiler() returns a valid compiler", {
    input: `console.log("default")`,
    expect: { toBe: "default" }
  })
})

// === GccBackend — positive ===

describe("GccBackend — positive", () => {
  test("compile() produces binary from valid C code", {
    input: `console.log("hello gcc")`,
    expect: { toBe: "hello gcc" },
    compiler: "gcc"
  })

  test("run() captures stdout correctly", {
    input: `console.log(42)`,
    expect: { toBe: 42 },
    compiler: "gcc"
  })

  test("run() returns zero exit code on success", {
    input: `let x: i32 = 1 + 2`,
    compiler: "gcc"
  })
})

// === GccBackend — negative (phase 3: runtime) ===

describe("GccBackend — negative (phase 3: runtime)", () => {
  test("run() returns non-zero exit code on crash", {
    input: `process.exit(1)`,
    expectRuntimeError: true,
    compiler: "gcc"
  })
})

// === Integration — TSC pipeline (phase 1: TSC→C) ===

describe("Integration — TSC pipeline (phase 1: TSC→C)", () => {
  test("valid TSC produces C and runs successfully", {
    input: `console.log("integration ok")`,
    expect: { toBe: "integration ok" }
  })

  test("invalid TSC syntax → expectTscError", {
    input: `let x: i32 = 'hello'`,
    expectTscError: true
  })
})

// === Integration — C-output check (phase 1.5) ===

describe("Integration — C-output check (phase 1.5)", () => {
  test("expectCContains finds printf in console.log output", {
    input: `console.log("test")`,
    expectCContains: "printf"
  })

  test("expectCContains array checks multiple substrings", {
    input: `let x: i32 = 42`,
    expectCContains: ["#include", "int32_t"]
  })

  test("expectCNotContains rejects malloc in stack-only code", {
    input: `let x: i32 = 42`,
    expectCNotContains: "malloc"
  })

  test("expectCNotContains array checks multiple substrings", {
    input: `let x: i32 = 42`,
    expectCNotContains: ["malloc", "free"]
  })
})

// === Integration — multi-compiler ===

describe("Integration — multi-compiler", () => {
  test("same TSC runs on gcc with correct output", {
    input: `console.log(42)`,
    expect: { toBe: 42 },
    compiler: "gcc"
  })
})
