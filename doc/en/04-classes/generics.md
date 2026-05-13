# Generics

[← Up](./index.md) | [Next →](./decorators.md) | [Previous ←](./enum.md)

---

Generics in TSClang are monomorphized — the compiler generates separate C code for each concrete type. Syntax is borrowed from TypeScript (`<T>`), bounds are set via `implements` or `extends`.

## Syntax

```typescript
function identity<T>(x: T): T { return x; }
function map<T, U>(arr: Ref<T[]>, f: (x: Ref<T>) => U): U[] { ... }

class Stack<T> {
    items: T[];
    mut push(item: T): void { ... }
    mut pop(): T { ... }
}
```

## Monomorphization

The compiler generates separate code for each concrete type:

```typescript
identity<i32>("hello")   // → identity_i32 in C
identity<string>("hi")   // → identity_string in C
```

```c
int32_t identity_i32(int32_t x) { return x; }
tsc_string identity_string(tsc_string x) { return x; }
```

## Bounds — constraining the type parameter

Bounds are set via `implements` or `extends` (synonyms):

```typescript
function sort<T implements Comparable<T>>(arr: Mut<T[]>): void { ... }
function sort<T extends Comparable<T>>(arr: Mut<T[]>): void { ... }

// multiple bounds via &
function process<T implements Comparable<T> & Serializable>(val: T): void { ... }

// structural bound (by fields, without interface)
function findById<T implements { id: i32 }>(arr: T[], id: i32): T | null { ... }

// multiple parameters with bounds
function zip<A implements Clone, B implements Clone>(a: A[], b: B[]): [A, B][] { ... }
```

> **Linter:** may warn that `implements` is preferred over `extends`. In the generic position `extends` semantically means inheritance, which does not exist in TSClang. `extends` is allowed for compatibility with TS developers' habits.

## Without bounds

Without bounds, checking happens at instantiation. Ownership rules are applied at the moment of concrete type substitution:

```typescript
first<i32>(arr);    // ok — primitive, copied
first<User>(arr);   // error at call site: User is a complex type, cannot return T from Ref<T[]>
```

## Ownership with generics

`Ref<T>`, `Mut<T>`, `Shared<T>`, `Weak<T>` work as usual:

```typescript
function first<T>(arr: Ref<T[]>): Ref<T> { ... }    // borrow element
function pop<T>(arr: Mut<T[]>): T { ... }            // move with removal
function process<T>(graph: Shared<T>) { ... }        // ARC
```

Generic classes with ownership:

```typescript
class Container<T> {
    value: T;

    constructor(value: T) {
        this.value = value;   // move T into field
    }

    get(): Ref<T> {
        return this.value;    // borrow
    }

    move take(): T {
        return this.value;    // move from container
    }
}

let c = new Container("hello");
const r = c.get();         // Ref<string>
const owned = c.take();    // move — c no longer owns the value
```

## Generics and decorators

Decorators that do not depend on concrete types (`@log`, `@timing`, `@guard`) work with generic classes without changes. Decorators that depend on type use generic constraints:

```typescript
decorator function validatePositive<P extends any[], R extends number>(
    cls: ClassDesc, key: string, desc: MethodDesc<P, R>
): MethodDesc<P, R> { ... }

class Container<T> {
    @validatePositive   // error: R=T does not satisfy constraint 'number'
    get(): T { ... }
}

class Counter {
    @validatePositive   // ok — R=number satisfies 'number'
    get(): number { ... }
}
```

## C-output

```typescript
class Stack<T> {
    items: T[];
    mut push(item: T): void { ... }
}
```

```c
// Stack<i32>
typedef struct {
    Array_i32 items;
} Stack_i32;

void Stack_i32_push(Stack_i32* self, int32_t item) { ... }

// Stack<string>
typedef struct {
    Array_string items;
} Stack_string;

void Stack_string_push(Stack_string* self, tsc_string item) { ... }
```

## Errors

| Error | Cause |
|-------|-------|
| `cannot return T from Ref<T[]>` | Ownership rule: borrow cannot be returned as owned |
| `R=T does not satisfy constraint 'number'` | Generic constraint not satisfied |
| `T does not implement Clone` | Calling `.clone()` on a type without Clone |

## See also

- [Classes](./classes.md) — definition, `mut`/`move` methods
- [Interfaces](./interfaces.md) — `implements`, bounds
- [Decorators](./decorators.md) — generic constraints in decorators
- [Memory Model](../05-memory/index.md) — ownership, `Ref<T>`, `Mut<T>`
