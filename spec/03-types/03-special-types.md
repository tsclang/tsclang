## Специальные типы

| Тип TSC | Тип C | Описание |
|---------|-------|----------|
| `void` | `void` | отсутствие значения — только для возвращаемого типа функции |
| `never` | `_Noreturn void` | функция никогда не возвращается; bottom type |
| `any` | `void*` | неизвестный тип — borrow checker не применяется |
| `unknown` | `tsc_unknown` | type-safe top-type — type-tagged container с runtime narrowing |

```typescript
function log(msg: string): void { ... }  // void — нет return value

function getFromC(): any { ... }         // void* в C
let val: any = getFromC();
let s = val as string;                   // явный cast обязателен
```

- `void` нельзя использовать как тип переменной — только возвращаемый тип
- `any` = `void*` в C, **неявно nullable** — `void*` может быть `NULL`; писать `any | null` избыточно и запрещено (ошибка компилятора)
- `any` отключает borrow checker — **управление памятью ручное**, компилятор не генерирует деструкторы для `any`; использовать только на границах C interop

**Ownership-контракт `any` — ответственность разработчика, не компилятора:**
- Передача `T` → `any` параметр: компилятор не знает владеет ли C-функция объектом — разработчик должен знать контракт библиотеки
- `any` как return type: требует немедленного `as T`; ownership (owned vs borrow) определяет разработчик исходя из документации C-функции
- Компилятор не предупреждает об утечках через `any` — это осознанный unsafe

```typescript
// .d.tsc — any как void* для C interop
declare function sqlite3_column_blob(stmt: Ref<SqliteStmt>, col: i32): any
declare function qsort(base: any, n: usize, size: usize, cmp: any): void

// .tsc — cast сразу при получении из C
const blob = sqlite3_column_blob(stmt, 0) as Ref<u8[]>  // borrow — SQLite владеет памятью
```

**Где `any` допустим:**

| Контекст | Допустимость |
|----------|-------------|
| `.d.tsc` параметры и return type | ✅ — это и есть `void*` для C interop |
| `.tsc` код: `val as T` cast | ✅ — немедленный cast при получении из C |
| `.tsc` код: переменная типа `any` | ⚠️ code smell — используй `Ref<T>` или `Mut<T>` |
| `.tsc` код: передача `any` между функциями | ❌ ошибка компилятора |

Для C callback-паттернов с userdata `any` — правильный выбор:
```typescript
// ✅ userdata/context в C callbacks — any уместен
declare function lib_on_event(
    cb:   (result: i32, ctx: any) => void,
    data: any
): void
```

### `unknown` — type-safe top-type

`unknown` — type-safe альтернатива `any` для пользовательского кода. Значение хранится в type-tagged container с runtime type information, что позволяет безопасное narrowing через `typeof`.

**Отличие от `any`:**

| Свойство | `any` | `unknown` |
|----------|-------|-----------|
| C-представление | `void*` | `tsc_unknown` struct |
| Type safety | нет — raw pointer | да — type_id + vtable |
| Доступ к значению | `as T` (unsafe cast) | `typeof` narrowing (safe) |
| Borrow checker | отключён | активен |
| Область применения | C interop (`.d.tsc`, extern) | пользовательский код |

#### C-layout

```c
typedef struct tsc_unknown_vtable {
    void (*drop)(void *buf);
    void (*clone_into)(const void *src, void *dst);
} tsc_unknown_vtable;

typedef struct {
    uint32_t                type_id;
    const tsc_unknown_vtable *vtable;
    uint8_t                 buffer[3 * sizeof(void*)];  // 12 bytes embedded / 24 bytes desktop
} tsc_unknown;
```

- `type_id` — runtime идентификатор типа (1=i32, 2=i64, 3=f32, 4=f64/number, 5=boolean, 6=string, 7=array, 8=object, 10=i8, 11=i16, 12=u8, 13=u16, 14=u32, 15=u64)
- `vtable` — указатель на drop/clone виртуальные функции
- `buffer` — inline хранилище на 3 машинных слова (достаточно для примитивов и string)

#### Packer / Getter

Компилятор генерирует packer/getter функции по требованию:

```c
// Primitives — inline в buffer
tsc_unknown tsc_unknown_from_i32(int32_t val);
int32_t     tsc_unknown_get_i32(const tsc_unknown *u);

// String — heap pointer (desktop) / inline (embedded)
tsc_unknown tsc_unknown_from_string(String val);  // desktop: tsc_string_retain (shared ownership)
String      tsc_unknown_get_string(const tsc_unknown *u);
```

#### `typeof` narrowing

`typeof x === "typename"` компилируется в runtime type_id check + automatic CFA narrowing:

```typescript
let x: unknown = getValue()

if (typeof x === "i32") {
    // x narrowed to i32 — можно использовать как число
    const sum = x + 1           // ok
    console.log(x)              // prints i32 value
}

if (typeof x === "string") {
    // x narrowed to string — доступны методы строк
    const len = x.length        // ok
    const upper = x.toUpperCase()  // ok
    console.log(x)
}
```

**Правила narrowing:**

