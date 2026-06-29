# TSClang Test Engine

On-the-fly test generator for the TSClang compiler. Tests are generated and executed at runtime — no files stored on disk.

## Quick Start

```bash
# Run all tests
npm run test:engine

# Or directly
npx tsx packages/test-engine/test-engine/run.ts
```

## Architecture

```
packages/test-engine/
  compilers/                    # Compiler backends
    interface.ts                # CompilerBackend, CompileOpts, RunOpts, ...
    registry.ts                 # register(), getBackend(), listAvailable()
    gcc.ts                      # GccBackend (Linux/WSL)
    clang.ts                    # ClangBackend (Linux/macOS)
    msvc.ts                     # MsvcBackend (Windows, via vswhere)
    avr-gcc.ts                  # AvrGccBackend (avr-gcc + simavr)
    wasm.ts                     # WasmBackend (emcc + node)
    utils.ts                    # getDefaultCompiler(), isInPath(), findMsVC(), normalizeC()
    index.ts                    # barrel export + registerAll()
  test-engine/
    engine.ts                   # Core: matrix, describe, test, expect, platformMatrix
    run.ts                      # Entry point
    tests/
      let-i8.test.ts            # Basic i8 variable tests
      all-types.test.ts         # All 16 types with valid/invalid values
      platform-matrix.test.ts   # defaultNumber variants
      platform-targets.test.ts  # desktop vs AVR
      platform-specific.test.ts # platform-specific behavior
      binary-inference.test.ts  # type inference for binary ops
      strict-mode.test.ts       # safe-math, no-lossy-cast
      literal-inference.test.ts # literal type inference
      literal-overflow.test.ts  # overflow detection
      compiler-backend.test.ts  # Compiler backends + 4-phase pipeline
      expect-matchers.test.ts   # Expect matchers (toBe, toBeGreaterThan, toContain, ...)
      hooks.test.ts             # Before/after hooks (beforeEach, afterEach)
      async.test.ts             # Async function tests
      fixtures/                 # Test fixtures (math.tsc, utils.tsc)
```

## API

### `describe(name, fn)` — group tests
```typescript
describe("my tests", () => {
  test("test 1", { ... })
  test("test 2", { ... })
})
```

### `test(name, options)` — run a single test
```typescript
test("let x: i8 = 42", {
  input: `let x: i8 = 42\nconsole.log(x)`,
  expect: { toBe: 42 }
})
```

Options:
- `input` — TSClang source code (mutually exclusive with `file`)
- `file` — path to .tsc file on disk (mutually exclusive with `input`, resolves imports recursively via `compileTsc`)
- `expect` — expected stdout (use matchers)
- `expectError` — expect compile error (legacy, use `expectTscError`)
- `expectTscError` — expect TSC compilation error (`true` or substring)
- `expectCompileError` — expect C-to-binary error (`true` or substring)
- `expectRuntimeError` — expect runtime error (`true` or substring)
- `expectC` — expected C output (exact match after normalization)
- `expectCContains` — C must contain substring(s)
- `expectCNotContains` — C must NOT contain substring(s)
- `options` — codegen options (`defaultNumber`, `target`, `strict`)
- `compiler` — compiler backend (`"gcc"`, `"clang"`, `"msvc"`, `"avr-gcc"`, `"wasm"`)
- `timeoutMs` — custom timeout (default 5000)

### `expect` — matchers
```typescript
expect: { toBe: 42 }                    // exact match
expect: { toBeGreaterThan: 10 }         // actual > 10
expect: { toBeLessThan: 100 }           // actual < 100
expect: { toBeGreaterThanOrEqual: 0 }   // actual >= 0
expect: { toBeLessThanOrEqual: 100 }    // actual <= 100
expect: { toBeTruthy: true }            // actual !== "" && actual !== "0" && actual !== "false"
expect: { toBeFalsy: true }             // actual === "" || actual === "0" || actual === "false"
expect: { toBeNull: true }              // actual === "null"
expect: { toContain: "world" }          // actual.includes("world")
expect: { toMatch: "^[a-z]+$" }         // regex match
```

### `matrix` — type definitions
```typescript
matrix.i8.values       // [0, 1, -128, 127, -129, 128]
matrix.i8.validValues  // [0, 1, -128, 127]
matrix.i8.invalidRange // [-129, 128]
matrix.i8.invalidValues // [true, "hello"]
```

### `platformMatrix` — platform settings
```typescript
platformMatrix.defaultNumber // ["i8", "i16", "i32", "f64", "u8", "u16"]
platformMatrix.targets       // ["desktop", "avr", "nes", "spectrum"]
platformMatrix.strict        // [[], ["safe-math"], ["no-lossy-cast"], ...]
```

## Hooks

```typescript
import { describe, test, beforeEach, afterEach } from "../engine"

let counter = 0

describe("my tests", () => {
  beforeEach(() => { counter = 0 })
  afterEach(() => { /* cleanup */ })
  
  test("counter starts at 0", {
    input: `console.log(0)`,
    expect: { toBe: 0 }
  })
})
```

Available hooks:
- `before(fn)` — runs once before all tests in describe block
- `after(fn)` — runs once after all tests in describe block
- `beforeEach(fn)` — runs before each test
- `afterEach(fn)` — runs after each test

## Compiler Backends

The engine supports multiple C compilers via pluggable backends:

| Backend | Name | Platforms | Notes |
|---------|------|-----------|-------|
| GccBackend | `gcc` | Linux, WSL | Default on Linux |
| ClangBackend | `clang` | Linux, macOS | Default on macOS |
| MsvcBackend | `msvc` | Windows | Found via vswhere.exe |
| AvrGccBackend | `avr-gcc` | Linux, WSL | avr-gcc + simavr |
| WasmBackend | `wasm` | All | emcc + node |

