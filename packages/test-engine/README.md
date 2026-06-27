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
packages/test-engine/test-engine/
  engine.ts              # Core: matrix, describe, test, eq, platformMatrix
  run.ts                 # Entry point
  tests/
    let-i8.test.ts       # Basic i8 variable tests
    all-types.test.ts    # All 16 types with valid/invalid values
    platform-matrix.test.ts      # defaultNumber variants
    platform-targets.test.ts     # desktop vs AVR
    platform-specific.test.ts    # platform-specific behavior
    binary-inference.test.ts     # type inference for binary ops
    strict-mode.test.ts          # safe-math, no-lossy-cast
    literal-inference.test.ts    # literal type inference
    literal-overflow.test.ts     # overflow detection
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
  expect: eq(42)
})
```

Options:
- `input` — TSClang source code
- `expect` — expected stdout (use `eq(value)`)
- `expectError` — expect compile error
- `options` — codegen options (`defaultNumber`, `target`, `strict`)

### `eq(value)` — create expectation
```typescript
expect: eq(42)           // integer
expect: eq("hello")      // string
expect: eq("3.14")       // float as string
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

## Writing Tests

### Basic test
```typescript
import { describe, test, eq } from "../engine"

describe("my feature", () => {
  test("works", {
    input: `let x = 1\nconsole.log(x)`,
    expect: eq(1)
  })
})
```

### Error test
```typescript
test("overflow", {
  input: `let x: i8 = 256`,
  expectError: true
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
    expect: eq(1)
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