1. `typeof x === "typename"` → `x.type_id == N` (runtime check)
2. Внутри `if`-блока: `x` получает narrowed C-type, доступна full семантика типа
3. `else`-блока: narrowed scope снимается
4. Borrow freeze: при narrowing контейнер замораживается (immutable) на время scope
5. `typeof x` вне narrowing context → возвращает `"unknown"` (compile-time)

**Поддерживаемые типы в typeof:**

| typeof строка | type_id | Примечание |
|---------------|---------|------------|
| `"i32"` | 1 | |
| `"i64"` | 2 | |
| `"f32"` | 3 | |
| `"f64"` | 4 | |
| `"number"` | defaultNumber | Платформозависимый: f64 на desktop, f32 на embedded. П2-совместимо (TS: `typeof x === "number"`) |
| `"boolean"` | 5 | |
| `"string"` | 6 | desktop: heap pointer + retain; embedded: inline |
| `"char"` | 16 | Символьный тип; `char` ≠ `u8` в typeof |
| `"array"` | 7 | heap pointer; narrow → `__array__` marker, access via `as Array<T>` |
| `"object"` | 8 | heap pointer; narrow → `__object__` marker, access via `as ClassName` |

#### Auto-wrap

Компилятор автоматически оборачивает значения при необходимости:

```typescript
function identity(val: unknown): unknown {
    return val   // ok — no wrap needed (already unknown)
}

function wrap(val: i32): unknown {
    return val   // auto-wrap → return tsc_unknown_from_i32(val)
}

function accept(val: unknown): void { ... }
accept(42)       // auto-wrap → tsc_unknown_from_f64(42)  (42 — это number, defaultNumber → f64 на desktop)
accept(3.14)     // auto-wrap → tsc_unknown_from_f64(3.14)

// Для конкретного типа — используйте явную аннотацию:
let x: i32 = 42
accept(x)        // auto-wrap → tsc_unknown_from_i32(x)  (x имеет тип i32)
```

#### String vtable

String в `unknown` использует shared ownership:

- **Desktop**: buffer хранит `String*` (heap pointer); packer делает `tsc_string_retain`; vtable drop — `tsc_string_release` + `free`; clone — malloc + copy + retain
- **Embedded**: buffer хранит String inline (memcpy); vtable drop — no-op; clone — memcpy

Safe для rodata строк (литералы): `tsc_string_retain` на rodata — no-op.

#### Ограничения (текущая реализация)

- else-if chains не поддерживают unknown narrowing — используйте отдельные `if`
- `typeof x === "number"` → type_id по defaultNumber (4=f64 на desktop, 3=f32 на embedded); i32/i64 не матчятся — используйте конкретный тип
- `any` вне `declare`/`unsafe` → compile-time error (Phase 3 lock-down)
- Embedded: unknown поддерживает только `{i32,i64,f32,f64,boolean,string}` — Array/Class → error
- `unknown[]` элементы: auto-pack при push/literal, per-element drop при free

### `never` — bottom type

`never` — тип значения, которое никогда не существует. Два применения.

**1. Возвращаемый тип функции, которая никогда не возвращается:**

```typescript
function panic(msg: string): never {
    throw new Error(msg)     // always throws — ok
}

function halt(): never {
    while (true) {}          // infinite loop — ok
}

function unreachable(): never {
    native `abort();`        // C abort — ok
}
```

C-output — `_Noreturn` атрибут (C11; gcc/clang/avr-gcc поддерживают):

```c
_Noreturn static void myapp_src_main_panic_string(String msg) {
    // ...
    abort();
}
```

Компилятор проверяет: все пути функции с `never` обязаны заканчиваться `throw`, бесконечным циклом или вызовом другой `never`-функции — иначе ошибка компилятора.

**2. `assertNever` — exhaustiveness enforcement для `switch`:**

`match` уже имеет встроенный exhaustiveness check (ошибка компилятора). Для `switch` — только предупреждение. `assertNever` превращает его в ошибку:

```typescript
function assertNever(x: never): never {
    throw new Error(`assertNever: unhandled case`)
}
```

```typescript
enum Direction { North, South, East, West }

// switch — предупреждение при неполном покрытии:
switch (dir) {
    case Direction.North: return "N"
    case Direction.South: return "S"
    // East и West не покрыты — только warning
    default: assertNever(dir)  // ❌ ошибка компилятора: dir не сужен до never
                                //    hint: покрой Direction.East и Direction.West
}

// После полного покрытия — dir сужается до never, assertNever принимает:
switch (dir) {
    case Direction.North: return "N"
    case Direction.South: return "S"
    case Direction.East:  return "E"
    case Direction.West:  return "W"
    default: assertNever(dir)  // ✅ — все случаи покрыты, dir: never
}
```

`assertNever` — обычная пользовательская функция, не встроенная. Рекомендуется добавить в проект один раз.

**Ограничения `never`:**

- Нельзя использовать как тип переменной или поля: `let x: never` → ошибка компилятора
- `never | T` → всегда `T` (never — bottom type, поглощается любым типом)
- `never` нельзя использовать в `throws`: `function f(): void throws never` → ошибка компилятора (бессмысленно)

## Null
