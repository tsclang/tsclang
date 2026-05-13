# for loop

[← Up](./index.md) | [Next →](./for-of.md)

---

Classic `for` loop with initialization, continuation condition, and step. Syntax matches TypeScript/JavaScript.

## Syntax

```typescript
for (init; condition; update) {
    // body
}
```

- **init** — variable declaration (`let i = 0`) or expression
- **condition** — expression convertible to `bool`; empty means infinite loop
- **update** — expression executed after each iteration (usually `i++`)

All three sections are optional: `for (;;)` is an infinite loop (equivalent to `while (true)`).

## Example

```typescript
for (let i: i32 = 0; i < 3; i++) {
    console.log(i);
}
```

### C-output

```c
for (int32_t i = 0; i < 3; i++) {
    printf("%d\n", i);
}
```

## Infinite loop

```typescript
for (;;) {
    // break required somewhere
}
// equivalent to:
while (true) {
    // ...
}
```

Both forms compile to `while (true) { ... }` in C.

## Initialization

The `init` section can declare one variable with type inference or explicit annotation:

```typescript
for (let i = 0; i < 10; i++) { }      // i: i32 (inferred)
for (let i: i32 = 0; i < 10; i++) { }  // i: i32 (explicit)
```

You can also use an expression (without declaration):

```typescript
let i = 0;
for (i = 0; i < 10; i++) { }  // reassigns existing i
```

## Scope

A variable declared in `init` is visible only inside the loop body. After the loop exits, it is inaccessible — same as in TypeScript.

```typescript
for (let i = 0; i < 3; i++) {
    console.log(i);  // ok
}
// console.log(i);   // error: i is not defined
```

## Nested loops

```typescript
for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
        console.log(i, j);
    }
}
```

### C-output

```c
for (int32_t i = 0; i < 3; i++) {
    for (int32_t j = 0; j < 3; j++) {
        printf("%d %d\n", i, j);
    }
}
```

## Counter type

If the type is not explicitly specified, `i32` is inferred. For array indices (`size_t`), use `for-of` or `for (let i: usize = 0; ...)`.

## See also

- [for-of](./for-of.md) — iteration over collections
- [while](./while.md) — condition-based loops
- [break / continue](./break-continue.md) — iteration control
