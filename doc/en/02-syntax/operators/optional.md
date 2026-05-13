# Optional Operators

[← Up](./index.md) | [Next →](./precedence.md) | [Previous ←](./bitwise.md)

---

Special operators for safe work with nullable values and creating new collections.

## Operators

| Operator | Description |
|----------|-------------|
| `?.` | Optional chaining — safe access to field/method |
| `??` | Nullish coalescing — default value when `null` |
| `...` | Spread — expanding arrays and objects |

---

## Optional chaining `?.`

Allows safe access to properties and methods of nullable objects. If any element in the chain is `null`, the entire result is `null`:

```typescript
const name = user?.profile?.name;              // string | null
const len  = user?.tags?.length;               // i32 | null
const upper = user?.getName()?.toUpperCase();  // string | null
```

The result type of `?.` is always nullable — `T | null`:

```typescript
let user: User | null = getUser();
const name: string | null = user?.name;   // string | null, not string

// without ?. an explicit null-check is needed:
if (user !== null) {
    const name = user.name;               // string
}
```

`?.` works with:

- Properties: `obj?.field`
- Methods: `obj?.method()`
- Indexing: `arr?.[index]`

```typescript
const items: i32[] | null = getItems();
const first: i32 | null = items?.[0];     // i32 | null

const fn: (() => void) | null = getCallback();
fn?.();                                   // call only if fn is not null
```

### C-output for `?.`

```c
// const name = user?.profile?.name;
String* name = (user != NULL && user->profile != NULL)
    ? user->profile->name
    : NULL;
```

---

## Nullish coalescing `??`

Returns the right operand if the left is `null`. Detailed description is in the [Logical operators](./logical.md) section.

```typescript
const name = user?.name ?? "Anonymous";       // string
const age  = user?.age ?? 0;                  // i32
const city = user?.address?.city ?? "Unknown"; // string
```

---

## Spread `...`

Spread expands the elements of an array or the fields of an object. **Spread consumes the source** (move).

### Arrays

```typescript
let a: i32[] = [1, 2, 3];
let b: i32[] = [4, 5];

const combined: i32[] = [...a, ...b, 6];   // [1, 2, 3, 4, 5, 6]
// a — moved, cannot be used

// insertion in the middle
let prefix: i32[] = [1, 2];
let suffix: i32[] = [5, 6];
const full = [...prefix, 3, 4, ...suffix]; // [1, 2, 3, 4, 5, 6]
```

### Objects

```typescript
let base = { x: 1, y: 2, name: "origin" };
const extended = { ...base, z: 3 };        // { x: 1, y: 2, name: "origin", z: 3 }
// base — moved
```

Later fields overwrite earlier ones:

```typescript
let defaults = { timeout: 3000, retries: 3 };
const config = { ...defaults, retries: 5 };  // timeout: 3000, retries: 5
```

### Spread and `const`

Spread on `const` is allowed **only if the elements are primitives** (copied). For complex types — error:

```typescript
// primitives — const ok (copy)
const nums: i32[] = [1, 2, 3];
const copy = [...nums, 4];         // ok — i32 is copied
console.log(nums.length);          // ok — nums is alive

// complex types — const error (move impossible)
const admins: User[] = [user1, user2];
const all = [...admins, guest];    // error: cannot spread const array of non-primitive type
                                   // hint: use let, Shared<T>, or [...admins.clone()]
```

### Spread and `Shared<T>`

`Shared<T>` (ARC) — retain on spread, not move. Can be spread from `const`:

```typescript
const base: Shared<Item[]> = [item1, item2];
const listA = [...base, itemA];    // ok — retain
const listB = [...base, itemB];    // ok — retain
```

---

## C-output for spread

```c
// const combined = [...a, ...b, 6];
Array_i32 combined = tsc_array_new_i32(6);
tsc_array_push_i32(&combined, a.data[0]);
tsc_array_push_i32(&combined, a.data[1]);
tsc_array_push_i32(&combined, a.data[2]);
tsc_array_push_i32(&combined, b.data[0]);
tsc_array_push_i32(&combined, b.data[1]);
tsc_array_push_i32(&combined, 6);
tsc_array_drop(&a);   // source consumed
tsc_array_drop(&b);   // source consumed
```

---

## Errors

| Error | Cause |
|-------|-------|
| `cannot spread const array of non-primitive type` | Spread `const` with complex elements |
| `cannot spread const object` | Spread `const` object |
| `use of moved variable` | Using source after spread |
| `Object possibly null` | Calling method via `.` on nullable without `?.` |

## See also

- [Logical operators](./logical.md) — `??`, `&&`, `||`
- [Truthy / Falsy](../truthy-falsy.md) — nullable types and narrowing
- [Memory model](../../05-memory/index.md) — ownership, move, `Shared<T>`
