import { describe, test, run, expect, matrix } from "@tsclang/test-engine"

// i32 defined-wrap oracle: explicit boundary formulas derived from matrix min/max.
// TSClang defines integer overflow as two's-complement wrap (no UB).
// Expected values are computed by hand from the definition and expressed
// directly via min/max constants — no runtime oracle function.
// BigInt-based exhaustive oracle is deferred to the scaling step.

const { min, max } = matrix.i32 // -2147483648 / 2147483647

function wrap(a: number, op: "+" | "-" | "*", b: number, expected: number): void {
  test(`${a} ${op} ${b} = ${expected}`, () => {
    expect(run(`let a: i32 = ${a}\nlet b: i32 = ${b}\nconsole.log(a ${op} b)`)).toBe(String(expected))
  })
}

describe("i32 arithmetic overflow — defined wrap", () => {
  describe("+ (addition wrap)", () => {
    wrap(max, "+", 1, min)          // 2147483647 + 1 wraps to -2147483648
    wrap(max, "+", 2, min + 1)      // crosses boundary by 2
    wrap(max, "+", max, -2)         // 0xFFFFFFFE -> -2
    wrap(min, "+", min, 0)          // -2^32 -> 0
    wrap(min, "+", -1, max)         // underflow wraps to max
    wrap(-1, "+", -1, -2)           // control: no overflow
  })

  describe("- (subtraction wrap)", () => {
    wrap(min, "-", 1, max)          // -2147483648 - 1 wraps to max
    wrap(min, "-", 2, max - 1)      // crosses boundary by 2
    wrap(0, "-", min, min)          // 0 - (-2^31) = 2^31 -> wraps to min
    wrap(max, "-", -1, min)         // max - (-1) = max + 1 -> min
  })

  describe("* (multiplication wrap)", () => {
    wrap(max, "*", 2, -2)           // 0xFFFFFFFE -> -2
    wrap(min, "*", 2, 0)            // -2^32 -> 0
    wrap(min, "*", -1, min)         // 2^31 -> wraps back to min
    wrap(-1, "*", -1, 1)            // control: no overflow
  })
})
