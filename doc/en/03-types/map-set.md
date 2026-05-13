# Map\<K, V\> and Set\<T\>

[← Up](./index.md) | [Next →](./tuples.md) | [Previous ←](./arrays.md)

---

Hash table `Map<K, V>` and hash set `Set<T>` — standard collections for data with keys known only at runtime. Ownership: `set`/`add` — move, `get`/`has` — borrow.

---

## Map\<K, V\>

### Creation

```typescript
// Universal — any key type
let m = new Map<string, i32>([["a", 1], ["b", 2]]);

// Object literal — string keys only
let m: Map<string, i32> = { "a": 1, "b": 2 };

// Empty Map
let m = new Map<string, i32>();
```

### Methods

```typescript
m.set(key, value)   // key: move (complex) / copy (primitive); value: move — Map owns both
m.get(key)          // → Ref<V> | null — borrow from Map (not V | undefined as in JS)
m.has(key)          // → boolean
m.delete(key)       // → V | null — owned, element removed from Map
m.clear()           // void
m.size              // number, readonly
```

### C-output

```c
TscMap_string_i32 m = tsc_map_create_string_i32();
tsc_map_set_string_i32(&m, STR_LIT("x"), 42);

typedef struct { bool has_value; int32_t value; } opt_i32;
opt_i32 v = tsc_map_get_string_i32(&m, STR_LIT("x"));
printf("%d\n", v.value);

opt_i32 removed = tsc_map_delete_string_i32(&m, STR_LIT("a"));
printf("%d\n", removed.value);
printf("%zu\n", m.size);
```

### Ownership

`set` — move for complex types, copy for primitives:

```typescript
let m = new Map<string, User>();
let user = new User();
m.set("alice", user);   // user — move
// console.log(user);   // error: user was moved

let u = m.get("alice");    // Ref<User> | null — borrow from Map
let u = m.delete("alice"); // User | null — owned, element removed

// primitives — always copy
let m = new Map<string, i32>();
m.set("x", 42);         // 42 is copied
m.get("x");             // i32 | null — copy (primitive)
```

### `?.` and `??` with Map

```typescript
const len = m.get("key")?.length ?? 0;   // Ref<string> | null → i32
const val = m.delete("key") ?? fallback;  // V | null → V
```

### Iteration

`k: Ref<K>`, `v: Ref<V>` for complex types, copy for primitives. During iteration the Map is borrowed — mutation is forbidden:

```typescript
for (const [k, v] of m) {
    v.doSomething();     // ok — immutable method
    v.mutMethod();       // error — v is Ref
    m.set("x", val);    // error — m is borrowed
}

m.forEach((k, v) => { ... });
for (const k of m.keys()) { ... }
for (const v of m.values()) { ... }
for (const [k, v] of m.entries()) { ... }
```

---

## Set\<T\>

### Creation

```typescript
let s = new Set<i32>([1, 2, 3]);
let s = new Set<string>();
```

### Methods

```typescript
s.add(value)        // move — Set owns; throws on OOM
s.has(value)        // Ref<T> — comparison; boolean
s.delete(value)     // → T | null — owned, element removed
s.clear()           // void
s.size              // number, readonly
```

### C-output

```c
TscSet_i32 s = tsc_set_create_i32();
tsc_set_add_i32(&s, 1);
tsc_set_add_i32(&s, 2);
tsc_set_add_i32(&s, 1);                    // duplicate is ignored
printf("%zu\n", s.size);                   // 2
printf("%s\n", tsc_set_has_i32(&s, 1) ? "true" : "false");   // true
const bool removed = tsc_set_delete_i32(&s, 1);
```

### Ownership

```typescript
let s = new Set<User>();
let user = new User();
s.add(user);        // move — user transferred to Set ownership
// console.log(user);  // error: user was moved

// primitives — always copy
let s = new Set<i32>();
s.add(42);          // copy
console.log(42);    // ok
```

### `?.` and `??` with Set

```typescript
const deleted = s.delete(user);
deleted?.cleanup();                     // call if element existed
const u = s.delete(user) ?? fallback;   // default if it did not exist
```

### Iteration

`v` — `Ref<T>` for complex types, copy for primitives. During iteration the Set is borrowed:

```typescript
for (const v of s) {
    v.doSomething();    // ok — immutable method
    v.mutMethod();      // error — v is Ref
    s.add(other);       // error — s is borrowed
}

s.forEach((v) => { ... });
for (const v of s.values()) { ... }
for (const v of s.keys()) { ... }             // synonym for values() — Map API compatibility
for (const [v, v2] of s.entries()) { ... }    // pairs [value, value] — Map API compatibility
```

