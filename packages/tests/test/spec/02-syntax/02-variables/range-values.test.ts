import { describe, test, run, expect, TscCompilationError, matrix } from "../../../../../test-engine/src/engine.ts"

// Range values — matrix-driven: every case iterates the value matrix
// (test-engine/src/matrix.ts), the single source of truth. Section anchors
// 8.1–8.14 keep their historical types; 8.15+ extend to the remaining ones.
const ANCHORS: Record<string, number> = {
  i8: 1, i16: 2, i32: 3, i64: 4, u8: 5, u16: 6, u32: 7, u64: 8,
  d8: 9, d16: 10, d32: 11, d64: 12, f32: 13, f64: 14,
  number: 15, boolean: 16, string: 17, char: 18, usize: 19, isize: 20,
}

describe('02-syntax/02-variables — range-values', () => {
  for (const [key, tc] of Object.entries(matrix)) {
    const bounds = tc.min !== undefined ? ` — min=${tc.min}, max=${tc.max}` : ''
    describe(`8.${ANCHORS[key]}. ${key}${bounds}`, () => {
      for (const [src, out] of tc.valid) {
        test(`${key}: = ${src} → prints ${out === '' ? '""' : out}`, () => {
          const c = run(`let x: ${key} = ${src}\nconsole.log(x)`)
          expect(c).toBe(out)
        })
      }
      for (const src of tc.outOfRange) {
        test(`${key}: = ${src} (out of range) → E101`, () => {
          expect(() => run(`let x: ${key} = ${src}`)).toThrow(TscCompilationError, 'E101')
        })
      }
    })
  }
})
