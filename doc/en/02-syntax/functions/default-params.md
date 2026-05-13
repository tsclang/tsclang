# Default Parameters

[← Up](./index.md) | [Previous ←](./overload.md)

---

Parameters with default values. Work for functions, methods, and constructors. At the callsite, the compiler substitutes the default value into the C-output.

## Syntax

```typescript
function add(x: i32, y: i32 = 10): i32 {
    return x + y;
}

console.log(add(5));      // 15 — y is substituted = 10
console.log(add(5, 20));  // 25 — y = 20
```

**C-output:**

```c
int32_t add_i32_i32(int32_t x, int32_t y) {
    return x + y;
}

// callsite:
printf("%d\n", add_i32_i32(5, 10));   // default substitution
printf("%d\n", add_i32_i32(5, 20));   // explicit value
```

The default value is substituted **at the callsite** — the function itself in C does not have default parameter values.

## Multiple Default Parameters

```typescript
function calc(x: i32, y: i32 = 2, z: i32 = 3): i32 {
    return x + y + z;
}

console.log(calc(1));        // 6  — y=2, z=3
console.log(calc(1, 10));    // 14 — y=10, z=3
console.log(calc(1, 10, 20)); // 31 — y=10, z=20
```

**C-output:**

```c
int32_t calc_i32_i32_i32(int32_t x, int32_t y, int32_t z) {
    return x + y + z;
}

printf("%d\n", calc_i32_i32_i32(1, 2, 3));
printf("%d\n", calc_i32_i32_i32(1, 10, 3));
printf("%d\n", calc_i32_i32_i32(1, 10, 20));
```

## Default Parameters in Methods

```typescript
class Printer {
    print(text: string, times: i32 = 1): void {
        for (let i = 0; i < times; i++) {
            console.log(text);
        }
    }
}

printer.print("hi");      // times=1
printer.print("hi", 3);   // times=3
```

## Rules

- Default parameters must be **at the end** of the parameter list
- The default value must be a **constant or literal**, not an expression with side effects
- It is forbidden to have an overload whose signature coincides with a call to another overload when default values are substituted

## Interaction with Overloading

The combination of default parameters and overloading can lead to ambiguity — this is a compiler error:

```typescript
function foo(x: i32, y: i32 = 0): void { /* ... */ }
function foo(x: i32): void { /* ... */ }
// ❌ error: ambiguous overload — foo(x: i32) coincides with foo(x: i32, y: i32 = 0)
```

If overloading by parameter count is needed — use default parameters **or** overloads, but not both for the same signature.

---

## Errors

| Error | Cause |
|-------|-------|
| `default parameter must be at end of parameter list` | Default parameter before a required one |
| `default value must be constant or literal` | Expression with side effects in the default value |
| `ambiguous overload with default parameters` | Overload duplicates a call with default parameters |

---

## See Also

- [Function Overloading](./overload.md) — multiple functions with the same name
- [Function Declarations](./declaration.md) — basic syntax
- [Arrow Functions](./arrow.md) — shorthand `=>` syntax
