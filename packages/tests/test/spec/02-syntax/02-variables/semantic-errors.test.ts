import { describe, test, run, compile, expect, TscCompilationError } from "../../../../../test-engine/src/engine.ts"

// #208: semantic diagnostics must fire at the tsc phase — assert the class
// (TscCompilationError), not a bare toThrow() which a gcc failure satisfies too.
describe('02-syntax/02-variables — semantic-errors', () => {
  describe('S1. Unknown type name → E121', () => {
    test('let x: NotAType = 5 → [tsc] E121', () => {
      expect(() => run('let x: NotAType = 5')).toThrow(TscCompilationError, 'E121')
    })

    test('function param with unknown type → [tsc] E121', () => {
      expect(() => run('function f(a: Bogus) { return a }')).toThrow(TscCompilationError, 'E121')
    })

    test('unknown return type → [tsc] E121', () => {
      expect(() => run('function f(): Nope { return 1 }')).toThrow(TscCompilationError, 'E121')
    })

    test('declared class as type → OK', () => {
      expect(run('class Foo {}\nconst f: Foo = new Foo()\nconsole.log(1)')).toBe('1')
    })

    test('declared enum + type alias as type → OK', () => {
      expect(run('enum Color { Red }\ntype Num = i32\nlet c: Color = Color.Red\nlet n: Num = 5\nconsole.log(n)')).toBe('5')
    })
  })

  describe('S2. Undeclared identifier → E122', () => {
    test('console.log(undeclaredVar) → [tsc] E122', () => {
      expect(() => run('console.log(undeclaredVar)')).toThrow(TscCompilationError, 'E122')
    })

    test('undeclared in initializer → [tsc] E122', () => {
      expect(() => run('let x: i32 = 5\nlet y: i32 = z')).toThrow(TscCompilationError, 'E122')
    })

    test('use before declaration in same scope → [tsc] E122', () => {
      expect(() => run('console.log(x)\nlet x: i32 = 1')).toThrow(TscCompilationError, 'E122')
    })

    test('shadowing in nested block → OK', () => {
      expect(run('let x: i32 = 1\n{ let x: i32 = 2\n console.log(x) }')).toBe('2')
    })

    test('function params are visible → OK', () => {
      expect(run('function f(a: i32, b: i32): i32 { return a + b }\nconsole.log(f(2, 3))')).toBe('5')
    })

    test('property access is not an identifier use → OK', () => {
      expect(run('const s = "abc"\nconsole.log(s.length)')).toBe('3')
    })
  })

  describe('S3. Duplicate declaration → E123', () => {
    test('let x; let x; → [tsc] E123', () => {
      expect(() => run('let x: i32 = 5\nlet x: i32 = 6')).toThrow(TscCompilationError, 'E123')
    })

    test('let + const same name → [tsc] E123', () => {
      expect(() => run('let a: i32 = 1\nconst a: i32 = 2')).toThrow(TscCompilationError, 'E123')
    })

    test('let + class same name → [tsc] E123', () => {
      expect(() => run('let P = 1\nclass P {}')).toThrow(TscCompilationError, 'E123')
    })

    test('same name in nested scope → OK', () => {
      expect(run('let x: i32 = 1\n{ let x: i32 = 2 }\nconsole.log(x)')).toBe('1')
    })

    test('function overloads with same name → OK (not a redeclaration)', () => {
      // TS-style overloads: signatures without a body + one implementation
      expect(run('function log(msg: string): void;\nfunction log(msg: string, level: i32): void;\nfunction log(msg: string, level: i32 = 0): void { console.log(msg) }\nlog("hello")')).toBe('hello')
    })
  })

  describe('S4. Literal/annotation mismatch on init → E124', () => {
    test('let x: boolean = 1 → [tsc] E124', () => {
      expect(() => run('let x: boolean = 1')).toThrow(TscCompilationError, 'E124')
    })

    test('let x: i32 = true → [tsc] E124', () => {
      expect(() => run('let x: i32 = true')).toThrow(TscCompilationError, 'E124')
    })

    test('let x: string = 42 → [tsc] E124', () => {
      expect(() => run('let x: string = 42')).toThrow(TscCompilationError, 'E124')
    })

    test('let x: i32 = "hello" → [tsc] E124', () => {
      expect(() => run('let x: i32 = "hello"')).toThrow(TscCompilationError, 'E124')
    })

    test('let x: u32 = 2.0 → [tsc] E124 (integer-valued float literal)', () => {
      expect(() => run('let x: u32 = 2.0')).toThrow(TscCompilationError, 'E124')
    })

    test('let x: char = 256 → [tsc] E124 (out of char range)', () => {
      expect(() => run('let x: char = 256')).toThrow(TscCompilationError, 'E124')
    })

    test('let x: char = "ab" → [tsc] E102 (multi-char string, owned by codegen)', () => {
      expect(() => run('let x: char = "ab"')).toThrow(TscCompilationError, 'E102')
    })

    test('float literal into float type → OK', () => {
      expect(run('let x: f64 = 2.0\nconsole.log(x)')).toBe('2')
    })

    test('int literal into float type → OK (widening)', () => {
      expect(run('let x: f64 = 2\nconsole.log(x)')).toBe('2')
    })

    test('single-char string into char → OK', () => {
      expect(run("let c: char = 'a'\nconsole.log(c)")).toBe('a')
    })

    test('decimal fixed-point from number → OK', () => {
      expect(run('let x: d8 = 0.5\nconsole.log(x)')).toBe('0.50')
    })
  })
})