---

## Set-theoretic operations

Available for primitives, `string`, and `Shared<T>`. For owned complex types — compiler error.

```typescript
s.union(other)               // new owned Set — all elements from s and other
s.intersection(other)        // new owned Set — only common elements
s.difference(other)          // new owned Set — elements in s not in other
s.symmetricDifference(other) // new owned Set — elements in exactly one of the two
s.isSubsetOf(other)          // boolean
s.isSupersetOf(other)        // boolean
s.isDisjointFrom(other)      // boolean
```

### For `Shared<T>` — retain without copying

```typescript
let user1: Shared<User> = new User();
let user2: Shared<User> = new User();

let a = new Set<Shared<User>>([user1, user2]);
let b = new Set<Shared<User>>([user2]);
let c = a.union(b);  // ok — retain on elements, refcount increases
```

### For `string` — cloning into a new Set

```typescript
let morphemes = new Set<string>(["бег", "ать"]);
let suffixes  = new Set<string>(["ать", "ить"]);
let common = morphemes.intersection(suffixes);  // Set<string> {"ать"}
```

### For owned complex types — error

```typescript
let a = new Set<User>([user1, user2]);
let b = new Set<User>([user2]);
let c = a.union(b);
// error: union requires Set<primitive>, Set<string> or Set<Shared<T>>
// hint: use Set<Shared<User>> instead
```

---

## Object — static methods

`Object.keys`, `Object.values`, `Object.entries` — work with object literals (compile-time struct), not with Map.

```typescript
const obj = { a: user1, b: user2 };

Object.keys(obj)         // string[] — copies of keys
Object.values(obj)       // Ref<User>[] — borrow of values
Object.entries(obj)      // [string, Ref<User>][] — keys are copy, values are Ref

// primitives — everything is copy
const obj = { x: 1, y: 2 };
Object.keys(obj)         // string[]
Object.values(obj)       // i32[]
Object.entries(obj)      // [string, i32][]
```

### Object.fromEntries\<T\>

Reverse operation to `Object.entries`:

```typescript
const entries: [string, i32][] = [["a", 1], ["b", 2]];
const obj = Object.fromEntries<{ a: i32; b: i32 }>(entries);
obj.a  // 1
obj.b  // 2
```

The compiler knows the type via the generic parameter. If keys are string literals, it checks at compile time. If variables — mismatch causes a runtime panic.

---

## Set on embedded

On `allocator: "static"` compile-time capacity is required via `@static`:

```typescript
@static const visitedTiles = new Set<u16>(256)   // 256 tiles in BSS
@static const activeKeys   = new Set<u8>(8)      // 8 simultaneously pressed keys

visitedTiles.add(0x0102)
visitedTiles.has(0x0102)
visitedTiles.delete(0x0102)
```

### C-output (static hash set)

```c
typedef struct { uint16_t key; bool occupied; } _visitedTiles_Entry;
static _visitedTiles_Entry _visitedTiles_data[256];
static Set_u16 visitedTiles = { _visitedTiles_data, 256, 0 };
```

Overflow → runtime panic: `set overflow: capacity 256 exceeded`.

---

## Map vs Set vs Object — when to use what

| Property | `Map<K, V>` | `Set<T>` | `{}` object literal |
|----------|-------------|----------|---------------------|
| Keys | runtime (any type) | runtime (single type) | compile-time (known) |
| Values | yes | no (keys only) | yes |
| C representation | hash table | hash set | `typedef struct` |
| Order | insertion | insertion | field order |
| Dynamic keys | ✅ | ✅ | ❌ |

---

## Errors

| Error | Cause |
|-------|-------|
| `union requires Set<primitive>, Set<string> or Set<Shared<T>>` | Set operations with owned types |
| `use Set<Shared<User>> instead` | Hint for the error above |
| `set overflow: capacity N exceeded` | Runtime panic — static Set overflow on embedded |
| `cannot mutate Set during iteration` | Mutating Set in `for...of` |

---

## See also

- [Arrays](./arrays.md) — dynamic and fixed arrays
- [Null (T | null)](./null.md) — `get()`, `delete()` return `T | null`
- [Special Types](./special-types.md) — void, never, any
- [Memory Model — Shared\<T\>](../05-memory/shared.md) — ARC for Set operations
- [Memory Model — Owner](../05-memory/owner.md) — move on `set`/`add`
