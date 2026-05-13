# Special Types: void, never, any

[← Up](./index.md) | [Next →](./null.md) | [Previous ←](./strings.md)

---

Three special types for special situations: `void` — absence of value, `never` — unreachable code, `any` — unknown type for C interop.

| TSC Type | C Type | Description |
|---------|-------|----------|
| `void` | `void` | Absence of return value |
| `never` | `_Noreturn void` | Bottom type — function never returns |
| `any` | `void*` | Unknown type — borrow checker disabled |

---

## void

`void` — a marker of absence of return value. Used **only** as a function return type.

```typescript
function greet(name: string): void {
    console.log(`Hello, ${name}!`);
}

function connect(): void throws IOError {
    // ...
}
```

### C Output

```c
void greet_string(String name) {
    printf("Hello, %s!\n", name.data);
}
```

`void` + `throws` — Result struct without a value field:

```c
typedef struct { bool ok; IOError error; } _Result_void_IOError;
```

### void Limitations

- Cannot be used as a variable or field type
- Cannot be passed as a function argument
- Cannot return a value from a `void` function

```typescript
let x: void;           // error: "void" can only be used as a return type
function f(v: void) {} // error
```

---

## never

`never` — bottom type: the type of a value that never exists. Two uses.

### 1. Functions That Never Return

All paths in a `never`-typed function must end with `throw`, an infinite loop, or a call to another `never` function.

```typescript
function panic(msg: string): never {
    throw new Error(msg);
}

function halt(): never {
    while (true) {}
}

function unreachable(): never {
    native `abort();`;
}
```

C output — `_Noreturn` (C11, supported by gcc/clang/avr-gcc):

```c
_Noreturn void fail_string(String msg) {
    tsc_throw(msg);
}
```

### 2. assertNever — Exhaustiveness Enforcement

`match` has a built-in exhaustiveness check (compiler error). For `switch` — only a warning. `assertNever` turns it into an error:

```typescript
function assertNever(x: never): never {
    throw new Error("assertNever: unhandled case");
}

enum Direction { North, South, East, West }

function label(dir: Direction): string {
    switch (dir) {
        case Direction.North: return "N";
        case Direction.South: return "S";
        case Direction.East:  return "E";
        case Direction.West:  return "W";
        default: assertNever(dir);  // all cases covered — dir: never
    }
}
```

`assertNever` is an ordinary user-defined function, not built-in.

### never Limitations

- Cannot be used as a variable or field type: `let x: never` — error
- `never | T` → always `T` (never is bottom type, absorbed)
- Cannot be used in `throws`: `function f(): void throws never` — error (meaningless)
- A function with `never` return type cannot have a path that returns control

```typescript
let x: never;           // error: "never" cannot be used as a variable type

function bad(): never {
    console.log("oops"); // error: function with return type "never" must not return
}
```

---

## any

`any` = `void*` in C. Disables borrow checker — memory management is entirely the developer's responsibility. Intended **exclusively** for C interop boundaries.

```typescript
function getFromC(): any { ... }
let val: any = getFromC();
let s = val as string;  // explicit cast required
```

### C Output

```c
void *passthrough(void *x) {
    return x;
}
```

### any Usage Rules

- `any` is **implicitly nullable** — `void*` can be `NULL`; writing `any | null` is redundant and forbidden
- `any` disables borrow checker — compiler does not generate destructors
- Passing `any` between TSClang functions — compiler error

| Context | Permissibility |
|----------|-------------|
| `.d.tsc` parameters and return type | ✅ — this is the `void*` for C interop |
| `.tsc` code: `val as T` cast | ✅ — immediate cast when receiving from C |
| `.tsc` code: variable of type `any` | ⚠️ code smell — use `Ref<T>` or `Mut<T>` |
| `.tsc` code: passing `any` between functions | ❌ compiler error |

### Example: C Callback with userdata

```typescript
// .d.tsc — any is appropriate for userdata/context
declare function lib_on_event(
    cb:   (result: i32, ctx: any) => void,
    data: any
): void;

// .tsc — cast immediately upon receiving
declare function sqlite3_column_blob(stmt: Ref<SqliteStmt>, col: i32): any
const blob = sqlite3_column_blob(stmt, 0) as Ref<u8[]>;  // borrow — SQLite owns
```

### any Limitations

```typescript
// any | null — forbidden (any is already nullable)
let x: any | null = null;    // error: any is already nullable, "any | null" is redundant

// Passing a TSClang type as any — forbidden
function foo(x: any): void {}
function bar(): void {
    const val: i32 = 42;
    foo(val);                  // error: cannot pass i32 as "any": any is opaque across function boundaries
}
```

---

## Summary Table

| Type | As Variable Type | As Return Type | Borrow Checker | Nullable |
|-----|--------------------|-----------------|---------------|----------|
| `void` | ❌ | ✅ | N/A | no |
| `never` | ❌ | ✅ | N/A | no |
| `any` | ⚠️ only in .d.tsc | ⚠️ only in .d.tsc | disabled | implicit |

---

## Errors

| Error | Reason |
|--------|---------|
| `"void" can only be used as a return type` | `let x: void` or `void` parameter |
| `"never" cannot be used as a variable type` | `let x: never` |
| `function with return type "never" must not return` | `never` function with a return path |
| `cannot pass i32 as "any": any is opaque across function boundaries` | Passing TSClang type to `any` parameter |
| `any is already nullable, "any \| null" is redundant` | `any \| null` — redundant |

---

## See Also

- [Null (T | null)](./null.md) — nullable types, optional chaining, nullish coalescing
- [Arrays](./arrays.md) — dynamic and fixed arrays
- [Map and Set](./map-set.md) — collections
- [Memory Model — Owner](../05-memory/owner.md) — ownership and move semantics
