// matrix.test.ts — structural self-test of the value matrix + filterValidTypes
// units. Compiler-behavior verification of every matrix entry lives in the
// 02-variables suites (range-values / invalid-values / alternative-literals),
// which iterate the same data; this file guards shape and invariants only.
import { describe, test, expect } from "../src/engine.ts"
import { matrix, filterValidTypes } from "../src/matrix.ts"

const NUMERIC_WITH_RANGE = ["i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "d8", "d16", "d32", "usize", "isize"]

describe("matrix (value matrix v2)", () => {
  test("covers exactly the 20 language types", () => {
    expect(Object.keys(matrix).sort().join(",")).toBe(
      ["boolean", "char", "d8", "d16", "d32", "d64", "f32", "f64", "i8", "i16", "i32", "i64",
        "isize", "number", "string", "u8", "u16", "u32", "u64", "usize"].sort().join(","))
  })

  test("entry.type matches its key", () => {
    for (const [key, tc] of Object.entries(matrix)) {
      expect(tc.type).toBe(key)
    }
  })

  test("every type has at least one valid literal with a paired output", () => {
    for (const [key, tc] of Object.entries(matrix)) {
      if (tc.valid.length < 1) throw new Error(`${key}: no valid literals`)
      for (const [src, out] of tc.valid) {
        if (typeof src !== "string" || typeof out !== "string") throw new Error(`${key}: valid pair is not [string,string]`)
        // empty output is legal only for the empty string literal
        if (out === "" && src !== '""') throw new Error(`${key}: empty expected output for ${src}`)
      }
    }
  })

  test("no duplicate literals within a type", () => {
    for (const [key, tc] of Object.entries(matrix)) {
      const all = [...tc.valid.map(v => v[0]), ...tc.outOfRange, ...tc.altLiterals.map(v => v[0])]
      const dup = all.filter((v, i) => all.indexOf(v) !== i)
      if (dup.length > 0) throw new Error(`${key}: duplicate literals ${dup.join(", ")}`)
    }
  })

  test("integer and decimal types declare out-of-range literals", () => {
    for (const key of NUMERIC_WITH_RANGE) {
      if (matrix[key].outOfRange.length < 1) throw new Error(`${key}: expected at least one outOfRange literal`)
    }
  })

  test("min/max present exactly on bounded types", () => {
    const bounded = new Set([...NUMERIC_WITH_RANGE, "d64"])
    const unbounded = ["f32", "f64", "number", "boolean", "string", "char"]
    for (const key of bounded) {
      if (!matrix[key].min || !matrix[key].max) throw new Error(`${key}: expected min/max anchors`)
    }
    for (const key of unbounded) {
      if (matrix[key].min !== undefined || matrix[key].max !== undefined) throw new Error(`${key}: unexpected min/max anchors`)
    }
  })

  test("64-bit bounds use exact n-suffixed literals", () => {
    expect(matrix.i64.max).toBe("9223372036854775807n")
    expect(matrix.i64.min).toBe("-9223372036854775808n")
    expect(matrix.u64.max).toBe("18446744073709551615n")
  })

  test("invalidValues codes are E1xx/E2xx when given", () => {
    for (const [key, tc] of Object.entries(matrix)) {
      for (const [src, code] of tc.invalidValues) {
        if (typeof src !== "string") throw new Error(`${key}: invalidValues src is not a string`)
        if (code !== undefined && !/^E\d{3}$/.test(code)) throw new Error(`${key}: bad error code "${code}"`)
      }
    }
  })
})

describe("filterValidTypes", () => {
  test("desktop (fpu, 64-bit): all 14 numeric types", () => {
    expect(filterValidTypes({ fpu: true, bits: 64 }).length).toBe(14)
  })

  test("no FPU drops f32/f64 only", () => {
    const t = filterValidTypes({ fpu: false, bits: 64 })
    expect(t.includes("f32")).toBe(false as any)
    expect(t.includes("f64")).toBe(false as any)
    expect(t.length).toBe(12)
  })

  test("bits:32 drops the 64-bit storages (i64/u64/d64)", () => {
    const t = filterValidTypes({ fpu: true, bits: 32 })
    expect(t.length).toBe(11)
    expect(t.includes("i64")).toBe(false as any)
  })

  test("bits:16 drops 32-bit storages too", () => {
    expect(filterValidTypes({ fpu: true, bits: 16 }).length).toBe(8)
  })

  test("bits:8 keeps i16/u16 — avr-gcc int is 16-bit, i16 still prints losslessly (not a bug)", () => {
    const t = filterValidTypes({ fpu: true, bits: 8 })
    expect(t.includes("i16")).toBe(true as any)
    expect(t.includes("u16")).toBe(true as any)
    expect(t.length).toBe(8)
  })

  test("no caps given: everything stays", () => {
    expect(filterValidTypes({}).length).toBe(14)
  })
})
