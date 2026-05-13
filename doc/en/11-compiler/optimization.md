# Optimization

[← Up](./index.md) | [Previous ←](./debug.md)

---

TSClang generates readable C and delegates machine optimizations to the C compiler (gcc/clang/avr-gcc). There is no point in duplicating decades of C compiler work.

## IR-level optimizations

Performed by the TSClang compiler **regardless of optimization level**:

| Optimization | Description |
|--------------|-------------|
| **Dead code elimination** | Functions, types, and imports unreachable from the entry point are not emitted into C. Checked statically via the call graph |
| **Monomorphization deduplication** | One generic instantiation (`Map<string, i32>`) used in N places → one C function, not N copies |

No other IR-level optimizations exist — constant folding, inlining, loop unrolling are all the C compiler's job.

## Optimization levels

The `optimize` level is passed as a flag to the C compiler. It does not affect the correctness of the generated C.

| Level | Flag | When to use |
|-------|------|-------------|
| `O0` | `-O0` | Debug — readable C, fast compilation, no optimizations |
| `O1` | `-O1` | Basic optimizations without increasing binary size |
| `O2` | `-O2` | Standard release — speed without aggressively increasing size |
| `O3` | `-O3` | Maximum speed — larger binary, possible loop unroll/vectorize |
| `Os` | `-Os` | Minimum size — for embedded with limited flash |

Default: `O0` in debug, `O2` in release. `Os` is recommended for AVR.

### Configuration

```json
// tsc.package.json
{
  "profiles": {
    "debug":   { "optimize": "O0" },
    "release": { "optimize": "O2" },
    "avr":     { "optimize": "Os" }
  }
}
```

### CLI

```bash
tsclang build --optimize Os     # override level
tsclang build --clean           # full rebuild
```

## Consumer-side monomorphization

Generics are instantiated **at the consumer**, not in the library. The library is compiled once into IR with "holes" for types.

### How it works

**Library** (`@myco/collections`):

```typescript
// index.tsc
export function identity<T>(x: T): T {
    return x
}

export class Box<T> {
    constructor(public value: T) {}
}
```

**Library cache** contains IR, not concrete types:

```
~/.tsclang/cache/@myco/collections@1.0.0/
  source/
    index.tsc
  build/
    desktop/
      include/
        collections.h      // IR with type holes
      lib/
        libcollections.a   // compiled IR
```

**Consumer**:

```typescript
import { identity, Box } from "@myco/collections"

const a = identity(42)           // identity<i32>
const b = identity("hello")      // identity<string>
const box = new Box<User>({...}) // Box<User>
```

**When compiling the project:**

1. Load library IR with type holes
2. Find usages: `identity<i32>`, `identity<string>`, `Box<User>`
3. Instantiate code for each type

### C-output

```c
// identity<i32>
int32_t  identity_i32(int32_t x)   { return x; }

// identity<string>
String*  identity_string(String* x) { return x; }

// Box<User>
typedef struct { User* value; } Box_User;
```

### Advantages

- Library is compiled once (not for every type combination)
- Optimal performance — inlining and specialization for the concrete type
- Only used instantiations end up in the binary

### metadata.json

A compiled library contains `metadata.json` for consumer-side monomorphization:

```json
{
  "exports": {
    "foo": { "layout_hash": "abc123" },
    "Bar": { "layout_hash": "def456", "size": 16 }
  },
  "generics": {
    "identity": { "params": ["T"] },
    "Map": { "params": ["K", "V"] }
  }
}
```

- `exports` — concrete (non-generic) exports with layout hash (cache invalidation when structure changes)
- `generics` — generic exports with parameter names

### Structure of a compiled library

```
@myco/mylib@1.0.0/
  source/
    index.tsc
    src/
      utils.tsc
  build/
    desktop/
      include/
        mylib.h
      lib/
        libmylib.a
  metadata.json
```

## Incremental compilation *(roadmap)*

Without incremental compilation, every rebuild repeats all generic instantiations. Three levels of caching are planned:

### 1. Generic instantiation cache

The result of `Map<string, User>` → C code is stored with the key `(generic_ir_hash, type_args)`. If the IR and types haven't changed — C code is taken from the cache.

### 2. File-level dependency tracking

Each `.tsc` file is compiled independently if its dependencies haven't changed. The graph is built from `import`. Changing `utils.tsc` only recompiles files that import it.

### 3. IR caching

Compiled IR of each module is cached by source hash. `tsclang build` checks hashes and skips unchanged modules.

### Cache invalidation

Automatic on:
- change of the source `.tsc` file
- change of dependency version (via `layout_hash` in `metadata.json`)
- change of compiler version

Explicit cleanup: `tsclang build --clean`.

## Errors

| Error | Cause |
|-------|-------|
| `cache corrupted: layout_hash mismatch` | Library cache is stale — run `tsclang build --clean` |
| `unknown optimization level 'O5'` | Invalid `optimize` value — allowed: O0, O1, O2, O3, Os |

## See also

- [Compilation phases](./phases.md) — IR, code generation
- [Name mangling](./name-mangling.md) — encoding of generic types
- [Generics](../04-classes/generics.md) — syntax and semantics of generics
- [CMake](../09-build/cmake.md) — debug/release profiles, optimization flags
- [Configuration](../09-build/config.md) — `optimize` field in `tsc.package.json`
