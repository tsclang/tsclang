# Arrow Functions

[← Up](./index.md) | [Next →](./overload.md) | [Previous ←](./declaration.md)

---

Arrow functions are a shorthand syntax for function declarations. Two body forms are supported: expression and block.

## Expression Body

A single expression after `=>` — the result is returned automatically:

```typescript
const square = (x: i32): i32 => x * x;
```

```c
static int32_t _lambda_0_i32(int32_t x) {
    return x * x;
}

int32_t (*square)(int32_t) = _lambda_0_i32;
```

## Block Body

A body in curly braces — requires an explicit `return`:

```typescript
const abs = (x: i32): i32 => {
    if (x < 0) { return -x; }
    return x;
};
```

```c
static int32_t _lambda_0_i32(int32_t x) {
    if (x < 0) {
        return -x;
    }
    return x;
}
```

## Parentheses Around Parameters

- **With type annotations** — parentheses are required: `(x: i32) => ...`
- **Without annotations** — parentheses are optional: `x => ...` or `(x) => ...`

```typescript
const f = (x: i32): i32 => x + 1;   // annotations → parentheses required
const g = x => x + 1;               // no annotations → parentheses optional
const h = (x) => x + 1;             // also allowed
```

## Async Arrow Functions

An `async` arrow function returns `Promise<T>`:

```typescript
const fetchUser = async (id: i32): Promise<User> => await http.get(`/users/${id}`);

// without explicit annotation — type is inferred
const fn = async () => await fetchData();              // () => Promise<Data>
arr.map(async item => await process(item));            // (item: T) => Promise<U>
```

Async IIFE:

```typescript
const result = await (async () => {
    const data = await fetchData();
    return data.value;
})();
```

Async lambdas are allowed anywhere regular ones are: in `map`, `filter`, `Promise.all`, etc.

---

## Errors

| Error | Cause |
|-------|-------|
| `parentheses required when type annotations present` | `(x: i32) => ...` without parentheses around the parameter |
| `await is only valid in async function` | `await` inside a non-async arrow function |

---

## See Also

- [Function Declarations](./declaration.md) — `function`, anonymous functions, closures
- [Function Overloading](./overload.md) — multiple functions with the same name
- [Async/Await](../../07-concurrency/index.md) — details on working with async
