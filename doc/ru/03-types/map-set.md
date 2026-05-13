# Map\<K, V\> и Set\<T\>

[← Вверх](./index.md) | [Следующий →](./tuples.md) | [Предыдущий ←](./arrays.md)

---

Хеш-таблица `Map<K, V>` и хеш-множество `Set<T>` — стандартные коллекции для данных с ключами, известными только в runtime. Ownership: `set`/`add` — move, `get`/`has` — borrow.

---

## Map\<K, V\>

### Создание

```typescript
// Универсальный — любой тип ключа
let m = new Map<string, i32>([["a", 1], ["b", 2]]);

// Объектный литерал — только string ключи
let m: Map<string, i32> = { "a": 1, "b": 2 };

// Пустая Map
let m = new Map<string, i32>();
```

### Методы

```typescript
m.set(key, value)   // key: move (сложный) / copy (примитив); value: move — Map владеет обоими
m.get(key)          // → Ref<V> | null — borrow из Map (не V | undefined как в JS)
m.has(key)          // → boolean
m.delete(key)       // → V | null — owned, элемент удалён из Map
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

`set` — move для сложных типов, copy для примитивов:

```typescript
let m = new Map<string, User>();
let user = new User();
m.set("alice", user);   // user — move
// console.log(user);   // ошибка: user перемещён

let u = m.get("alice");    // Ref<User> | null — borrow из Map
let u = m.delete("alice"); // User | null — owned, элемент удалён

// примитивы — всегда copy
let m = new Map<string, i32>();
m.set("x", 42);         // 42 скопирован
m.get("x");             // i32 | null — copy (примитив)
```

### `?.` и `??` с Map

```typescript
const len = m.get("key")?.length ?? 0;   // Ref<string> | null → i32
const val = m.delete("key") ?? fallback;  // V | null → V
```

### Итерация

`k: Ref<K>`, `v: Ref<V>` для сложных типов, copy для примитивов. Во время итерации Map заимствована — мутация запрещена:

```typescript
for (const [k, v] of m) {
    v.doSomething();     // ok — immutable метод
    v.mutMethod();       // ошибка — v это Ref
    m.set("x", val);    // ошибка — m заимствован
}

m.forEach((k, v) => { ... });
for (const k of m.keys()) { ... }
for (const v of m.values()) { ... }
for (const [k, v] of m.entries()) { ... }
```

---

## Set\<T\>

### Создание

```typescript
let s = new Set<i32>([1, 2, 3]);
let s = new Set<string>();
```

### Методы

```typescript
s.add(value)        // move — Set владеет; бросает при OOM
s.has(value)        // Ref<T> — сравнение; boolean
s.delete(value)     // → T | null — owned, элемент удалён
s.clear()           // void
s.size              // number, readonly
```

### C-output

```c
TscSet_i32 s = tsc_set_create_i32();
tsc_set_add_i32(&s, 1);
tsc_set_add_i32(&s, 2);
tsc_set_add_i32(&s, 1);                    // дубликат игнорируется
printf("%zu\n", s.size);                   // 2
printf("%s\n", tsc_set_has_i32(&s, 1) ? "true" : "false");   // true
const bool removed = tsc_set_delete_i32(&s, 1);
```

### Ownership

```typescript
let s = new Set<User>();
let user = new User();
s.add(user);        // move — user перешёл во владение Set
// console.log(user);  // ошибка: user перемещён

// примитивы — всегда copy
let s = new Set<i32>();
s.add(42);          // copy
console.log(42);    // ok
```

### `?.` и `??` с Set

```typescript
const deleted = s.delete(user);
deleted?.cleanup();                     // вызвать если элемент был
const u = s.delete(user) ?? fallback;   // дефолт если не было
```

### Итерация

`v` — `Ref<T>` для сложных типов, copy для примитивов. Во время итерации Set заимствован:

```typescript
for (const v of s) {
    v.doSomething();    // ok — immutable метод
    v.mutMethod();      // ошибка — v это Ref
    s.add(other);       // ошибка — s заимствован
}

