// Self-test: expect() value matchers — positive, negative, `not`, edge cases
// Ref: #206 step 6 (bug 9)
// Truthiness follows LANGUAGE semantics (spec 03-types/03-truthy-falsy.md + #206):
// falsy = null, "", any numeric zero, false, NaN (as printed by C: "nan", "-nan")
import { describe, test, expect } from "../src/engine.ts"

const fails = (fn: () => void) => expect(fn).toThrow()

describe("expect — toBe", () => {
  test("exact match, string and number form", () => {
    expect("42").toBe("42")
    expect("42").toBe(42)
  })
  test("mismatch throws", () => fails(() => expect("42").toBe("43")))
  test("not.toBe", () => {
    expect("42").not.toBe("43")
    fails(() => expect("42").not.toBe("42"))
  })
})

describe("expect — toBeGreaterThan / toBeLessThan", () => {
  test("ordering", () => {
    expect("5").toBeGreaterThan(4)
    expect("4").toBeLessThan(5)
  })
  test("equal boundary throws", () => {
    fails(() => expect("5").toBeGreaterThan(5))
    fails(() => expect("5").toBeLessThan(5))
  })
  test("non-numeric throws instead of silently passing", () => {
    fails(() => expect("abc").toBeGreaterThan(1))
    fails(() => expect("abc").toBeLessThan(1))
  })
  test("not.", () => {
    expect("1").not.toBeGreaterThan(2)
    fails(() => expect("1").not.toBeGreaterThan(0))
    expect("2").not.toBeLessThan(1)
    fails(() => expect("2").not.toBeLessThan(3))
  })
})

describe("expect — toContain", () => {
  test("substring", () => {
    expect("hello world").toContain("world")
    fails(() => expect("hello").toContain("xyz"))
  })
  test("not.toContain", () => {
    expect("hello").not.toContain("xyz")
    fails(() => expect("hello").not.toContain("ell"))
  })
})

describe("expect — toMatch", () => {
  test("regex", () => expect("abc123").toMatch("^abc\\d+$"))
  test("mismatch throws", () => fails(() => expect("abc").toMatch("^\\d+$")))
  test("not.toMatch", () => {
    expect("abc").not.toMatch("^\\d+$")
    fails(() => expect("abc").not.toMatch("^abc$"))
  })
})

describe("expect — toBeNull", () => {
  test("null output", () => expect("null").toBeNull())
  test("non-null throws", () => fails(() => expect("0").toBeNull()))
  test("not.toBeNull", () => {
    expect("0").not.toBeNull()
    fails(() => expect("null").not.toBeNull())
  })
})

describe("expect — toBeNaN", () => {
  test("accepts C printf spellings", () => {
    expect("NaN").toBeNaN()
    expect("nan").toBeNaN()
    expect("-nan").toBeNaN()
  })
  test("numbers and Infinity throw", () => {
    fails(() => expect("1").toBeNaN())
    fails(() => expect("Infinity").toBeNaN())
  })
  test("not.toBeNaN", () => {
    expect("1").not.toBeNaN()
    fails(() => expect("nan").not.toBeNaN())
  })
})

describe("expect — toBeCloseTo", () => {
  test("default precision 2", () => {
    expect("0.33").toBeCloseTo(1 / 3)
    fails(() => expect("0.3").toBeCloseTo(1 / 3))
  })
  test("explicit precision", () => {
    expect("0.333333").toBeCloseTo(1 / 3, 5)
    fails(() => expect("0.33").toBeCloseTo(1 / 3, 5))
  })
  test("negative numbers", () => expect("-1.5").toBeCloseTo(-1.5, 5))
  test("non-numeric throws", () => fails(() => expect("abc").toBeCloseTo(1)))
  test("not.toBeCloseTo", () => {
    expect("0.33").not.toBeCloseTo(1 / 3, 5)
    fails(() => expect("0.33").not.toBeCloseTo(1 / 3))
  })
})

describe("expect — truthiness by language semantics", () => {
  test("falsy: null, empty, numeric zero, false, NaN", () => {
    for (const v of ["", "null", "false", "0", "0.0", "-0", "NaN", "nan"]) expect(v).toBeFalsy()
  })
  test("truthy: non-zero numbers, non-empty strings, true, Infinity", () => {
    for (const v of ["1", "-1", "0.1", "hello", "true", "Infinity"]) expect(v).toBeTruthy()
  })
  test("falsy values fail toBeTruthy", () => {
    for (const v of ["null", "0.0", "nan"]) fails(() => expect(v).toBeTruthy())
  })
  test("truthy values fail toBeFalsy", () => {
    for (const v of ["1", "hello"]) fails(() => expect(v).toBeFalsy())
  })
  test("not.toBeTruthy", () => {
    expect("0").not.toBeTruthy()
    fails(() => expect("1").not.toBeTruthy())
  })
  test("not.toBeFalsy", () => {
    expect("1").not.toBeFalsy()
    fails(() => expect("null").not.toBeFalsy())
  })
})
