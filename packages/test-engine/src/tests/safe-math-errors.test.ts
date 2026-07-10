import { describe, test, run, expect, matrix, TscCompilationError } from "../engine.js"

const SIGNED = ["i8", "i16", "i32"] as const
const UNSIGNED = ["u8", "u16", "u32"] as const
const ALL = [...SIGNED, ...UNSIGNED] as const

const SM = { strict: ["safe-math"] }

describe("safe-math: unguarded overflow -> E203", () => {
  for (const t of SIGNED) {
    const { max } = matrix[t]
    test(`${t}: MAX + 1 unguarded -> E203`, () => {
      expect(() => run(`let a: ${t} = ${max}\nlet b: ${t} = 1\nconsole.log(a + b)`, SM))
        .toThrow(TscCompilationError, "E203")
    })
  }
  for (const t of UNSIGNED) {
    const { max } = matrix[t]
    test(`${t}: MAX + 1 unguarded -> E203`, () => {
      expect(() => run(`let a: ${t} = ${max}\nlet b: ${t} = 1\nconsole.log(a + b)`, SM))
        .toThrow(TscCompilationError, "E203")
    })
  }
})

describe("safe-math: guarded overflow -> caught", () => {
  for (const t of SIGNED) {
    const { max } = matrix[t]
    test(`${t}: MAX + 1 in try/catch -> fallback`, () => {
      expect(run(`let a: ${t} = ${max}\nlet b: ${t} = 1\nlet z: ${t} = 0\ntry { z = a + b } catch (e: MathError) { z = -1 }\nconsole.log(z)`, SM))
        .toBe("-1")
    })
  }
  for (const t of UNSIGNED) {
    const { max } = matrix[t]
    test(`${t}: MAX + 1 in try/catch -> fallback`, () => {
      expect(run(`let a: ${t} = ${max}\nlet b: ${t} = 1\nlet z: ${t} = 0\ntry { z = a + b } catch (e: MathError) { z = 42 }\nconsole.log(z)`, SM))
        .toBe("42")
    })
  }
})

describe("safe-math: safe arithmetic -> correct result", () => {
  for (const t of ALL) {
    test(`${t}: 10 + 20 = 30 (in try/catch)`, () => {
      expect(run(`let a: ${t} = 10\nlet b: ${t} = 20\nlet z: ${t} = 0\ntry { z = a + b } catch (e: MathError) { z = -1 }\nconsole.log(z)`, SM))
        .toBe("30")
    })
    test(`${t}: 6 * 7 = 42 (in try/catch)`, () => {
      expect(run(`let a: ${t} = 6\nlet b: ${t} = 7\nlet z: ${t} = 0\ntry { z = a * b } catch (e: MathError) { z = -1 }\nconsole.log(z)`, SM))
        .toBe("42")
    })
  }
})

describe("safe-math: subtraction overflow", () => {
  for (const t of SIGNED) {
    const { min } = matrix[t]
    test(`${t}: MIN - 1 in try/catch -> fallback`, () => {
      expect(run(`let a: ${t} = ${min}\nlet b: ${t} = 1\nlet z: ${t} = 0\ntry { z = a - b } catch (e: MathError) { z = -1 }\nconsole.log(z)`, SM))
        .toBe("-1")
    })
  }
})

describe("safe-math: float arithmetic (no guard needed)", () => {
  test("f64: large + large (no E203)", () => {
    expect(run(`let a: f64 = 1e308\nlet b: f64 = 1e308\ntry { console.log(a + b) } catch (e: MathError) { console.log(-1) }`, SM))
      .toBe("Infinity")
  })
  test("f64: normal addition", () => {
    expect(run(`let a: f64 = 1.5\nlet b: f64 = 2.5\ntry { console.log(a + b) } catch (e: MathError) { console.log(-1) }`, SM))
      .toBe("4")
  })
})
