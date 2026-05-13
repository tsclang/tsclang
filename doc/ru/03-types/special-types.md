# Специальные типы: void, never, any

[← Вверх](./index.md) | [Следующий →](./null.md) | [Предыдущий ←](./strings.md)

---

Три специальных типа для особых ситуаций: `void` — отсутствие значения, `never` — недостижимый код, `any` — неизвестный тип для C interop.

| Тип TSC | Тип C | Описание |
|---------|-------|----------|
| `void` | `void` | Отсутствие возвращаемого значения |
| `never` | `_Noreturn void` | Bottom type — функция никогда не возвращается |
| `any` | `void*` | Неизвестный тип — borrow checker отключён |

---

## void

`void` — маркер отсутствия возвращаемого значения. Используется **только** как возвращаемый тип функции.

```typescript
function greet(name: string): void {
    console.log(`Hello, ${name}!`);
}

function connect(): void throws IOError {
    // ...
}
```

### C-output

```c
void greet_string(String name) {
    printf("Hello, %s!\n", name.data);
}
```

`void` + `throws` — Result-struct без value-поля:

```c
typedef struct { bool ok; IOError error; } _Result_void_IOError;
```

### Ограничения void

- Нельзя использовать как тип переменной или поля
- Нельзя передать как аргумент функции
- Нельзя вернуть значение из `void`-функции

```typescript
let x: void;           // ошибка: "void" can only be used as a return type
function f(v: void) {} // ошибка
```

---

## never

`never` — bottom type: тип значения, которое никогда не существует. Два применения.

### 1. Функции, которые никогда не возвращаются

Все пути функции с типом `never` обязаны заканчиваться `throw`, бесконечным циклом или вызовом другой `never`-функции.

```typescript
function panic(msg: string): never {
    throw new Error(msg);
}

function halt(): never {
    while (true) {}
}

function unreachable(): never {
    native `abort();`;
}
```

C-output — `_Noreturn` (C11, поддерживается gcc/clang/avr-gcc):

```c
_Noreturn void fail_string(String msg) {
    tsc_throw(msg);
}
```

### 2. assertNever — exhaustiveness enforcement

`match` имеет встроенный exhaustiveness check (ошибка компилятора). Для `switch` — только предупреждение. `assertNever` превращает его в ошибку:

```typescript
function assertNever(x: never): never {
    throw new Error("assertNever: unhandled case");
}

enum Direction { North, South, East, West }

function label(dir: Direction): string {
    switch (dir) {
        case Direction.North: return "N";
        case Direction.South: return "S";
        case Direction.East:  return "E";
        case Direction.West:  return "W";
        default: assertNever(dir);  // все случаи покрыты — dir: never
    }
}
```

`assertNever` — обычная пользовательская функция, не встроенная.

### Ограничения never

- Нельзя использовать как тип переменной или поля: `let x: never` — ошибка
- `never | T` → всегда `T` (never — bottom type, поглощается)
- Нельзя использовать в `throws`: `function f(): void throws never` — ошибка (бессмысленно)
- Функция с возвращаемым типом `never` не может иметь путь, возвращающий управление

```typescript
let x: never;           // ошибка: "never" cannot be used as a variable type

function bad(): never {
    console.log("oops"); // ошибка: function with return type "never" must not return
}
```

---

## any

`any` = `void*` в C. Отключает borrow checker — управление памятью полностью на совести разработчика. Предназначен **исключительно** для границ C interop.

```typescript
function getFromC(): any { ... }
let val: any = getFromC();
let s = val as string;  // явный cast обязателен
```

### C-output

```c
void *passthrough(void *x) {
    return x;
}
```

### Правила использования any

- `any` **неявно nullable** — `void*` может быть `NULL`; писать `any | null` избыточно и запрещено
- `any` отключает borrow checker — компилятор не генерирует деструкторы
- Передача `any` между TSClang-функциями — ошибка компилятора

| Контекст | Допустимость |
|----------|-------------|
| `.d.tsc` параметры и return type | ✅ — это и есть `void*` для C interop |
| `.tsc` код: `val as T` cast | ✅ — немедленный cast при получении из C |
| `.tsc` код: переменная типа `any` | ⚠️ code smell — используй `Ref<T>` или `Mut<T>` |
| `.tsc` код: передача `any` между функциями | ❌ ошибка компилятора |

### Пример: C callback с userdata

```typescript
// .d.tsc — any уместен для userdata/context
declare function lib_on_event(
    cb:   (result: i32, ctx: any) => void,
    data: any
): void;

// .tsc — cast сразу при получении
declare function sqlite3_column_blob(stmt: Ref<SqliteStmt>, col: i32): any
const blob = sqlite3_column_blob(stmt, 0) as Ref<u8[]>;  // borrow — SQLite владеет
```

### Ограничения any

```typescript
// any | null — запрещено (any уже nullable)
let x: any | null = null;    // ошибка: any is already nullable, "any | null" is redundant

// Передача TSClang-типа как any — запрещено
function foo(x: any): void {}
function bar(): void {
    const val: i32 = 42;
    foo(val);                  // ошибка: cannot pass i32 as "any": any is opaque across function boundaries
}
```

---

## Сводная таблица

| Тип | Как тип переменной | Как return type | Borrow checker | Nullable |
|-----|--------------------|-----------------|---------------|----------|
| `void` | ❌ | ✅ | N/A | нет |
| `never` | ❌ | ✅ | N/A | нет |
| `any` | ⚠️ только в .d.tsc | ⚠️ только в .d.tsc | отключён | неявно |

---

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `"void" can only be used as a return type` | `let x: void` или параметр `void` |
| `"never" cannot be used as a variable type` | `let x: never` |
| `function with return type "never" must not return` | `never`-функция с путём возврата |
| `cannot pass i32 as "any": any is opaque across function boundaries` | Передача TSClang-типа в `any`-параметр |
| `any is already nullable, "any \| null" is redundant` | `any \| null` — избыточно |

---

## См. также

- [Null (T | null)](./null.md) — nullable типы, optional chaining, nullish coalescing
- [Массивы](./arrays.md) — динамические и фиксированные массивы
- [Map и Set](./map-set.md) — коллекции
- [Модель памяти — Owner](../05-memory/owner.md) — ownership и move-семантика