s.forEach((v) => { ... });
for (const v of s.values()) { ... }
for (const v of s.keys()) { ... }             // синоним values() — совместимость с Map API
for (const [v, v2] of s.entries()) { ... }    // пары [value, value] — совместимость с Map API
```

---

## Теоретико-множественные операции

Доступны для примитивов, `string` и `Shared<T>`. Для owned сложных типов — ошибка компилятора.

```typescript
s.union(other)               // новый owned Set — все элементы из s и other
s.intersection(other)        // новый owned Set — только общие элементы
s.difference(other)          // новый owned Set — элементы s, которых нет в other
s.symmetricDifference(other) // новый owned Set — элементы только в одном из двух
s.isSubsetOf(other)          // boolean
s.isSupersetOf(other)        // boolean
s.isDisjointFrom(other)      // boolean
```

### Для `Shared<T>` — retain без копирования

```typescript
let user1: Shared<User> = new User();
let user2: Shared<User> = new User();

let a = new Set<Shared<User>>([user1, user2]);
let b = new Set<Shared<User>>([user2]);
let c = a.union(b);  // ok — retain на элементы, refcount растёт
```

### Для `string` — клонирование в новый Set

```typescript
let morphemes = new Set<string>(["бег", "ать"]);
let suffixes  = new Set<string>(["ать", "ить"]);
let common = morphemes.intersection(suffixes);  // Set<string> {"ать"}
```

### Для owned сложных типов — ошибка

```typescript
let a = new Set<User>([user1, user2]);
let b = new Set<User>([user2]);
let c = a.union(b);
// ошибка: union requires Set<primitive>, Set<string> or Set<Shared<T>>
// hint: use Set<Shared<User>> instead
```

---

## Object — статические методы

`Object.keys`, `Object.values`, `Object.entries` — работают с объектными литералами (compile-time struct), не с Map.

```typescript
const obj = { a: user1, b: user2 };

Object.keys(obj)         // string[] — копии ключей
Object.values(obj)       // Ref<User>[] — borrow значений
Object.entries(obj)      // [string, Ref<User>][] — ключи copy, значения Ref

// примитивы — всё copy
const obj = { x: 1, y: 2 };
Object.keys(obj)         // string[]
Object.values(obj)       // i32[]
Object.entries(obj)      // [string, i32][]
```

### Object.fromEntries\<T\>

Обратная операция к `Object.entries`:

```typescript
const entries: [string, i32][] = [["a", 1], ["b", 2]];
const obj = Object.fromEntries<{ a: i32; b: i32 }>(entries);
obj.a  // 1
obj.b  // 2
```

Компилятор знает тип через дженерик-параметр. Если ключи — строковые литералы, проверяет в compile-time. Если переменные — несоответствие вызывает runtime panic.

---

## Set на embedded

На `allocator: "static"` обязателен compile-time capacity через `@static`:

```typescript
@static const visitedTiles = new Set<u16>(256)   // 256 тайлов в BSS
@static const activeKeys   = new Set<u8>(8)      // 8 одновременно нажатых клавиш

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

Переполнение → runtime panic: `set overflow: capacity 256 exceeded`.

---

## Map vs Set vs Object — когда что

| Свойство | `Map<K, V>` | `Set<T>` | `{}` объектный литерал |
|----------|-------------|----------|----------------------|
| Ключи | runtime (любой тип) | runtime (один тип) | compile-time (известны) |
| Значения | есть | нет (только ключи) | есть |
| C-представление | хеш-таблица | хеш-множество | `typedef struct` |
| Порядок | вставки | вставки | порядок полей |
| Динамические ключи | ✅ | ✅ | ❌ |

---

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `union requires Set<primitive>, Set<string> or Set<Shared<T>>` | Set-операции с owned типами |
| `use Set<Shared<User>> instead` | Hint к ошибке выше |
| `set overflow: capacity N exceeded` | Runtime panic — переполнение static Set на embedded |
| `cannot mutate Set during iteration` | Мутация Set в `for...of` |

---

## См. также

- [Массивы](./arrays.md) — динамические и фиксированные массивы
- [Null (T | null)](./null.md) — `get()`, `delete()` возвращают `T | null`
- [Специальные типы](./special-types.md) — void, never, any
- [Модель памяти — Shared\<T\>](../05-memory/shared.md) — ARC для Set-операций
- [Модель памяти — Owner](../05-memory/owner.md) — move при `set`/`add`
