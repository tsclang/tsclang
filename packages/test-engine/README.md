# TSClang Test Engine

Jest-like test engine for the TSClang compiler. Tests are generated and executed at runtime.

## Quick Start

```bash
# Run all tests
pnpm test:engine

# Or directly
pnpm tsx packages/test-engine/src/tests/run.ts
```

## Architecture

```
packages/test-engine/
  src/
    engine.ts                 # Core: describe, test, run, compile, expect
    compilers/                # Compiler backends
      interface.ts            # CompilerBackend, CompileOpts, RunOpts
      registry.ts             # register(), getBackend(), listAvailable()
      gcc.ts                  # GccBackend (Linux/WSL)
      clang.ts                # ClangBackend (Linux/macOS)
      msvc.ts                 # MsvcBackend (Windows, via vswhere)
      avr-gcc.ts              # AvrGccBackend (avr-gcc + simavr)
      wasm.ts                 # WasmBackend (emcc + node)
      utils.ts                # getDefaultCompiler(), isInPath(), findMsVC()
      index.ts                # barrel export + registerAll()
    tests/
      let-i8.test.ts          # Basic i8 variable tests
      all-types.test.ts       # All 16 types with valid/invalid values
      platform-matrix.test.ts # defaultNumber variants
      platform-targets.test.ts # desktop vs AVR
      platform-specific.test.ts # platform-specific behavior
      binary-inference.test.ts # type inference for binary ops
      strict-mode.test.ts     # safe-math, no-lossy-cast
      literal-inference.test.ts # literal type inference
      literal-overflow.test.ts # overflow detection
      compiler-backend.test.ts # Compiler backends
      expect-matchers.test.ts # Expect matchers
      hooks.test.ts           # Before/after hooks
      async.test.ts           # Async function tests
      jest-api.test.ts        # Jest-like API tests
      file-param.test.ts      # file() helper
      run.ts                  # Entry point
      fixtures/               # Test fixtures (math.tsc, utils.tsc)
  tsconfig.json
  package.json
```

## API (Jest-like)

### describe(name, fn) — group tests
```typescript
describe("math", () => {
  test("sum works", () => { ... })
  test("multiply works", () => { ... })
})
```

### test(name, callback) — run a test
```typescript
test("sum works", () => {
  const output = run(`console.log(sum(1, 2))`)
  expect(output).toBe("3")
})
```

### run(code, opts?) — compile and run
```typescript
run(code: string, opts?: RunOptions): string  // returns stdout

interface RunOptions {
  compiler?: string
  target?: string
  defaultNumber?: string
  strict?: string[]
  timeoutMs?: number
}
```

### compile(codeOrPath) — compile to C
```typescript
compile(code: string): string  // returns C code
```

### file(path) — read .tsc file
```typescript
const output = run(file("src/math.tsc"))
```

### expect(value) — matchers
```typescript
expect(value).toBe(expected)
expect(value).toBeGreaterThan(n)
expect(value).toBeLessThan(n)
expect(value).toContain(substring)
expect(value).toMatch(regex)
expect(value).toBeTruthy()
expect(value).toBeFalsy()
expect(value).toBeNull()
expect(value).not.toContain(substring)
```

### expect(() => ...).toThrow(ErrorClass) — negative tests
```typescript
import { TscError, CompileError, RuntimeError } from "@tsclang/test"

expect(() => run(`let x: i32 = "hello"`)).toThrow(TscError)
expect(() => run(invalidC)).toThrow(CompileError)
expect(() => run(`process.exit(1)`)).toThrow(RuntimeError)
```

### Import resolution
- `import { sum } from "./math"` → relative to test file
- `import { sum } from "/src/math"` → relative to project root

## Compiler Backends

| Backend | Name | Platforms |
|---------|------|-----------|
| GccBackend | `gcc` | Linux, WSL |
| ClangBackend | `clang` | Linux, macOS |
| MsvcBackend | `msvc` | Windows |
| AvrGccBackend | `avr-gcc` | Linux, WSL |
| WasmBackend | `wasm` | All |

## Adding New Tests

1. Create `packages/test-engine/src/tests/my-test.test.ts`
2. Import in `src/tests/run.ts`
3. Run: `pnpm test:engine`