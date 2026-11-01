import { describe, test, run, expect, TscCompilationError, matrix } from "../../../../../test-engine/src/engine.ts"

// Invalid values — matrix-driven: wrong-type initializers come from every
// type's invalidValues in the value matrix. Section anchors 10.1–10.20 follow
// the matrix order (mirroring the 8.x series of range-values).
let anchor = 0

describe('02-syntax/02-variables — invalid-values', () => {
  for (const [key, tc] of Object.entries(matrix)) {
    anchor++
    describe(`10.${anchor}. ${key} — wrong-type initializers`, () => {
      for (const [src, code] of tc.invalidValues) {
        const expected = code ? `→ ${code}` : '→ compile error'
        test(`let x: ${key} = ${src} ${expected}`, () => {
          expect(() => run(`let x: ${key} = ${src}`)).toThrow(TscCompilationError, code)
        })
      }
    })
  }
})
