import { describe, test, run, expect, platformMatrix, listAvailable, getBackend } from "@tsclang/test-engine"

const available = listAvailable()

const COMPILER_CASES: { name: string; code: string; expected: string; target?: string }[] = [
  { name: "i32 echo", code: `let x: i32 = 42; console.log(x)`, expected: "42" },
  { name: "i32 add", code: `let a: i32 = 17; let b: i32 = 25; console.log(a + b)`, expected: "42" },
  { name: "u8 echo", code: `let x: u8 = 200; console.log(x)`, expected: "200" },
  { name: "string echo", code: `console.log("hello")`, expected: "hello" },
  { name: "boolean echo", code: `console.log(true)`, expected: "true" },
  { name: "i32 negative", code: `let x: i32 = -7; console.log(x)`, expected: "-7" },
  { name: "i16 multiply", code: `let a: i16 = 3; let b: i16 = 14; console.log(a * b)`, expected: "42" },
  { name: "hex literal", code: `let x: i32 = 0xFF; console.log(x)`, expected: "255" },
]

for (const compiler of platformMatrix.compilers) {
  if (!available.includes(compiler)) continue

  describe(`compiler: ${compiler}`, () => {
    for (const tc of COMPILER_CASES) {
      const opts: any = { compiler }
      if (compiler === "avr-gcc") {
        opts.target = "avr"
      }
      test(tc.name, () => {
        expect(run(tc.code, opts)).toBe(tc.expected)
      })
    }
  })
}
