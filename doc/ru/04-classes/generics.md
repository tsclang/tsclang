# Generics

[← Вверх](./index.md) | [Следующий →](./decorators.md) | [Предыдущий ←](./enum.md)

---

Generics в TSClang мономорфизируются — компилятор генерирует отдельный C-код для каждого конкретного типа. Синтаксис заимствован из TypeScript (`<T>`), bounds задаются через `implements` или `extends`.

## Синтаксис

```typescript
function identity<T>(x: T): T { return x; }
function map<T, U>(arr: Ref<T[]>, f: (x: Ref<T>) => U): U[] { ... }

class Stack<T> {
    items: T[];
    mut push(item: T): void { ... }
    mut pop(): T { ... }
}
```

## Мономорфизация

Компилятор генерирует отдельный код для каждого конкретного типа:

```typescript
identity<i32>("hello")   // → identity_i32 в C
identity<string>("hi")   // → identity_string в C
```

```c
int32_t identity_i32(int32_t x) { return x; }
tsc_string identity_string(tsc_string x) { return x; }
```

## Bounds — ограничение типового параметра

Bounds задаются через `implements` или `extends` (синонимы):

```typescript
function sort<T implements Comparable<T>>(arr: Mut<T[]>): void { ... }
function sort<T extends Comparable<T>>(arr: Mut<T[]>): void { ... }

// несколько bounds через &
function process<T implements Comparable<T> & Serializable>(val: T): void { ... }

// структурный bound (по полям, без interface)
function findById<T implements { id: i32 }>(arr: T[], id: i32): T | null { ... }

// несколько параметров с bounds
function zip<A implements Clone, B implements Clone>(a: A[], b: B[]): [A, B][] { ... }
```

> **Линтер:** может предупреждать, что предпочтительнее `implements` над `extends`. В позиции generic `extends` семантически означает наследование, которого в TSClang нет. `extends` допустим для совместимости с привычками TS-разработчиков.

## Без bounds

Без bounds проверка происходит при инстанцировании. Правила ownership применяются в момент подстановки конкретного типа:

```typescript
first<i32>(arr);    // ok — примитив, копируется
first<User>(arr);   // ошибка в точке вызова: User — сложный тип, нельзя вернуть T из Ref<T[]>
```

## Ownership с generics

`Ref<T>`, `Mut<T>`, `Shared<T>`, `Weak<T>` работают как обычно:

```typescript
function first<T>(arr: Ref<T[]>): Ref<T> { ... }    // borrow элемента
function pop<T>(arr: Mut<T[]>): T { ... }            // move с удалением
function process<T>(graph: Shared<T>) { ... }        // ARC
```

Generic-классы с ownership:

```typescript
class Container<T> {
    value: T;

    constructor(value: T) {
        this.value = value;   // move T в поле
    }

    get(): Ref<T> {
        return this.value;    // borrow
    }

    move take(): T {
        return this.value;    // move из контейнера
    }
}

let c = new Container("hello");
const r = c.get();         // Ref<string>
const owned = c.take();    // move — c больше не владеет значением
```

## Дженерики и декораторы

Декораторы, не зависящие от конкретных типов (`@log`, `@timing`, `@guard`), работают с дженерик-классами без изменений. Декораторы, зависящие от типа, используют generic-ограничения:

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

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `cannot return T from Ref<T[]>` | Ownership-правило: borrow нельзя вернуть как owned |
| `R=T does not satisfy constraint 'number'` | Generic constraint не выполнен |
| `T does not implement Clone` | Вызов `.clone()` для типа без Clone |

## См. также

- [Классы](./classes.md) — определение, `mut`/`move`-методы
- [Интерфейсы](./interfaces.md) — `implements`, bounds
- [Декораторы](./decorators.md) — generic constraints в декораторах
- [Модель памяти](../05-memory/index.md) — ownership, `Ref<T>`, `Mut<T>`
