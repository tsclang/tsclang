import { describe, test, run, expect, matrix } from "../../../../../test-engine/src/engine.ts"

// Alternative-radix literals — matrix-driven. Anchors 9.1–9.3 group by radix
// (hex / binary / octal), historical semantics preserved; the cases
// themselves come from every type's altLiterals in the value matrix.
type RadixGroup = { anchor: string; title: string; match: (src: string) => boolean }

const GROUPS: RadixGroup[] = [
  { anchor: '9.1', title: 'Hexadecimal literals', match: (s) => s.startsWith('0x') || s.startsWith('0X') },
  { anchor: '9.2', title: 'Binary literals', match: (s) => s.startsWith('0b') || s.startsWith('0B') },
  { anchor: '9.3', title: 'Octal literals', match: (s) => s.startsWith('0o') || s.startsWith('0O') },
]

describe('02-syntax/02-variables — alternative-literals', () => {
  for (const g of GROUPS) {
    describe(`${g.anchor}. ${g.title}`, () => {
      for (const [key, tc] of Object.entries(matrix)) {
        for (const [src, out] of tc.altLiterals) {
          if (!g.match(src)) continue
          test(`let x: ${key} = ${src} → ${out}`, () => {
            const c = run(`let x: ${key} = ${src}\nconsole.log(x)`)
            expect(c).toBe(out)
          })
        }
      }
    })
  }
})
