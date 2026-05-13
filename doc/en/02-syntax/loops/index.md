# Loops

[← Up](../index.md) | [Next →](./for.md)

---

TSClang supports four kinds of loops and iteration control mechanisms.

## Overview

| Construct | Description |
|-------------|----------|
| [`for`](./for.md) | Classic loop with initialization, condition, and step |
| [`for-of`](./for-of.md) | Iteration over arrays, strings, Map, Set, and other collections |
| [`while` / `do-while`](./while.md) | Pre-condition and post-condition loops |
| [`break` / `continue`](./break-continue.md) | Iteration control, including labels (`label:`) |

## Supported constructs

### `for`

Classic C-like loop. Initialization, condition, step:

```typescript
for (let i = 0; i < 10; i++) {
    console.log(i);
}
```

### `for-of`

Iteration over collection elements. Supports arrays, strings, Map, Set, and user-defined `Iterable<T>`:

```typescript
const arr = [1, 2, 3];
for (const item of arr) {
    console.log(item);
}
```

### `while` / `do-while`

Condition-checking loops:

```typescript
while (condition) { /* ... */ }
do { /* ... */ } while (condition);
```

### `break` / `continue`

Loop exit or proceeding to next iteration. Support labels for nested loops:

```typescript
outer: while (true) {
    while (true) {
        if (done) break outer;
        if (skip) continue outer;
    }
}
```

## Unsupported constructs

| Construct | Alternative |
|-------------|--------------|
| `for-in` | `for-of` — object key iteration is not supported |

```typescript
// error: 'for-in' loops are not supported; use 'for-of' instead
for (const key in obj) { }
```

## Async and loops

`await` inside `while` / `for` executes **sequentially** — each iteration waits for the previous one to complete. For parallel execution use `Promise.all`.

```typescript
// sequential — each iteration waits
while (hasMore()) {
    const data = await fetchData();
    process(data);
}

// parallel — all requests at once
const results = await Promise.all(urls.map(u => fetch(u)));
```

Asynchronous loops compile to a state machine with `goto` transitions between states.

## See also

- [Arrays](../../03-types/arrays.md) — array iteration
- [Strings](../../03-types/strings.md) — character and code point iteration
- [Map / Set](../../03-types/maps-sets.md) — collection iteration
- [Async](../../07-async/index.md) — generators and `for await`
