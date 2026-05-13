# Function Overloading

[← Up](./index.md) | [Next →](./default-params.md) | [Previous ←](./arrow.md)

---

TSClang supports function overloading by parameter types and by parameter count. The compiler selects the correct version at the callsite; functions with mangled names are generated in C.

## Overloading by Type

```typescript
function process(x: i32): string {
    return "int: " + x.toString();
}
function process(x: string): string {
    return "str: " + x;
}

console.log(process(42));       // "int: 42"
console.log(process("hello"));  // "str: hello"
```

**C-output:**

```c
String process_i32(int32_t x) {
    return tsc_string_concat(STR_LIT("int: "), tsc_i32_to_string(x));
}

String process_string(String x) {
    return tsc_string_concat(STR_LIT("str: "), x);
}

// callsite:
String _tmp_0 = process_i32(42);
String _tmp_1 = process_string(STR_LIT("hello"));
```

Each overload gets a unique C name according to the name mangling scheme: `<name>_<type1>_<type2>`.

## Overloading by Parameter Count

```typescript
function foo(x: i32): void { console.log(x); }
function foo(x: i32, y: i32): void { console.log(x + y); }

foo(5);      // calls foo_i32
foo(3, 4);   // calls foo_i32_i32
```

**C-output:**

```c
void foo_i32(int32_t x) {
    printf("%d\n", x);
}

void foo_i32_i32(int32_t x, int32_t y) {
    printf("%d\n", x + y);
}

// callsite:
foo_i32(5);
foo_i32_i32(3, 4);
```

## Class Method Overloading

Works similarly — mangling includes the class name:

```typescript
class Printer {
    print(x: i32): void { /* ... */ }
    print(x: string): void { /* ... */ }
}
// → Printer_print_i32, Printer_print_string
```

## Overload Resolution Priority

When several overloads fit a call, the compiler selects by priority:

| Priority | Rule | Example |
|----------|------|---------|
| 1 | Exact match (non-generic) | `foo(i32)` for the call `foo(42)` |
| 2 | Generic with inferred type | `foo<T>(x: T)` for the call `foo("hi")` |
| 3 | Implicit widening | `foo(f64)` for the call `foo(42)` — `i32` is widened to `f64` |

```typescript
function foo<T>(x: T): void { /* generic */ }
function foo(x: i32): void { /* non-generic */ }

foo(42);        // → foo(i32) — exact match (rule 1)
foo<i32>(42);   // → foo<i32> — explicit generic, priority ignored
foo("hello");   // → foo<string> — generic (rule 2)
foo(3.14);      // → foo<f64> — only generic fits
```

An explicit generic (`foo<i32>(42)`) always selects the generic overload regardless of priority.

## Restriction: extern "C" Forbids Overloading

`extern "C"` functions have a fixed C name — mangling is impossible. Overloading is a compiler error:

```typescript
// ❌ error: extern "C" functions cannot be overloaded
extern "C" function process(w: any, width: i32, height: i32): void { ... }
extern "C" function process(w: any, size: i32): void { ... }

// ✅ correct — different names for C
extern "C" function process_full(w: any, width: i32, height: i32): void { ... }
extern "C" function process_single(w: any, size: i32): void { ... }

// ✅ overloading inside TSClang — ok
function process(w: any, width: i32, height: i32): void { process_full(w, width, height); }
function process(w: any, size: i32): void { process_single(w, size); }
```

---

## Errors

| Error | Cause |
|-------|-------|
| `ambiguous overload` | Two overloads of the same priority equally fit the call |
| `extern "C" functions cannot be overloaded` | Attempt to overload a function with `extern "C"` |
| `no matching overload` | No overload fits the argument types |

---

## See Also

- [Default Parameters](./default-params.md) — default values
- [Function Declarations](./declaration.md) — basic syntax
- [Memory Model](../../05-memory/index.md) — ownership and argument passing
