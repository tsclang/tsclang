import { describe, test, run, expect, getBackend } from "../../../../test-engine/src/engine.ts"

// Cast pairs — every numeric type cast to every other numeric type through an
// explicit `as`. char is excluded (raw byte output). Expectations were probed
// against desktop gcc and avr-gcc/simavr at suite-creation time with the
// value 1: non-decimal targets print "1", decimal targets print their
// fixed-point form.
const TYPES = ["i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "f32", "f64", "d8", "d16", "d32", "d64"]

const EXPECTED: Record<string, string> = { d8: "1.00", d16: "1.00", d32: "1.0000", d64: "1.00000000" }

describe("03-types — cast-pairs (desktop)", () => {
  for (const A of TYPES) {
    describe(`${A} as <T>`, () => {
      for (const B of TYPES) {
        const want = EXPECTED[B] ?? "1"
        test(`${A} -> ${B} -> ${want}`, () => {
          const out = run(`let a: ${A} = 1\nlet b: ${B} = a as ${B}\nconsole.log(b)`)
          expect(out).toBe(want)
        })
      }
    })
  }
})

describe("03-types — cast-pairs (avr samples)", () => {
  const backend = getBackend("avr-gcc")
  const samples: [string, string][] = [
    ["i32", "i16"], ["u32", "u16"], ["i16", "u8"], ["d16", "i16"], ["u16", "i8"],
  ]
  for (const [A, B] of samples) {
    test(`avr: ${A} -> ${B} -> 1`, () => {
      if (!backend?.isAvailable()) return // no avr toolchain here — avr smoke runs only where avr-gcc exists
      const out = run(`let a: ${A} = 1\nlet b: ${B} = a as ${B}\nconsole.log(b)`, { target: "avr", compiler: "avr-gcc" })
      expect(out).toBe("1")
    })
  }
})