### Auto-detection

```typescript
import { getDefaultCompiler, listAvailable } from "../engine"

getDefaultCompiler()  // Returns "gcc" on Linux, "clang" on macOS, "msvc" on Windows
listAvailable()       // Returns ["gcc", "clang"] if both installed
```

### Explicit compiler

```typescript
test("clang test", {
  input: `console.log(42)`,
  expect: { toBe: 42 },
  compiler: "clang"
})
```

## Testing .tsc Files

Use `file` to test real .tsc files from disk. The compiler recursively resolves all imports.

### Basic file test

```typescript
test("math module", {
  file: "src/math.tsc",
  expectCContains: ["sum", "multiply"]
})
```

### Recursive imports

If `math.tsc` imports `utils.tsc` which imports `helpers.tsc` — all are resolved automatically:

```typescript
test("utils imports math", {
  file: "src/utils.tsc",  // utils.tsc imports math.tsc
  expectCContains: ["sum"]
})
```

### Validation

- `file` and `input` are mutually exclusive — specifying both is an error
- `file` resolves relative to cwd
- Uses `compileTsc()` internally which handles path aliases from `tsc.package.json`

## 4-Phase Test Pipeline

```
TSC → C → [C-check] → binary → run
  1    1.5       2        3
```

### Phase 1: TSC → C
Compiles TSClang source to C code. Fails if syntax or type errors.

```typescript
test("type error", {
  input: `let x: i32 = 'hello'`,
  expectTscError: true
})

test("const reassign", {
  input: `const x = 1\nx = 2`,
  expectTscError: "const"
})
```

### Phase 1.5: C-check
Verifies the generated C code content.

```typescript
test("has printf", {
  input: `console.log("test")`,
  expectCContains: "printf"
})

test("no heap", {
  input: `let x: i32 = 42`,
  expectCNotContains: ["malloc", "free"]
})

test("exact C match", {
  input: `let x: i32 = 42`,
  expectC: `#include "runtime.h"\nint main(void) { ... }`
})
```

### Phase 2: C → binary
Compiles C code with the selected compiler backend.

```typescript
test("invalid C", {
  input: `console.log("ok")`,
  expectCompileError: true,
  compiler: "gcc"
})
```

### Phase 3: Runtime
Runs the compiled binary and checks stdout/exit code.

```typescript
test("exit code", {
  input: `process.exit(1)`,
  expectRuntimeError: true
})

test("stdout check", {
  input: `console.log(42)`,
  expect: { toBe: 42 }
})
```

## Writing Tests

### Basic test
```typescript
import { describe, test, beforeEach, afterEach } from "../engine"

describe("my feature", () => {
  test("works", {
    input: `let x = 1\nconsole.log(x)`,
    expect: { toBe: 1 }
  })
})
```

### Error test (by phase)
```typescript
// Phase 1: TSC error
test("type error", {
  input: `let x: i32 = 'hello'`,
  expectTscError: true
})

// Phase 2: C compile error
test("invalid C", {
  input: `...`,
  expectCompileError: true,
  compiler: "gcc"
})

// Phase 3: Runtime error
test("crash", {
  input: `process.exit(1)`,
  expectRuntimeError: true
})
```

### C-output check
```typescript
test("generated C has printf", {
  input: `console.log("test")`,
  expectCContains: "printf"
})

test("no heap operations", {
  input: `let x: i32 = 42`,
  expectCNotContains: ["malloc", "free"]
})
```

### Multi-compiler test
```typescript
test("works on gcc", {
  input: `console.log(42)`,
  expect: { toBe: 42 },
  compiler: "gcc"
})

test("works on clang", {
  input: `console.log(42)`,
  expect: { toBe: 42 },
  compiler: "clang"
})
```

### Platform-specific test
```typescript
test("float on AVR fails", {
  input: `let x = 3.14`,
  options: { target: "avr" },
  expectError: true
})
```

### Matrix test (multiple variants)
```typescript
for (const dn of platformMatrix.defaultNumber) {
  test(`defaultNumber=${dn}`, {
    input: `let a = 1\nconsole.log(a)`,
    options: { defaultNumber: dn },
    expect: { toBe: 1 }
  })
}
```

## Adding New Tests

1. Create `packages/test-engine/test-engine/tests/my-test.test.ts`
2. Import and add to `run.ts`:
   ```typescript
   import "./tests/my-test.test"
   ```
3. Run: `npm run test:engine`

## Adding New Compiler Backends

1. Create `packages/test-engine/compilers/my-backend.ts`:
   ```typescript
   import type { CompilerBackend, CompileOpts, CompileResult, RunOpts, RunResult } from "./interface.js"

   export class MyBackend implements CompilerBackend {
     name = "my-backend"

     isAvailable(): boolean {
       // Check if compiler is installed
       return true
     }

     compile(cCode: string, outDir: string, opts?: CompileOpts): CompileResult {
       // Compile C code to binary
       return { success: true, binaryPath: "...", stderr: "", exitCode: 0 }
     }

     run(binaryPath: string, opts?: RunOpts): RunResult {
       // Run the compiled binary
       return { success: true, stdout: "...", stderr: "", exitCode: 0 }
     }
   }
   ```

2. Register in `packages/test-engine/compilers/index.ts`:
   ```typescript
   import { MyBackend } from "./my-backend.js"

   export function registerAll(): void {
     // ... existing backends
     register(new MyBackend())
   }
   ```

3. Use in tests:
   ```typescript
   test("my backend test", {
     input: `console.log(42)`,
     expect: { toBe: 42 },
     compiler: "my-backend"
   })
   ```