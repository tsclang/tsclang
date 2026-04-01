# TSClang — Корпус тестов

Верхнеуровневое описание того, что тестировать и как.
Каждый пункт = один тест (или несколько тесно связанных тестов).

---

## Соглашения

### Структура теста

```
doc/<phase>/<feature>/<test-name>/
    input.tsc          — входной TSClang-код (обязательно)
    expected.c         — ожидаемый C-output (для success-тестов)
    expected.out       — ожидаемый stdout при запуске (опционально)
    expected.error     — ожидаемое сообщение об ошибке (для error-тестов)
```

### Типы тестов

- **[R] Runnable** — `expected.c` + `expected.out`. Компилируется и запускается.
- **[F] Fragment** — только `expected.c`. Нет точки входа. Проверяет C-output конкретной конструкции.
- **[E] Error** — только `expected.error`. Компилятор должен завершиться с ошибкой.

По умолчанию стремимся к [R]. [F] — только когда тестируем изолированную конструкцию без смысла запускать (например, объявление типа). [E] — для всех ошибок компилятора.

### Формат `expected.error`

Перечисление строк, каждая из которых должна присутствовать в stderr (в любом порядке):

```
error[TSC-E011]
type mismatch
expected i32, got f64
input.tsc:1:
```

Не проверяем точное форматирование — только наличие ключевых частей.

### Сравнение C-output

Нормализация перед сравнением:
- убрать trailing whitespace на каждой строке
- схлопнуть несколько пустых строк в одну
- остальное — exact match

---

## Phase 0 — Core Runtime

Минимальная инфраструктура: console, базовые типы-заглушки, Error.

### console

- [R] `console.log` строка-литерал
- [R] `console.log` i32
- [R] `console.log` f64
- [R] `console.log` bool (true, false)
- [R] `console.log` несколько аргументов
- [R] `console.error` строка
- [R] `console.warn` строка
- [R] `console.debug` строка
- [R] вызов console.log несколько раз подряд

### Error (заглушка)

- [F] объявление класса-наследника `Error` (структура в C)
- [F] `new Error("message")` — создание экземпляра
- [F] доступ к `.message`

### Globals — performance

- [R] `performance.now()` возвращает f64
- [R] два вызова: второй ≥ первого (монотонность)

---

## Phase 1 — Базовый парсинг и кодогенерация

### Переменные — let

- [R] `let x: i8 = 0` — минимальное значение
- [R] `let x: i8 = 127` — максимальное значение
- [R] `let x: i16 = 0`
- [R] `let x: i16 = 32767`
- [R] `let x: i32 = 0`
- [R] `let x: i32 = 2147483647`
- [R] `let x: i64 = 0`
- [R] `let x: i64 = 9223372036854775807`
- [R] `let x: u8 = 0`
- [R] `let x: u8 = 255`
- [R] `let x: u16 = 0`
- [R] `let x: u16 = 65535`
- [R] `let x: u32 = 0`
- [R] `let x: u32 = 4294967295`
- [R] `let x: u64 = 0`
- [R] `let x: f32 = 0.0`
- [R] `let x: f32 = 3.14`
- [R] `let x: f64 = 0.0`
- [R] `let x: f64 = 3.141592653589793`
- [R] `let x: bool = true`
- [R] `let x: bool = false`
- [R] `let x: usize = 0`
- [R] let без типа, вывод из i32-литерала → `number` (`f64`)
- [R] let без типа, вывод из float-литерала → `number` (`f64`)
- [R] let без типа, вывод из bool → `bool`
- [R] переприсвоение let: `let x: i32 = 1; x = 2`
- [R] let без инициализатора + последующее присвоение
- [R] несколько let в одной функции

### Переменные — const

- [R] `const x: i32 = 42`
- [R] const без типа (inference)
- [E] переприсвоение const → `cannot assign to const`

### Числовые литералы

- [R] десятичный целый: `42`, `0`, `-1`
- [R] шестнадцатеричный: `0xFF`, `0x1A2B`
- [R] бинарный: `0b1010`, `0b11111111`
- [R] восьмеричный: `0o77`
- [R] float с точкой: `3.14`, `0.5`, `1.0`
- [R] float с экспонентой: `1e3`, `2.5e-2`
- [R] числа с `_` разделителем: `1_000_000`, `0xFF_FF`
- [R] отрицательный литерал: `-42`, `-3.14`

### Операторы — арифметика

- [R] `+` для i32
- [R] `-` для i32
- [R] `*` для i32
- [R] `/` для i32 (целочисленное)
- [R] `%` для i32
- [R] `**` для f64
- [R] `++` prefix: `++x`
- [R] `++` postfix: `x++`
- [R] `--` prefix: `--x`
- [R] `--` postfix: `x--`
- [R] смешанная арифметика с приоритетом: `2 + 3 * 4`
- [R] скобки меняют приоритет: `(2 + 3) * 4`

### Операторы — присваивание

- [R] `+=`
- [R] `-=`
- [R] `*=`
- [R] `/=`
- [R] `%=`
- [R] `**=`
- [R] `&=`
- [R] `|=`
- [R] `^=`
- [R] `<<=`
- [R] `>>=`
- [R] `>>>=`
- [R] `&&=`
- [R] `||=`
- [R] `??=` (для nullable — в Phase 2)

### Операторы — сравнение

- [R] `==` для i32 (true)
- [R] `==` для i32 (false)
- [R] `!=`
- [R] `===` (идентично `==`)
- [R] `!==`
- [R] `<`
- [R] `>`
- [R] `<=`
- [R] `>=`

### Операторы — логические

- [R] `&&` оба true
- [R] `&&` первый false (short-circuit)
- [R] `||` оба false
- [R] `||` первый true (short-circuit)
- [R] `!` true → false
- [R] `!` false → true
- [R] `||` возвращает операнд (не bool): `0 || 42` → `42`
- [R] `&&` возвращает операнд: `1 && 42` → `42`
- [E] `||` и `??` без скобок → ошибка: `a || b ?? c`

### Операторы — битовые

- [R] `&`
- [R] `|`
- [R] `^`
- [R] `~`
- [R] `<<`
- [R] `>>` (знаковый)
- [R] `>>>` (беззнаковый)

### Операторы — тернарный

- [R] `cond ? a : b` → a
- [R] `cond ? a : b` → b
- [R] вложенные тернарники

### Truthy / Falsy

- [R] `if (0)` — falsy
- [R] `if (1)` — truthy
- [R] `if ("")` — falsy (Phase 3, строки)
- [R] `if ("x")` — truthy (Phase 3)
- [R] `if (false)` — falsy
- [R] `if (true)` — truthy

### Функции

- [R] объявление без параметров, void return
- [R] объявление с параметрами i32
- [R] объявление с параметрами разных типов
- [R] явный return с значением
- [R] функция возвращает вычисленное значение
- [R] рекурсивная функция (факториал)
- [R] вызов функции как statement
- [R] вызов функции как expression (результат присваивается)
- [R] вложенные вызовы: `f(g(x))`
- [R] стрелочная функция с expression body
- [R] стрелочная функция с block body
- [R] анонимная функция (присваивается переменной)
- [R] IIFE
- [F] name mangling: `function foo(a: i32, b: f64)` → `foo_i32_f64`
- [F] name mangling без параметров: `function foo()` → `foo`

### Дефолтные параметры

- [R] один дефолтный параметр в конце, вызов без него
- [R] один дефолтный параметр, вызов с ним (overrides дефолт)
- [R] несколько дефолтных параметров
- [E] дефолтный параметр не в конце
- [E] выражение с побочным эффектом как дефолт

### if / else

- [R] if без else, условие true
- [R] if без else, условие false
- [R] if + else, условие true
- [R] if + else, условие false
- [R] if + else if + else
- [R] вложенные if
- [R] if без фигурных скобок (однострочный)

### while

- [R] while с счётчиком
- [R] while false — не выполняется
- [R] break в while
- [R] continue в while
- [R] вложенные while

### do-while

- [R] do-while выполняется хотя бы раз при false-условии
- [R] do-while с счётчиком

### Labeled break / continue

- [R] break с меткой выходит из внешнего цикла
- [R] continue с меткой переходит к внешнему циклу

### switch / case

- [R] switch с i32: одно совпадение
- [R] switch с i32: default
- [R] switch с несколькими case
- [R] группировка пустых case (`case 1: case 2:`)
- [R] switch без default
- [E] отсутствующий break → `implicit fallthrough`
- [E] switch по float → ошибка (только числа, string, bool, enum)

### Приоритет операторов (таблица из спеки)

- [R] `2 + 3 * 4 == 14` — mul > add
- [R] `4 == 2 + 2` — add > comparison
- [R] `1 | 2 & 3` — & > |
- [R] `1 || 0 && 0` — && > ||
- [R] `a = b = 5` — правая ассоциативность присваивания
- [R] `2 ** 3 ** 2` — правая ассоциативность `**`

### Комментарии

- [R] однострочный `//`
- [R] многострочный `/* */`
- [R] JSDoc `/** */` (игнорируется компилятором)

### Форматирование (ASI и пр.)

- [R] код без точек с запятой
- [R] код с точками с запятой
- [R] trailing comma в аргументах
- [R] перенос строки после бинарного оператора

### Rest-параметры

- [R] `function f(...args: i32[])` — массив всех аргументов
- [R] rest после обычных параметров: `f(x: i32, ...rest: i32[])`
- [E] rest не в конце: `f(...args: i32[], x: i32)` → ошибка
- [E] два rest: `f(...a: i32[], ...b: i32[])` → ошибка
- [F] C-output: rest → массив + count параметр

### Деструктуризация в параметрах функции

- [R] `function f({ x, y }: Point)` — borrow полей
- [R] `function f([first, second]: i32[])` — borrow элементов
- [R] с аннотацией типа: `function f({ name: string }: User)` — move поля
- [R] вложенная деструктуризация в параметре
- [E] деструктуризация rest-параметра → ошибка

### Функции как значения

- [R] функция сохраняется в переменную: `const fn = foo`
- [R] функция передаётся в другую функцию как аргумент
- [R] функция возвращается из функции
- [R] массив функций: `const fns: ((i32) => i32)[]`
- [F] C-output: function pointer

### Spread примитивов (Phase 1)

- [R] spread массива примитивов в вызове функции: `f(...arr)`
- [R] spread в литерале массива примитивов: `[...a, ...b]`
- [E] spread сложных типов без ownership → ошибка (ждать Phase 3)

---

## Phase 2 — Система типов

### Type inference

- [R] `const x = 42` → i32/f64 (number)
- [R] `const x = 3.14` → f64
- [R] `const x = true` → bool
- [R] тип выводится из возврата функции
- [R] тип выводится из аргумента при вызове

### Числовые автокасты — механизм 1: type-level widening

- [R] `i32 → i64` неявно (same-sign)
- [R] `u32 → u64` неявно (same-sign)
- [R] `i32 → f64` неявно
- [R] `u32 → f64` неявно
- [R] `f32 → f64` неявно
- [R] `u8 → i16` неявно (cross-sign: все u8 помещаются в i16)
- [R] `u16 → i32` неявно (cross-sign)
- [R] `u32 → i64` неявно (cross-sign)
- [R] `let a: u32 = x; let b: i64 = a + 1` — works via type-level
- [E] `u64 → i64` без `as` → ошибка (u64 max > i64 max)
- [E] `i64 → u32` без `as` → ошибка (отрицательные не помещаются)
- [E] `i64 → f64` без `as` → ошибка (потеря точности)
- [E] `i32 → f32` без `as` → ошибка (потеря точности)

### Числовые автокасты — механизм 2: const literal analysis

- [R] `const a: i32 = -1; const b: u32 = 2; const c: f64 = a + b` → ok (шаг 1: i32 вмещает оба)
- [R] `const a: i64 = 1; const b: u32 = 2; const c: f64 = a + b` → ok (шаг 1: u32 вмещает оба)
- [R] `const a: i64 = 1; const b: u32 = 2; const c: u32 = a + b` → ok (результат 3 в u32)
- [E] `const a: i32 = -1; const b: u32 = 3_000_000_000; const c: f64 = a + b` → ошибка (шаг 1: i32 не вмещает 3G, u32 не вмещает -1; шаг 2: наибольший u32 не вмещает -1)
- [E] `const a: i64 = 3_000_000_000; const b: u32 = 2_000_000_000; const c: u32 = a + b` → ошибка (шаг 1: u32 вмещает оба; сумма 5G > u32 max — шаг 5)
- [R] `const a: i64 = 200; const b: u32 = 100; const c: u8 = a + b` → ошибка (шаг 5: результат 300 не в u8)

### Числовые автокасты — механизм 3: let требует явный as

- [E] `let a: i64 = 1; let b: u32 = 2; const c: f64 = a + b` → ошибка (i64 + u32, нет type-level widening)
- [R] `let a: i64 = 1; let b: u32 = 2; const c: f64 = (a + (b as i64)) as f64` → ok

### Оператор `as` — числовые касты

- [R] `3.14 as i32` → 3 (truncate)
- [R] `1000 as i8` → wrap-truncation
- [R] `300 as u8` → 44
- [R] `-1 as u32` → 4294967295
- [R] `i32 as i64`
- [R] `f64 as f32`
- [E] `as` для ownership типов: `user as Ref<User>` → ошибка

### Null / Optional

- [R] `let x: i32 | null = null`
- [R] `let x: i32 | null = 42`
- [R] `let x?: i32` (sugar для `i32 | null = null`)
- [R] if (x != null) narrowing → x: i32
- [R] optional chaining `?.` на null → null
- [R] optional chaining `?.` на non-null → значение
- [R] `??` с null lhs → правый операнд
- [R] `??` с non-null lhs → левый операнд
- [R] `??=` присваивает только если null
- [F] C-layout для `i32 | null` → `struct { bool has_value; int32_t value; }`
- [F] C-layout для `f64 | null` → с padding
- [E] `any | null` → ошибка (any уже nullable)
- [E] `||` и `??` без скобок

### Специальные типы

- [F] `void` только как return type
- [E] `let x: void` → ошибка
- [F] `never` → `_Noreturn` в C
- [E] функция `never` с достижимым return → ошибка
- [E] `let x: never` → ошибка
- [F] `any` → `void*` в C
- [E] передача `any` между функциями → ошибка

### Type aliases

- [R] `type UserId = i32` — структурный alias, взаимозаменяем
- [R] `type Point = { x: f64; y: f64 }` — struct
- [R] объектный литерал совместим с type alias
- [R] два type alias с одинаковыми полями — совместимы
- [E] метод в `type` → ошибка (только `interface` имеет методы)

### Enum — числовой

- [R] enum с автоинкрементом (0, 1, 2, ...)
- [R] enum с явными значениями
- [F] C-output: `typedef enum` + `values[]` + `names[]`
- [R] `Direction.values()` → массив всех значений
- [R] `Direction.fromValue(2)` → значение или null
- [R] `Direction.North.toString()` → строка
- [R] switch по enum — все случаи покрыты (no warning)
- [R] switch по enum — не все случаи → warning

### Enum — строковый

- [R] строковый enum
- [F] C-output: `typedef enum` + `strings[]`
- [R] `Status.Ok.toString()` → "OK"

### const enum

- [R] const enum — только значения, нет таблиц
- [F] C-output: только `typedef enum`, без таблиц
- [E] `Pin.values()` на const enum → ошибка
- [E] `Pin.fromValue()` на const enum → ошибка
- [E] `Pin.PA0.toString()` на const enum → ошибка

### Generics (базовые, без ownership)

- [F] `function identity<T>(x: T): T` → монорфизация для i32, string
- [F] `class Box<T>` → C-output для `Box<i32>`, `Box<User>`
- [R] generic function с bound `<T implements { id: i32 }>`
- [R] явный generic вызов `foo<i32>(42)` vs implicit
- [E] ambiguous overload для generic vs non-generic

### usize

- [R] `const n: usize = 42`
- [F] C-output → `size_t`
- [R] usize → i64 (неявно)
- [E] usize → i32 без `as` → ошибка

### String Literal Union

- [R] `type Dir = "north" | "south" | "east" | "west"` — объявление
- [F] C-output: `typedef enum { Dir_north, Dir_south, ... } Dir` + `Dir_values[]` в rodata
- [R] присвоение валидного значения: `let d: Dir = "north"` → ok
- [E] присвоение невалидного значения: `d = "up"` → ошибка компилятора
- [R] явная конверсия `.toString()` → строка из rodata
- [R] явная конверсия `as string` → идентично `.toString()`
- [E] неявная конверсия в string (без `.toString()` / `as string`) → ошибка
- [E] `Dir | i32` — runtime union разных типов → ошибка
- [R] string literal union как generic параметр: `Pick<T, "name" | "email">`
- [R] string literal union как тип параметра функции: `function move(dir: Dir): void`
- [F] switch по Dir → exhaustive, все варианты как C enum cases

### Tuples

#### Базовые

- [F] `let pair: [i32, string] = [1, "hello"]` → `typedef struct { int32_t _0; String _1; } tuple_i32_string`
- [R] индексация `pair[0]` → i32, `pair[1]` → string
- [R] деструктуризация `const [a, b] = pair` → a: i32, b: string
- [R] деструктуризация с пропуском `const [x, , z] = triple`
- [F] C-output: именованная инициализация `{ ._0 = 1, ._1 = ... }`

#### Labeled

- [F] `type Point = [x: f64, y: f64]` → struct с полями `_0`, `_1`
- [R] `p[0]` и `p.x` → одинаковый C-код (`p._0`)
- [E] partial labels `[x: f64, f64]` → ошибка
- [E] reserved label `[length: i32]` → ошибка
- [R] ошибка создания с labels: `missing element 'port' at index 1`

#### Readonly

- [R] `let t: readonly [i32, string]` — создание
- [E] `t[0] = 5` → ошибка: cannot assign to readonly tuple element
- [F] C-output: `const` поля в struct

#### Optional

- [R] `type Config = [string, i32?]` — второй элемент optional
- [R] `let a: Config = ["localhost"]` → ok, `a[1]` → `null`
- [R] `let b: Config = ["localhost", 8080]` → ok
- [E] `[i32?, string]` → ошибка: optional not at end
- [F] C-output: `opt_i32` поле

#### Rest

- [R] `type Strings = [string, ...string[]]` — объявление
- [R] создание с разным количеством элементов — ok
- [F] C-output: struct с `pointer + tail_len`, не growable array
- [R] spread runtime-массива в rest-tuple → ok, `items.length = tail_len`
- [E] spread runtime-массива в фиксированный tuple → ошибка компилятора
- [E] два rest элемента `[...A[], ...B[]]` → ошибка
- [E] optional + rest `[A, B?, ...C[]]` → ошибка
- [E] rest не в конце `[...A[], B]` → ошибка

#### Spread

- [R] `const copy: [f64, f64, f64] = [...p]` — копирование tuple
- [R] `const triple: [f64, f64, f64] = [...pair, 3.0]` — spread фиксированного tuple

#### Ownership

- [R] `const [user, name] = t` — move, t невалиден после
- [R] `function f(t: Ref<[User, string]>): void` — деструктуризация Ref даёт Ref<User>, Ref<string>

### Utility Types

#### Базовые

- [F] `type PartialUser = Partial<User>` → struct с `opt_*` полями в C
- [F] `type RequiredUser = Required<PartialUser>` → struct без `opt_*`
- [F] `type ReadonlyUser = Readonly<User>` → struct с `const` полями
- [F] `type NN = NonNullable<string | null>` → `string`

#### Pick / Omit

- [F] `type UserName = Pick<User, "name">` → struct с одним полем
- [F] `type UserContact = Pick<User, "name" | "email">` → struct с двумя полями
- [E] `Pick<User, "missing">` — несуществующее поле → ошибка компилятора
- [F] `type UserPublic = Omit<User, "passwordHash">` → struct без поля
- [F] `type Minimal = Omit<User, "age" | "email">` → struct с оставшимися полями
- [E] `Omit<User, "missing">` → ошибка компилятора

#### Record

- [F] `type Coords = Record<"x" | "y", f64>` → `typedef struct { double x; double y; } Coords`
- [F] `type P3 = Record<Axis, f64>` (Axis — enum) → struct по всем вариантам enum
- [F] `type SM = Record<string, i32>` → `Map<string, i32>` (runtime)
- [E] `Record<i32, string>` — нелитеральный numeric ключ → ошибка

#### ReturnType / Parameters / Awaited

- [F] `type R = ReturnType<typeof foo>` → тип return value функции
- [F] `type P = Parameters<typeof foo>` → tuple типов параметров
- [F] `type U = Awaited<Promise<User>>` → `User`
- [F] `type B = Awaited<Promise<Promise<i32>>>` → `i32` (recursive unwrap)
- [E] `ReturnType<i32>` — не function type → ошибка

#### keyof

- [F] `keyof User` внутри type alias → string literal union ключей
- [E] `keyof User` в runtime-выражении → ошибка

#### Generic functions — правило А+Б

- [F] `function log<T>(obj: Pick<T, "name">): void` — utility type в параметре → ok
- [F] `function merge<T>(base: T, patch: Partial<T>): T` — Partial в параметре → ok
- [E] `function pick<T, K extends keyof T>(obj: T, key: K): Pick<T, K>` — Pick с runtime-key в return type → ошибка

#### Неподдерживаемые

- [E] `Extract<T, U>` → ошибка: conditional types не поддерживаются
- [E] `Exclude<T, U>` → ошибка: conditional types не поддерживаются

#### Object.fromEntries\<T\>

- [F] `Object.fromEntries<{ a: i32; b: i32 }>([["a",1],["b",2]])` — literal keys совпадают → ok
- [E] `Object.fromEntries<{ a: i32; c: i32 }>([["a",1],["b",2]])` — нет ключа "c" → compile error
- [F] `Object.fromEntries<T>(entries)` с runtime-ключами → компилируется, но runtime panic при несовпадении
- [F] аналог `Object.entries` → `fromEntries<T>` → идентичный объект

#### Строковые методы

- [F] `s.lastIndexOf("l")` → байтовое смещение последнего вхождения
- [F] `s.at(-1)` → последний байт; `s.at(0)` → первый байт
- [F] `s.at(100)` при `len = 5` → null (out of range)
- [F] `s.search(/\d+/)` → смещение первого совпадения (с `import { ... } from "std/string"`)
- [F] `s.match(/(\w+)/)` → string[] с группами первого совпадения | null
- [F] `s.matchAll(/(\d+)/g)` → `string[][]` — все совпадения сразу, не итератор
- [F] `s.replaceAll(/l+/g, "r")` → замена всех regex-совпадений
- [E] `s.search(/...)` без импорта `std/string` → ошибка компилятора

#### Number.toFixed / toPrecision

- [F] `(3.14159 as f64).toFixed(2)` → `"3.14"`
- [F] `(3.14159 as f64).toPrecision(4)` → `"3.142"`
- [E] `(42 as i32).toFixed(2)` → ошибка: только f32/f64
- [E] `pi.toFixed(n)` где `n` — переменная → ошибка: только compile-time literal

---

## Phase 3 — Модель памяти

### Строки

- [R] строковый литерал
- [F] C-layout: `{ const char* data, length, capacity }`, capacity=0 для литералов
- [R] template literal: `` `hello ${name}` ``
- [R] template literal с несколькими выражениями
- [R] конкатенация `+` двух строк
- [R] конкатенация строки и числа: `"age: " + 30`
- [R] `.length` — количество байт
- [R] `s[i]` → u8 (байт)
- [R] `s[a..b]` → Ref<string> (байтовый срез)
- [R] `s[a..]` — до конца
- [R] `s[..b]` — с начала
- [R] `s[..]` — вся строка
- [R] `s[-1]` — последний байт
- [R] символьный литерал `'A'` → u8 = 65
- [R] символьный литерал `'\n'` → u8 = 10
- [E] `'п'` (мультибайт) → ошибка
- [R] for...of по строке → итерация по графемным кластерам
- [R] `s.bytes` → `Slice<u8>`

### Встроенные методы строк

- [R] `s.indexOf(sub)` — найдено
- [R] `s.indexOf(sub)` — не найдено → -1
- [R] `s.includes(sub)` — true / false
- [R] `s.startsWith(sub)`
- [R] `s.endsWith(sub)`
- [R] `s.slice(start, end)`
- [R] `s.slice(start)` — до конца
- [R] `s.substring(start, end)`
- [R] `s.toUpperCase()` — ASCII
- [R] `s.toLowerCase()` — ASCII
- [R] `s.trim()`
- [R] `s.trimStart()`
- [R] `s.trimEnd()`
- [R] `s.split(sep)` → string[]
- [R] `s.replace(search, replacement)` — первое вхождение
- [R] `s.replaceAll(search, replacement)`
- [R] `s.padStart(n, fill)`
- [R] `s.padEnd(n, fill)`
- [R] `s.repeat(n)`
- [R] `s.charAt(i)` → string (срез одного байта)
- [R] `s.charCodeAt(i)` → u8
- [R] `s.toString()` → сама строка

### Конвертация типов

- [R] `i32.parse("42")` → 42
- [E] `i32.parse("abc")` → throws ParseError
- [R] `i32.tryParse("42")` → 42
- [R] `i32.tryParse("abc")` → null
- [R] `f64.parse("3.14")`
- [R] `f64.tryParse("3.14")`
- [R] `(42).toString()` → "42"
- [R] `(3.14).toString()` → "3.14"
- [R] `parseFloat("3.14")` → 3.14
- [R] `parseFloat("abc")` → null
- [R] `parseInt("3.14")` → 3
- [R] `parseInt("abc")` → null
- [R] `Number("3.14")` → 3.14
- [R] `String(42)` → "42"
- [E] `42 as string` → ошибка компилятора

### Массивы — создание

- [R] литерал `[1, 2, 3]`
- [R] пустой `let a: i32[] = []`
- [F] фиксированный `i32[3]` → на стеке
- [E] фиксированный с неверным числом элементов → ошибка
- [R] `new Array<i32>(100)` — capacity=100, length=0
- [R] `new Array(100)` с аннотацией типа

### Массивы — свойства

- [R] `arr.length`
- [R] `arr.capacity`
- [E] `arr.length = 10` → ошибка с подсказкой `resize`
- [E] `arr.capacity = 10` → ошибка с подсказкой `reallocate`

### Массивы — мутирующие методы

- [R] `arr.push(item)` — добавить в конец
- [R] `arr.pop()` — удалить и вернуть последний
- [R] `arr.pop()` на пустом → null
- [R] `arr.remove(i)` — удалить по индексу с возвратом
- [R] `arr.fill(value)` — заполнить всё
- [R] `arr.fill(value, start, end)` — диапазон
- [E] `arr.fill(value, 0, length+1)` → ошибка (out of bounds)
- [R] `arr.resize(n)` — уменьшить
- [R] `arr.resize(n, value)` — увеличить
- [E] `arr.resize(n)` где n > length → ошибка с подсказкой
- [R] `arr.reallocate(n)` — изменить capacity
- [R] `arr.reallocate(n)` где n < length — обрезает length
- [R] `arr.sort()` — по умолчанию
- [R] `arr.sort((a, b) => a - b)` — с компаратором
- [R] `arr.reverse()`
- [R] чейнинг: `arr.resize(50, 0).fill(7, 0, 10)`

### Массивы — функциональные методы

- [R] `arr.map(f)` → новый массив
- [R] `arr.filter(f)` → новый массив (клоны)
- [R] `arr.reduce(f, init)` → аккумулятор
- [R] `arr.find(f)` → Ref<T> или null
- [R] `arr.findIndex(f)` → индекс или -1
- [R] `arr.some(f)` → bool
- [R] `arr.every(f)` → bool
- [R] `arr.includes(item)` → bool
- [R] `arr.indexOf(item)` → индекс или -1
- [R] `arr.slice(start, end)` → новый массив (клоны)
- [R] `arr.slice()` — полный клон
- [R] `arr.concat(other)` → объединённый массив
- [E] `arr.filter(f)` когда T не implements Clone → ошибка

### Массивы — индексация

- [R] `arr[i]` чтение
- [R] `arr[i]` запись
- [R] `arr[-1]` — последний элемент
- [R] `arr[a..b]` — borrow-срез
- [R] `arr[a..]`, `arr[..b]`, `arr[..]`
- [E] `arr[i]` out of bounds → runtime panic

### Slice<T>

- [R] `arr.view(2, 6)` — zero-copy
- [R] `slice[i]` — элемент
- [R] `slice.length`
- [R] `slice.view(1, 3)` — под-слайс
- [R] `MutSlice<u8>` — запись в элемент
- [F] C-output: `{ T* ptr; size_t length; }`

### Ownership — Owner (T)

- [R] move при присвоении: `let b = a` — a недоступен
- [R] move при передаче в функцию — аргумент недоступен после вызова
- [E] использование после move → ошибка
- [R] move поля через аннотацию типа: `const s: string = user.name`
- [E] использование user после move поля

### Ownership — Ref<T>

- [R] `function f(x: Ref<User>)` — auto borrow на callsite
- [R] `const data = [1,2,3]; sum(data)` — data жива после вызова
- [E] `Ref<T>` в поле класса → ошибка
- [R] Ref в замыкании — разрешено (замыкание стековое)
- [R] auto borrow при передаче let T → Ref<T>
- [R] auto borrow при передаче const T → Ref<T>

### Ownership — Mut<T>

- [R] `function f(x: Mut<i32[]>)` — auto mut borrow из let
- [E] auto mut borrow из const → ошибка
- [E] два Mut одновременно → ошибка
- [E] Mut + Ref одновременно → ошибка
- [R] несколько Ref одновременно — ok
- [R] Mut → Ref (понижение)

### Borrow Checker — правила

- [E] move из const → ошибка
- [E] move из Ref → ошибка
- [E] move из Mut → ошибка
- [E] Mut<T> из Shared<T> → ошибка
- [E] Ref<T> нельзя вернуть если переживёт owner → ошибка
- [E] Ref не может пережить `await` → ошибка (Phase 7)
- [E] Ref в глобальной переменной → ошибка

### Shared<T> / Weak<T>

- [R] `let x: Shared<Node> = new Node()` — ARC
- [R] `x.next = y` — retain (refcount++)
- [R] `Weak<T>` в поле — не увеличивает refcount
- [R] обращение к Weak → `T | null` (может быть освобождён)
- [E] `Shared<T>` на `allocator: "none"` / `allocator: "static"` → ошибка (ARC требует malloc/free)

### goto cleanup pattern

- [F] функция с двумя owned переменными → `NULL`-инициализация, `cleanup:` метка
- [F] `?` propagation → `goto cleanup`
- [F] loop-local owned переменная → inline free перед goto
- [F] вложенные scopes → scope-local inline free

### Деструктуризация

- [R] `const { name, age } = user` — borrow (name: Ref<string>)
- [R] деструктуризация с аннотацией типа → move
- [R] переименование: `const { name: n } = user`
- [E] переименование в зарезервированное имя типа → ошибка
- [R] `const [first, ...rest] = arr`
- [R] деструктуризация с дефолтами (только в Phase 2+)

### Spread

- [R] spread массива примитивов из const — ok (copy)
- [E] spread массива сложных типов из const → ошибка
- [R] spread массива сложных типов из let — ok (move)
- [E] использование источника после spread → ошибка
- [R] `Shared<T>` spread из const — ok (retain)
- [E] spread объекта из const → ошибка
- [R] spread объекта из let → ok

### for-of

- [R] for-of по i32[] с `const item` → Ref<i32> (copy для примитивов)
- [R] for-of по i32[] с `let item`
- [E] `for (let item of constArr)` для сложных типов → ошибка
- [E] переприсвоение `item` в цикле → ошибка
- [R] for-of по User[] — item: Ref<User>
- [R] `for (let item of letArr)` — item: Mut<User>
- [E] мутация массива во время for-of → ошибка (arr заимствован)
- [R] break/continue в for-of

### Iterable<T>

- [F] пользовательский класс implements Iterable<T>
- [R] for-of по пользовательскому итерируемому типу
- [F] C-output: замыкание-итератор → struct на стеке

### Clone

- [R] `s.clone()` для строки — owned копия
- [R] `arr.clone()` для массива примитивов
- [F] класс с методом `clone()` — C-output

### Move из массива

- [E] `let x = arr[0]` попытка move без remove → ошибка
- [R] `arr.remove(0)` — move с удалением

### Map<K, V>

- [R] `const m = new Map<string, i32>()` — создание
- [R] `const m = new Map<string, User>()` — owned значения
- [R] `m.set("key", 42)` — вставка
- [R] `m.get("key")` → значение или null
- [R] `m.has("key")` → bool (true / false)
- [R] `m.delete("key")` → возвращает удалённое значение или null
- [R] `m.size` — количество элементов
- [R] `m.clear()` — удалить всё
- [R] `m.keys()` → string[] (для итерации)
- [R] `m.values()` → copies/borrows
- [R] `m.entries()` → пары [key, value]
- [R] for-of по `m.entries()`
- [R] перезапись существующего ключа — старое значение дропается
- [R] `m.get` на несуществующий ключ → null
- [R] enum как ключ: `Map<Direction, string>`
- [R] i32 как ключ: `Map<i32, string>`
- [E] класс как ключ: `Map<User, string>` → ошибка
- [E] `new Map<u8, i32>()` без capacity на `allocator: "static"` → ошибка
- [R] `@static const m = new Map<u8, i32>(32)` на `allocator: "static"` → BSS
- [R] вставка сверх capacity → runtime panic
- [E] `Map` на `allocator: "none"` → ошибка
- [F] C-output: open-addressing hash map struct (heap)
- [F] C-output: static open-addressing hash map в BSS

### Set<T>

- [R] `const s = new Set<string>()` — создание
- [R] `s.add("foo")` — добавить элемент
- [R] `s.has("foo")` → bool
- [R] `s.delete("foo")` → bool (был ли элемент)
- [R] `s.size` — количество элементов
- [R] `s.clear()` — очистить
- [R] for-of по Set (порядок вставки)
- [R] `s.forEach(v => ...)` — итерация
- [R] `for (const v of s.values())` — итератор значений
- [R] `for (const v of s.keys())` — синоним values(), для совместимости
- [R] `for (const [v, v2] of s.entries())` — пары [value, value]
- [R] `s.union(other)` → новый Set
- [R] `s.intersection(other)` → только общие элементы
- [R] `s.difference(other)` → элементы s которых нет в other
- [R] `s.symmetricDifference(other)` → элементы только в одном
- [R] `s.isSubsetOf(other)`, `s.isSupersetOf(other)`, `s.isDisjointFrom(other)` → boolean
- [R] дублирование: повторный `add` не увеличивает size
- [R] `Set<i32>` — примитивный тип
- [E] `new Set<u8>()` без capacity на `allocator: "static"` → ошибка
- [R] `@static const s = new Set<u8>(16)` на `allocator: "static"` → BSS
- [R] вставка сверх capacity → runtime panic
- [E] `Set` на `allocator: "none"` → ошибка

### Date

- [R] `new Date()` — текущее время
- [R] `new Date(timestamp)` — из timestamp (i64 мс)
- [R] `Date.now()` → i64 (мс с epoch)
- [R] `d.getFullYear()` → i32
- [R] `d.getMonth()` → 0..11 (0-indexed!)
- [R] `d.getDate()` → 1..31
- [R] `d.getHours()`, `d.getMinutes()`, `d.getSeconds()`, `d.getMilliseconds()`
- [R] `d.getTime()` → i64
- [R] `d.toString()` → строка
- [R] `d.getDay()` → 0..6 (0 = воскресенье)
- [F] C-output: struct + unix timestamp

### @static let — borrow checker

- [R] `@static let s = new Sensor()` — объект в BSS, lifetime static
- [R] два `Mut<T>` к одному `@static let` объекту — разрешено (dangling pointer невозможен)
- [R] `@static let` внутри async функции — разрешено
- [E] `@static let` + `Thread.spawn` без `Atomic<T>` → ошибка: требуется `Atomic<T>` при std/threads

---

## Phase 4 — Объектная модель

### Классы — базовые

- [F] класс с полями, без методов → C-output struct
- [R] `new ClassName(...)` — создание
- [R] доступ к полю `obj.field`
- [R] автогенерация конструктора из полей
- [R] явный конструктор
- [E] явный конструктор, поле не инициализировано на всех путях → ошибка

### Классы — модификаторы полей

- [R] `private` поле — не доступно снаружи
- [E] доступ к `private` полю снаружи → ошибка
- [R] `readonly` поле — можно задать только в конструкторе
- [E] запись в `readonly` поле вне конструктора → ошибка

### Классы — методы

- [R] обычный метод (this: Ref<Self>) — не меняет поля
- [R] `mut` метод (this: Mut<Self>) — меняет поля
- [R] `move` метод (this: Self owned) — consumиет объект
- [R] `static` метод — нет this
- [E] `static` + `mut` → ошибка
- [E] вызов `mut` метода на const → ошибка
- [E] вызов `move` метода на const → ошибка

### Классы — this и поля

- [R] обычный метод: `this.field` (сложный) → Ref<T>
- [R] mut метод: `this.field` → Mut<T>
- [R] move метод: `this.field` → T (owned, можно передать)
- [R] вызов `this.method()` внутри метода

### Наследование только от Error

- [F] `class MyError extends Error` — C-output (base как первое поле)
- [R] `super(msg)` в конструкторе наследника → message установлен
- [R] наследник с доп. полями: `class NetworkError extends Error { code: i32 }`
- [R] `super(msg)` + инициализация доп. полей
- [E] `class Dog extends Animal` (не Error) → ошибка
- [E] `class TimeoutError extends NetworkError` (цепочка от non-Error) → ошибка

### Interfaces с методами

- [F] interface с методами → vtable (fat pointer)
- [R] `class Circle implements Drawable` — реализует все методы
- [E] класс не реализует все методы интерфейса → ошибка
- [R] `let shape: Drawable = new Circle()` — fat pointer
- [R] `shape.draw()` через vtable
- [R] `shape.resize(2.0)` через vtable (mut метод)
- [E] вызов `mut` метода на `const shape` → ошибка
- [R] `class Foo implements A, B` — реализует два интерфейса
- [E] метод не реализован для одного из двух интерфейсов → ошибка
- [F] C-output: класс с двумя vtable-полями

### instanceof

- [R] `shape instanceof Circle` → true
- [R] `shape instanceof Rect` → false
- [R] narrowing внутри if (shape instanceof Circle) → тип сужается
- [E] `instanceof` для не-interface переменной → ошибка

### Generics — апгрейд до ownership

- [R] `first<T>(arr: Ref<T[]>): Ref<T>` — borrow элемента
- [R] `pop<T>(arr: Mut<T[]>): T` — move
- [E] инстанциация с owned T где ожидается copy → ошибка на callsite

### Замыкания

- [R] захват примитива по копии
- [R] захват строки по Ref (auto)
- [R] явный список захвата `[data: Data]` — move
- [R] явный список захвата `[data: Ref<Data>]` — borrow
- [R] явный список захвата `[data: Mut<Data>]` — mutable borrow
- [F] C-output: struct с captures + function pointer
- [E] использование источника после move-захвата → ошибка

### Перегрузка функций

- [R] перегрузка по типам: `process(i32)`, `process(string)`
- [R] перегрузка по количеству: `foo(i32)`, `foo(i32, i32)`
- [R] dispatch на callsite
- [F] C-output: mangled names (`foo_i32`, `foo_i32_i32`)
- [E] `extern "C"` перегрузка → ошибка
- [E] ambiguous overload при дефолтных параметрах → ошибка
- [R] explicit generic вызов `foo<i32>(42)` выбирает generic overload

### Name mangling (все случаи из EBNF)

- [F] функция без параметров
- [F] функция с параметрами примитивов
- [F] функция с `Ref<User>` параметром → `ref_User`
- [F] функция с `Mut<i32[]>` → `mut_arr_i32`
- [F] функция с `Shared<Node>` → `arc_Node`
- [F] функция с `i32 | null` → `opt_i32`
- [F] функция с `Map<string, User[]>` → `Map2_string_arr_User`
- [F] метод класса → `ClassName_methodName`
- [F] module slug для библиотеки
- [F] `--short-symbols` для executable

### Extension Methods

- [R] extension function для string — доступна после импорта
- [E] extension function для string — недоступна без импорта
- [E] extension конфликтует с методом типа → ошибка
- [E] два extension с одинаковым именем в одном файле → ошибка
- [R] два extension с одинаковым именем, переименование через `as`
- [F] C-output: статический вызов, нет vtable

### match

- [R] match по литералам: 0, 1..10, _
- [R] match возвращает значение
- [R] match по null
- [R] match по enum — exhaustive (нет `_`)
- [E] match по enum — не все случаи → ошибка
- [R] match по interface (fat pointer) + `_` обязателен
- [R] match по type с дискриминатором `{ kind: "circle" }`
- [R] несколько паттернов: `1 | 2 | 3`
- [R] диапазон `1..10`
- [R] деструктуризация в паттерне: `Circle { r }` — move
- [R] borrow в паттерне: `Circle { r: Ref<T> }`
- [E] матч без `_` для interface-переменной → ошибка

---

## Phase 5 — Обработка ошибок

### throws

- [F] функция с `throws IOError` → Result-struct в C
- [F] функция с `throws IOError | NetworkError` → Result с union + _kind
- [E] `throw` в функции без `throws` → ошибка
- [E] `throw "string"` → ошибка (не Error)
- [E] `throw 42` → ошибка (не Error)
- [R] `throw new IOError("message")`
- [R] компилятор выводит `throws` автоматически

### try / catch / finally

- [R] try/catch — ошибка поймана
- [R] try/catch — ошибка не брошена (catch не выполняется)
- [R] try/finally — finally всегда выполняется (успех)
- [R] try/finally — finally всегда выполняется (ошибка)
- [R] несколько catch-блоков — dispatch по типу
- [R] union catch: `catch (e: IOError | NetworkError)`
- [R] match внутри union catch (exhaustive)
- [R] instanceof внутри union catch
- [E] `throw` внутри `finally` → ошибка
- [E] `return` внутри `finally` → ошибка

### Оператор ?

- [R] `readFile(path)?` — propagate IOError
- [R] цепочка двух `?` — union errors объединяются
- [E] `?` в функции без `throws` → ошибка

### Оператор !

- [R] `readFile(path)!` — panic если ошибка
- [R] `readFile(path)!` — не panic если успех
- [R] `!` в функции без `throws` — разрешено

### Ownership при ошибках

- [F] owned переменные до `?` освобождаются корректно при ошибке
- [F] goto cleanup генерируется с NULL-инициализацией

### Ограничения

- [E] `throw` внутри `@interrupt` обработчика → ошибка

### error.stack

- [F] `e.stack` на desktop → строка `"ErrorType at file.tsc:42"`
- [E] `e.stack` на embedded → ошибка компилятора: недоступно на embedded

---

## Phase 6 — Модульная система

### export

- [R] `export function f()` — используется в другом файле
- [R] `export class Foo` — используется в другом файле
- [R] `export const MAX = 100` — используется
- [R] `export type UserId = i32`
- [R] реэкспорт: `export { Foo } from "./foo"`
- [E] `export default class Foo` → ошибка

### import

- [R] именованный: `import { Foo, bar } from "./foo"`
- [R] namespace: `import Foo from "./foo"` → `Foo.method()`
- [R] `import type { UserId }` — только compile-time
- [E] `import X from "./module"` — X не существует → ошибка

### Порядок инициализации

- [F] топологическая сортировка: A зависит от B → B инициализируется первым
- [E] циклическая зависимость через module-level переменные → ошибка

### Module-level переменные

- [F] `const MAX: i32 = 100` → `static const int32_t`
- [F] `let count: i32 = 0` → `static int32_t`
- [F] `const obj = new Foo()` → инициализация в `_init()`

### Path aliases

- [R] `#/utils` → `./src/utils`
- [R] `~/components` → `./src/components`

### Entry point

- [R] top-level код → тело `main()` в C
- [R] `async` top-level → event loop
- [E] `"main"` не указан в tsc.package.json → ошибка
- [E] `"main"` указан, файл не существует → ошибка

### Globals — process (desktop only)

- [R] `process.exit(0)` — завершает программу с кодом 0
- [R] `process.exit(1)` — код выхода пробрасывается
- [R] `process.argv` — содержит аргументы командной строки
- [R] `process.env` — читает переменную окружения
- [E] `process.exit` на embedded → ошибка компилятора

### .d.tsc — C interop

- [F] `declare function` → extern declaration в C
- [F] `declare opaque type` с destructor → auto cleanup
- [F] `declare const SQLITE_OK: i32 = 0` → константа
- [F] `declare link` → инструкции для CMakeLists
- [E] `.d.tsc` с телом функции → ошибка

### native

- [R] `native "PORTB |= (1 << 5);"` — вставка C verbatim
- [R] `native` с интерполяцией TSClang-переменной
- [E] `native` expression без аннотации типа → ошибка

### unsafe

- [R] `unsafe {}` блок — borrow checker отключён
- [F] предупреждение компилятора на unsafe блок

### @platform

- [R] `@platform("avr")` функция — компилируется только под avr
- [R] два `@platform` для одной функции — правильная диспетчеризация

### Циклические импорты

- [R] цикл через типы — forward declarations в .h, ok
- [E] цикл через module-level переменные → ошибка

### Scalar (variadic C)

- [R] `printf("%d", 42)` через `std/libc`
- [E] `printf("%d", user)` — User не Scalar → ошибка
- [E] `const x: Scalar = 42` — Scalar как тип переменной → ошибка

### FnPtr<T>

- [F] `FnPtr<T>` без captures — чистый function pointer в C
- [E] `FnPtr<T>` с capturing closure → ошибка

---

## Phase 7 — Async/Await

### async функции

- [R] `async function f(): Promise<i32>`
- [R] `async` стрелочная функция
- [R] `await` простого Promise
- [E] `await` вне async функции → ошибка
- [E] `await` на не-Promise значении → ошибка

### State machine

- [F] `async function` → state machine struct в C
- [F] поле `_state` (u8 для AVR, i32 для desktop)
- [F] переменная не живёт через await → не попадает в struct
- [F] переменная живёт через await → попадает в struct
- [E] более 253 await на AVR → ошибка

### Borrows через await — запрещено

- [E] `Ref<T>` через await → ошибка с подсказкой clone
- [R] owned значение через await — ok

### Promise<T>

- [R] `new Promise((resolve, reject) => ...)` — ручное создание
- [R] `resolve(value)` — успех
- [R] `reject(error)` — ошибка

### Promise.then / catch / finally

- [R] `.then(fn)` — трансформация результата
- [R] `.catch(fn)` — fallback при ошибке
- [R] `.finally(fn)` — всегда выполняется
- [E] `await` внутри `.finally` → ошибка

### Promise.all

- [R] все успешны → кортеж результатов
- [R] одна ошибка → throws
- [R] throws-union: разные типы ошибок объединяются

### Promise.any

- [R] первая успешная → результат
- [R] все упали → ошибка последней

### Promise.race

- [R] первая завершившаяся побеждает (успех)
- [R] первая завершившаяся побеждает (ошибка)

### Promise.allSettled

- [R] все результаты включая ошибки
- [R] никогда не throws

### Globals — таймеры

- [R] `setTimeout(callback, ms)` — выполняется после задержки
- [R] `clearTimeout(id)` — отменяет таймер до срабатывания
- [R] `setInterval(callback, ms)` — повторяется несколько раз
- [R] `clearInterval(id)` — останавливает интервал
- [R] `await sleep(ms)` — пауза внутри async
- [E] `await sleep(ms)` вне async → ошибка
- [E] `setTimeout` на embedded → ошибка компилятора

### Правила await

- [R] await в цикле for-of — последовательно
- [R] await в while — последовательно
- [R] параллельно через Promise.all

### async main / event loop

- [R] `async function main()` → event loop на desktop (`scheduler: "libuv"`)
- [F] C-output desktop: `tsc_event_loop_run(tsc_main)`
- [R] `async function main()` + `scheduler: "cooperative"` → poll loop на embedded
- [F] C-output embedded: round-robin `tsc_scheduler_tick()` в `while(1)`
- [R] `@static async function task()` → state machine в BSS (embedded)
- [F] C-output: `static _TaskState _task_instance` без `malloc`
- [E] `async function` без `@static` на `allocator: "static"` → ошибка
- [R] несколько `@static async` задач — кооперативное переключение через `await`
- [E] `scheduler: "none"` + `await` без ручного `resume()` → предупреждение

### Рекурсивные async

- [R] рекурсивная async — предупреждение + heap allocation (desktop)
- [E] рекурсивная async на `allocator: "static"` / `"none"` → ошибка

### AbortSignal

- [R] `AbortController.abort()` — флаг устанавливается
- [R] `AbortSignal.timeout(ms)` — хелпер
- [R] функция с `signal?: AbortSignal` — авто-проверки в state machine
- [R] `AbortError` не в throws-сигнатуре
- [R] `signal.onAbort(callback)` — cleanup при отмене
- [E] `await` внутри onAbort callback → ошибка

### Async generators

- [R] `async function*` — возвращает AsyncIterator
- [R] `for await (const x of generator)` — итерация
- [R] `yield` несколько значений последовательно
- [R] `return` завершает генератор досрочно
- [R] `throw` внутри генератора — ошибка видна в `for await`
- [R] генератор с owned значениями (move через yield)
- [E] `async function*` без `@static` на `allocator: "static"` → ошибка
- [R] `@static async function*` на `allocator: "static"` → state machine в BSS
- [R] синхронный `function*` — всегда стек, работает на любой платформе

### @embedded.singleton

- [R] `@embedded.singleton class Led` — эквивалент `@static function*`, единственный экземпляр
- [F] C-output: `static Led _led_instance` в BSS, нет malloc
- [E] `new Led()` на классе с `@embedded.singleton` → ошибка: используй `Led.instance()`
- [R] `Led.instance()` → возвращает `Mut<Led>`

### @embedded.stack

- [R] `@embedded.stack("fib", 16) async function fib(n: i32)` — стек из 16 state machine frames в BSS
- [F] C-output: `static FibState _fib_stack[16]` + index
- [E] `@embedded.stack` без `async` → ошибка: только для async функций
- [E] рекурсия глубже N → runtime panic (stack overflow)
- [R] `@embedded.stack` + `@static` — разрешено

### Кооперативная многозадачность

- [R] два `@static async function*` генератора, поочерёдный poll — корректный C
- [R] ручной планировщик: poll каждого генератора в цикле `while(true)`
- [F] C-output: два state machine struct в BSS, poll без malloc
- [R] генератор с `yield` возвращает управление планировщику
- [R] генератор завершён (`done === true`) — планировщик его пропускает

### Generator.return / throw

- [R] `gen.return(val)` — завершает генератор, возвращает val как последнее значение
- [R] `gen.return(val)` — `finally`-блок выполняется до завершения
- [R] `gen.throw(new IOError("x"))` — генератор получает ошибку в точке следующего yield
- [R] генератор перехватывает `throw` через `try/catch` — продолжает работу
- [F] синхронный `Generator<T>` — те же методы без Promise

### AbortSignal.any / addEventListener

- [F] `AbortSignal.any([s1, s2])` — срабатывает при первом отменённом из двух
- [F] `AbortSignal.any([timeout, userCancel])` — combined signal, передаётся в fetch
- [R] `signal.addEventListener("abort", cb)` — JS-совместимый синтаксис, аналог `onAbort`
- [E] `signal.addEventListener("load", cb)` → ошибка компилятора: только "abort"

---

## Phase 8 — Threads и низкоуровневая конкурентность

### Thread.spawn

- [R] простой spawn с owned T
- [R] spawn с примитивом (copy)
- [E] spawn захватывает Ref<T> → ошибка
- [E] spawn захватывает Mut<T> → ошибка
- [E] spawn захватывает Shared<T> → ошибка
- [E] spawn захватывает mutable let → ошибка
- [E] `await` внутри spawn callback → ошибка
- [E] owned тип с полем Shared<U> → ошибка рекурсивной проверки

### Thread<T>

- [R] `const t = Thread.spawn(() => ...)` → Thread<T>
- [R] `await t.join()` — из async-контекста
- [R] `t.join()` — из другого потока (блокирующий)
- [R] поток бросает → throws через join()

### channel<T>

- [R] `channel<i32>(128)` → [tx, rx]
- [R] `tx.send(msg)` — async-контекст (yield если полный)
- [R] `tx.send(msg)` — thread-контекст (блокирует)
- [R] `tx.trySend(msg)` → bool, не блокирует
- [R] `rx.receive()` — async
- [R] `rx.receive()` — thread
- [R] `rx.tryReceive()` → T | null
- [R] `tx.close()` + `rx.receive()` → вычитывает остаток, потом null
- [R] `tx.size`, `tx.capacity`, `tx.isFull`, `tx.isEmpty`

### select

- [R] `await select({ msg: rx1.receive(), timeout: after(500) })`
- [R] match по результату select
- [E] доступ к полю result напрямую (без match) → ошибка

### Atomic<T>

- [R] `new Atomic<i32>(0)`
- [R] `counter.load(LoadOrdering.Acquire)`
- [R] `counter.store(0, StoreOrdering.Release)`
- [R] `counter.fetchAdd(1, RmwOrdering.AcqRel)` → старое значение
- [R] `counter.fetchSub`
- [R] `counter.fetchAnd`
- [R] `counter.fetchOr`
- [R] `counter.fetchXor`
- [R] `counter.swap`
- [R] `counter.compareExchange` — success
- [R] `counter.compareExchange` — failure
- [E] неверная комбинация ordering (StoreOrdering для load) → ошибка
- [F] escape analysis: нет Thread.spawn → stack layout (без ref_count)
- [F] с Thread.spawn → heap layout (с ref_count)

### AtomicArray<T>

- [R] `new AtomicArray<i32>(1024)`
- [R] `new AtomicArray<i32>([1,2,3,4])`
- [R] `arr.load(0, LoadOrdering.Acquire)`
- [R] `arr.store(0, 42, StoreOrdering.Release)`
- [R] `arr.fetchAdd(0, 1, RmwOrdering.AcqRel)`
- [R] `arr.compareExchange(...)`
- [R] `arr.length` + bounds checking

### Readonly<T>

- [R] `new Readonly<Config>({ ... })` — создание
- [E] без `<T>` → ошибка
- [R] передача в Thread.spawn — retain/release автоматически
- [E] запись в поле Readonly → ошибка
- [E] T содержит Shared<U> → ошибка
- [E] T содержит Ref<U> → ошибка
- [R] T содержит Atomic<U> → ok
- [E] subtype с лишним полем при создании → ошибка

### @embedded.isr

- [R] `@embedded.isr("TIMER1_COMPA")` — обработчик прерывания
- [E] `throw` внутри ISR → ошибка
- [E] `await` внутри ISR → ошибка
- [E] heap allocation внутри ISR → ошибка

### Volatile<T>

- [F] `Volatile<u32>` → `volatile uint32_t*` в C
- [R] чтение Volatile
- [R] запись Volatile

### std/sync

- [R] `interrupts.disable()` — отключить прерывания
- [R] `interrupts.enable()`
- [R] критическая секция

### AsyncMutex

- [R] `await mutex.lock()` — не блокирует event loop
- [R] `mutex.unlock()`
- [R] `mutex.runExclusive(async () => ...)` — auto unlock

---

## Phase 9–11 — CLI и система сборки

### tsc.package.json — валидация

- [E] отсутствующий обязательный field `name` → ошибка
- [E] отсутствующий `main` для executable → ошибка
- [E] `version` не semver → ошибка
- [E] `type: "library"` + `main` → ошибка (библиотека не имеет entry point)
- [R] чтение `dependencies`
- [R] чтение `builds.*`
- [R] `targets` с несколькими платформами
- [E] неизвестный ключ в `builds.*` → предупреждение или ошибка

### tsclang init

- [R] создаёт `tsc.package.json` с нужными полями
- [R] создаёт `src/main.tsc` с заглушкой
- [R] `--name` флаг задаёт имя проекта
- [R] `--type library` — создаёт library-проект

### tsclang build

- [R] компилирует hello world (executable)
- [R] `--emit c` — только C-output, не вызывает gcc
- [R] `--emit binary` — C + компиляция в бинарь
- [R] `--outDir ./dist` — C-файлы в указанную директорию
- [R] одиночный файл: `tsclang build hello.tsc`
- [R] компилирует с локальными зависимостями
- [R] debug профиль — генерирует `#line` директивы
- [R] release профиль — без `#line`, с `-O2`
- [E] `--emit hex` без embedded target → ошибка
- [R] CMakeLists.txt генерируется рядом с C-файлами

### tsclang run

- [R] компилирует и запускает (desktop)
- [R] аргументы через `--`: `tsclang run -- --port 8080`
- [R] код выхода бинаря пробрасывается
- [E] `tsclang run` для library-проекта → ошибка

### tsclang install

- [R] устанавливает зависимость из npm-реестра
- [R] устанавливает из git URL
- [R] создаёт `tsc.lock`
- [R] повторный install не меняет `tsc.lock` (reproducible)
- [R] `--production` — не ставит devDependencies

### tsclang update

- [R] обновляет зависимость до latest compatible
- [R] обновляет `tsc.lock`

### tsclang dev

- [R] запускает и перезапускает при изменении файла
- [R] инкрементальная пересборка: только изменённый файл

### tsclang lint

- [R] находит синтаксическую ошибку
- [R] `--fix` исправляет автоматически исправимые ошибки

### tsclang format

- [R] форматирует файл по правилам (идемпотентно)
- [R] уже отформатированный файл не меняется

### Semver

- [R] `^1.0.0` — совместимо с minor update
- [R] `~1.0.0` — только patch update
- [R] `>=1.0.0` — любая версия не ниже
- [E] конфликт версий (flat tree: два пакета требуют несовместимые версии) → ошибка

### Platform Profile

- [R] AVR target: `mcu: "atmega328p"`, `freq: 16000000`
- [F] CMakeLists.txt для AVR использует avr-gcc

#### allocator: "static"

- [E] `new Map<u8, i32>()` без capacity на `allocator: "static"` → ошибка
- [R] `@static const m = new Map<u8, i32>(32)` → BSS, нет malloc
- [F] C-output: статическая hash-таблица в BSS
- [E] `new Array<Sprite>()` без capacity → ошибка
- [R] `@static const sprites = new Array<Sprite>(64)` → BSS
- [F] C-output: `static Sprite sprites_data[64]; static Array_Sprite sprites = {...}`
- [E] `new Shared<Node>()` → ошибка (ARC требует malloc)
- [R] класс без heap (`class Brush { size: u8; color: u8 }`) → на стеке, ok
- [R] интерфейс с vtable на стеке → ok (vtable — static const, не malloc)

#### allocator: "none"

- [E] любой `new X()` создающий heap-объект → ошибка
- [R] `let n: Node = { x: 0, y: 0 }` — value type на стеке → ok
- [R] фиксированный массив `const buf: u8[256] = [...]` → ok

#### scheduler: "cooperative"

- [R] `@static async function` → state machine в BSS, не malloc
- [F] C-output: `static _TaskState _task_instance` + poll loop в `main()`
- [R] две `@static async` задачи — кооперативное переключение через `await`
- [E] `async function` без `@static` при `allocator: "static"` → ошибка
- [E] `async function*` без `@static` при `allocator: "static"` → ошибка
- [R] `@static function*` (sync generator) → state machine на стеке, ok

#### no_recursion: true

- [E] прямая рекурсия `function f() { f() }` → ошибка
- [E] взаимная рекурсия `f() → g() → f()` → ошибка (статический анализ call graph)

#### ram_size / stack_size

- [E] суммарный BSS + stack > `ram_size` → ошибка компилятора с отчётом о превышении
- [E] worst-case stack > `stack_size` → предупреждение

### @embedded.inline

- [R] `@embedded.inline class Vec2 { x: f32; y: f32 }` — value type, нет heap
- [F] C-output: `typedef struct { float x; float y; } Vec2` — без указателя, без vtable
- [R] передача по значению: копируется целиком (как C struct)
- [R] вложенный `@embedded.inline` внутри другого — рекурсивно разворачивается
- [E] `@embedded.inline` класс с методами (кроме простых getter/setter) → ошибка
- [E] `@embedded.inline` на non-embedded платформе → предупреждение (игнорируется)

### @embedded.pool

- [R] `@embedded.pool(16) class Sprite` — статический пул из 16 слотов в BSS
- [F] C-output: `static Sprite _sprite_pool[16]` + битовая маска занятых слотов
- [R] `Sprite.alloc()` → `Sprite | null` (null если пул заполнен)
- [R] автоматическое освобождение слота при выходе из scope (ownership)
- [R] явный `drop(s)` — досрочное освобождение слота
- [F] C-output для alloc: поиск свободного слота через битовую маску
- [E] `@embedded.pool` без числового аргумента → ошибка
- [E] `@embedded.pool` на non-embedded платформе → предупреждение (игнорируется)

---

## Phase 12 — Стандартная библиотека

### std/math

- [R] `Math.PI`, `Math.E`, `Math.LN2`, `Math.LN10`, `Math.SQRT2`
- [R] `Math.abs(-5)` → 5
- [R] `Math.floor(3.7)` → 3
- [R] `Math.ceil(3.2)` → 4
- [R] `Math.round(3.5)` → 4
- [R] `Math.trunc(3.9)` → 3
- [R] `Math.sqrt(9.0)` → 3.0
- [R] `Math.pow(2.0, 10.0)` → 1024.0
- [R] `Math.log(Math.E)` → ~1.0
- [R] `Math.log2(8.0)` → 3.0
- [R] `Math.log10(1000.0)` → 3.0
- [R] `Math.sin(0.0)` → 0.0
- [R] `Math.cos(0.0)` → 1.0
- [R] `Math.tan(0.0)` → 0.0
- [R] `Math.min(3, 5)` → 3
- [R] `Math.max(3, 5)` → 5
- [R] `Math.clamp(x, min, max)`
- [R] `Math.sign(-5)` → -1
- [R] `Math.hypot(3.0, 4.0)` → 5.0
- [F] C-output: прямой вызов `<math.h>` функций

### std/string

- [R] `s.codePoints()` → итерация по Unicode codepoint (u32)
- [R] `s.graphemes()` → итерация по графемным кластерам
- [R] Regex: `new Regex("pattern")` — компиляция
- [R] `r.test(s)` → bool
- [R] `r.match(s)` → массив захватов или null
- [R] `r.replace(s, replacement)` → новая строка
- [R] `r.replaceAll(s, replacement)`
- [R] `btoa(s)` — base64 encode
- [R] `atob(s)` — base64 decode
- [R] `encodeUtf8(s)` → `u8[]`
- [R] `decodeUtf8(bytes)` → string
- [E] `decodeUtf8` с невалидными байтами → throws

### std/random

- [R] `new Random(seed)` — инициализация с seed
- [R] `r.nextI32()` — случайный i32
- [R] `r.nextF64()` → f64 в [0, 1)
- [R] `r.nextI32(min, max)` — в диапазоне
- [R] одинаковый seed → одинаковая последовательность (детерминизм)
- [R] `new SecureRandom()` — криптографически безопасный (desktop)
- [E] `SecureRandom` на embedded → ошибка
- [R] `HardwareRandom` — только embedded (hardware TRNG)

### std/temporal

- [R] `PlainDate.from(2024, 3, 15)` — создание
- [R] `d.year`, `d.month` (1-indexed!), `d.day`
- [R] `PlainTime.from(14, 30, 0)` — создание
- [R] `PlainDateTime.from(date, time)`
- [R] `Instant.now()` → текущее время с точностью нс
- [R] `Duration.from({ hours: 2, minutes: 30 })`
- [R] `d.add(duration)` → новая дата
- [R] `d1.until(d2)` → Duration
- [R] `ZonedDateTime` с часовым поясом
- [R] `Now.plainDate()`, `Now.instant()`
- [F] C-output: структуры без heap allocation

### Buffer и DataView

- [R] `new Buffer(1024)` — создание буфера фиксированного размера
- [R] чтение/запись байта: `buf[i]`, `buf[i] = x`
- [R] `buf.fill(0)` — обнуление
- [R] `buf.slice(0, 64)` → MutSlice<u8>
- [R] `buf.length`
- [R] `new DataView(buf)` — типизированный доступ
- [R] `dv.getU8(offset)`
- [R] `dv.setU8(offset, value)`
- [R] `dv.getU16LE(offset)`, `dv.getU16BE(offset)`
- [R] `dv.setU32LE(offset, value)`
- [R] `dv.getI32LE(offset)`
- [R] `dv.getF64LE(offset)`
- [E] offset out of bounds → runtime panic

### std/io

- [R] `Reader` interface: `read(buf: MutSlice<u8>): Promise<usize>`
- [R] `Writer` interface: `write(buf: Slice<u8>): Promise<usize>`
- [R] `readAll(reader)` → `u8[]`
- [R] `writeAll(writer, data)` — записывает всё
- [R] `pipe(reader, writer)` — копирует поток
- [R] `process.stdin` реализует `Reader`
- [R] `process.stdout` реализует `Writer`
- [R] `process.stderr` реализует `Writer`
- [E] `process.stdin` на embedded → ошибка

### std/fs

- [R] `fs.readFile(path)` → string throws IOError
- [R] `fs.readFileBytes(path)` → u8[]
- [R] `fs.writeFile(path, content)` throws IOError
- [R] `fs.appendFile(path, content)`
- [R] `fs.stat(path)` → FileInfo | null
- [R] `FileInfo.size`, `FileInfo.isFile`, `FileInfo.isDir`, `FileInfo.mtime`
- [R] `fs.exists(path)` → bool
- [R] `fs.mkdir(path)` — создать директорию
- [R] `fs.readDir(path)` → string[] (имена файлов)
- [R] `fs.remove(path)` — удалить файл
- [R] `fs.rename(from, to)`
- [R] `fs.watch(path, callback)` — наблюдение за изменениями
- [E] `fs` на embedded → ошибка компилятора

### std/net

- [R] `fetch(url)` → Promise<Response> throws NetworkError
- [R] `fetch(url, { method: "POST", body })` с телом
- [R] `response.ok`, `response.status`, `response.text()`, `response.json<T>()`
- [R] HTTP-сервер: `new HttpServer({ port: 8080 })`
- [R] `server.get("/path", handler)`
- [R] `server.post("/path", handler)`
- [R] `server.listen()` — запускает event loop
- [R] `Request.params`, `Request.body`, `Request.headers`
- [R] `Response.json(data)`, `Response.text(s)`, `Response.status(404)`
- [R] TCP-сокет: `net.connect(host, port)` → Socket
- [R] `socket.write(data)`, `socket.read(buf)`
- [R] `socket.close()`
- [R] TCP-сервер: `net.listen(port, callback)`
- [E] `std/net` на embedded → ошибка

### std/ws

- [R] WebSocket-клиент: `new WebSocket(url)`
- [R] `ws.onMessage(callback)`
- [R] `ws.send(data)`
- [R] `ws.close()`
- [R] WebSocket-сервер поверх std/net

### std/reactive

- [R] `const count = new Signal<i32>(0)`
- [R] `count.get()` → текущее значение
- [R] `count.set(1)` → обновляет
- [R] `effect(() => { ... })` — выполняется при изменении зависимостей
- [R] `computed(() => count.get() * 2)` → производный сигнал
- [R] batched update: несколько `set` → один `effect` вызов
- [E] побочный эффект внутри `computed` → ошибка

### std/hal (embedded)

- [R] `GPIO.output(pin)` — конфигурация
- [R] `GPIO.write(pin, value)` — запись
- [R] `GPIO.read(pin)` → bool — чтение
- [R] `UART.init({ baud: 9600 })` — инициализация
- [R] `UART.write(byte)`, `UART.read()` → u8 | null
- [R] `SPI.transfer(data)` → u8
- [R] `I2C.write(addr, data)`, `I2C.read(addr, len)`
- [E] `std/hal` на desktop без platform profile → ошибка

### std/avr

- [R] `avr.sleep(SleepMode.Idle)` — режим сна
- [R] `avr.watchdogReset()` — сброс watchdog
- [R] `ADC.read(channel)` → u16
- [R] `PWM.setDuty(channel, duty)`

### std/embedded — HashMap

- [R] `import { HashMap } from "std/embedded"`
- [R] `new HashMap<string, i32>(64)` — статический пул на 64 записи
- [F] C-output: struct-of-arrays layout (`keys[]`, `values[]`, `used[]`) — лучший packing для AVR
- [R] `.set(key, value)` — добавление/обновление
- [R] `.get(key)` → `V | null`
- [R] `.has(key)` → bool
- [R] `.delete(key)`
- [R] djb2 hash + linear probing — корректная работа при коллизиях
- [E] превышение capacity → runtime panic
- [E] `HashMap` на платформе без `std/embedded` → ошибка

### std/embedded — StaticMap

- [R] `import { StaticMap } from "std/embedded"` (или глобально встроен)
- [R] `new StaticMap({ "LDA": 0xA9, "STA": 0x8D })` — compile-time известные ключи
- [F] C-output: `switch` с perfect hash — без поиска в runtime
- [R] `.get(key)` → `V | null` — обращение через switch
- [E] ключ не строковый литерал или literal union → ошибка компилятора
- [E] динамический ключ в StaticMap → ошибка: требуется compile-time строка

### std/embedded — Tasks

- [R] `import { Tasks } from "std/embedded"`
- [R] `new Tasks<4>()` — кооперативный планировщик на 4 задачи
- [R] `tasks.add("led", ledTask)` — регистрация задачи-генератора
- [R] `tasks.run()` — запуск планировщика (бесконечный цикл poll)
- [R] `tasks.stop("led")` — остановка задачи по имени
- [F] C-output: массив из N state machine указателей в BSS, poll loop без malloc
- [R] `@static const tasks = new Tasks<4>()` — глобальный доступ из любой задачи
- [R] задача обращается к `tasks` через замыкание — корректный C
- [E] `Tasks` с `allocator: "none"` без `@static` → ошибка
- [E] добавить больше задач чем N → runtime panic

### std/url

- [R] `new URL("https://example.com/path?foo=bar")` — разбор всех компонентов
- [R] `u.protocol`, `u.host`, `u.pathname`, `u.search`, `u.hash`, `u.origin`
- [R] `u.searchParams.get("foo")` → "bar"
- [R] `u.searchParams.set("k", "v")` + `u.searchParams.toString()` — обновлённая строка
- [R] `u.searchParams.delete("foo")` + `has("foo")` → false
- [R] итерация `for (const [k, v] of u.searchParams)`
- [R] `new URL("/other", "https://example.com")` → абсолютный URL
- [R] `new URLSearchParams("a=1&b=2")` — standalone без URL
- [R] `new URL(str)` на embedded — работает (только разбор строки, no heap)
- [E] `u.searchParams.set(...)` на `allocator: "none"` → ошибка: требует аллокатор

### std/blob / std/formdata

- [F] `new Blob([buf], { type: "image/png" })` → `{ Buffer data, String type }`
- [F] `new File([buf], "photo.png", { type: "image/png" })` → blob + name
- [R] `b.size` — байт в data
- [R] `b.arrayBuffer()` → Buffer (те же байты, zero-copy)
- [R] `b.text()` → string (UTF-8 интерпретация)
- [R] `b.toString()` → string (синоним text(); работает в template literal)
- [R] `b.slice(0, 50)` → новый Blob с view на часть данных
- [R] `b.slice(0, 50, "text/plain")` → Blob с другим MIME-типом
- [F] `new FormData()` + `fd.append("name", "Alice")` — string-поле
- [F] `fd.append("data", buf)` — Buffer-поле
- [F] `fd.append("file", file)` — File-поле с именем
- [R] `fd.get("name")` → "Alice"; `fd.has("name")` → true; `fd.delete("name")`
- [R] `fd.set("name", "Bob")` — перезаписывает поле (не дублирует)
- [R] `fd.append("tag", "a"); fd.append("tag", "b"); fd.getAll("tag")` → `["a", "b"]`
- [R] итерация `for (const [name, value] of fd)`
- [R] `await req.formData()` — разбор multipart/form-data тела запроса
- [R] `await res.blob()` — Buffer + Content-Type → Blob из HTTP-ответа
- [E] `import { Blob } from "std/blob"` на embedded → ошибка компилятора

### console.time / performance.mark

- [R] `console.time("label")` + работа + `console.timeEnd("label")` → вывод в stderr
- [R] `performance.mark("start")` + `performance.mark("end")` + `performance.measure("label", "start", "end")` → entry с duration
- [R] `console.trace("msg")` → `"msg (file.tsc:42)"` в stderr
- [E] `console.trace(...)` на embedded → ошибка компилятора

---

## Phase 13 — Декораторы

### Базовое применение

- [F] метод-декоратор без `before()`/`after()` (только `return desc`) — метод без изменений
- [F] `@log` на методе — `before()` + `after()` → C-wrapper с `printf` вокруг тела
- [F] `@log` на двух разных методах одного класса — два независимых wrapper'а
- [F] декоратор возвращает `void` — корректно, метод без изменений
- [F] класс-декоратор — модифицирует `ClassDesc`, C-output отражает изменения
- [F] свойство-декоратор (`@minLength(3)`) — генерирует setter с проверкой и getter
- [F] параметр-декоратор (`@isUUID`) — генерирует проверку на входе метода
- [F] standalone-функция-декоратор (`@log` на `function`) — wrapper вокруг функции

### Фабрики

- [F] `@minLength(3)` — фабрика возвращает анонимную стрелку, comptime-аргумент инлайнится
- [F] `@minLength(3) @minLength(5)` — оба в setter-цепочку, порядок снизу вверх
- [F] фабрика с несколькими аргументами — все захватываются как comptime

### Порядок применения

- [F] `@A @B method` — C-wrapper: A оборачивает B (A внешний, B внутренний)
- [F] `@timing @guard @log method` — три уровня вложенности, `@timing` всегда выполняется
- [F] `@log @static method` — встроенный `@static` применяется в последней фазе независимо от позиции
- [F] `@static @log method` — результат идентичен предыдущему

### `cls.addField()` и `cls.addMethod()`

- [F] `cls.addField('_cache', 'Map<string, any>')` — поле добавлено в C-структуру
- [F] `@memoize` — `addField` + `before()`/`after()` + `ctx.self.field()` → корректный C
- [F] `cls.addMethod('helper', ...)` — метод добавлен, видим снаружи
- [F] `@logAllMethods @addHelper class` — `logAllMethods` видит метод, добавленный `addHelper`
- [E] `@addHelper @logAllMethods class` — `logAllMethods` выполняется первым, не видит `helper()` → без ошибки (ожидаемое поведение)
- [E] коллизия имён в `addField` — два декоратора добавляют поле с одним именем → ошибка компилятора
- [E] коллизия имён в `addMethod` — аналогично

### `ctx.self.field<T>()`

- [F] `ctx.self.field<i32>('count')` → `self->count` в C
- [E] поле не существует — `ctx.self.field<i32>('missing')` → ошибка: unknown field
- [E] тип не совпадает — `ctx.self.field<string>('count')` где `count: i32` → ошибка: type mismatch
- [E] runtime-строка в `field()` → ошибка: compile-time string required

### Async-методы

- [F] `@timing` на async-методе — `start` продвинуто в SM struct, `before` = STATE_INIT, `after` = STATE_DONE
- [F] `@guard` на async-методе — ранний выход в STATE_INIT
- [F] `@log @timing` на async — два SM struct поля, два уровня обёртки

### Дженерики

- [F] `@log` на методе дженерик-класса — работает без изменений (`ctx.args: any[]`)
- [F] `@validate<P, R>` с generics на методе — строгая типизация `ctx.args`
- [E] `@validatePositive` на методе с generic return — `isGenericReturn === true` → `throw` → ошибка компилятора с текстом из декоратора

### Comptime-метаданные

- [F] `desc.meta.set<RouteInfo>('route', { method: 'GET', path: '/users' })` — compile-time only, в C-output нет следов
- [F] `desc.meta.get<RouteInfo>('route')` в том же декораторе — возвращает ожидаемое значение
- [F] два `meta.set` с одним ключом — побеждает выполнившийся позже

### Перегрузка для метода и standalone

- [F] `@log` на методе (первая перегрузка) и `@log` на standalone-функции (вторая) — оба работают корректно

### Экспорт / импорт

- [F] `export decorator function log` в одном файле, `import { log }` в другом — применяется корректно

### Модель выполнения — ошибки

- [E] захват рантайм-объекта в `before()` → `cannot capture runtime value 'logger' in desc.before()`
- [E] `throw` в теле декоратора → compile-time ошибка с текстом из `throw`
- [E] вызов рантайм-функции из декоратора → ошибка компилятора на месте вызова
- [E] circular dependency декораторов (A вызывает B, B вызывает A) → ошибка компиляции

### Платформенные ошибки

- [E] `@log` с `console.log` на платформе `avr` → ошибка указывает на место применения (`@log`), не на реализацию
- [E] `cls.addField('buf', 'Array<u8>')` (heap-тип) на `allocator: "none"` → двойная ошибка: на `addField()` + примечание на месте применения

### Встроенные декораторы — ошибки позиции

- [E] `@readonly` на методе → `@readonly can only be applied to properties`
- [E] `@static` на параметре → `@static cannot be applied to parameters`

### Применение не туда — ошибки

- [E] метод-декоратор применён к standalone-функции → ошибка с именем декоратора и ожидаемым таргетом
- [E] параметр-декоратор применён к классу → ошибка

---

## Инварианты компилятора (cross-cutting)

Эти тесты применяются ко всем фазам:

- [E] PascalCase для типов (классы, интерфейсы, type aliases) — lowercase → ошибка
- [E] зарезервированные префиксы имён типов: `ref_`, `mut_`, `arc_`, `opt_`, `arr_` → ошибка
- [F] все TSClang-символы в C — `static` (кроме `export extern "C"`)
- [R] сообщения об ошибках: формат `error[TSC-EXXX]: ...`, `  --> file:line:col`
- [R] hint присутствует в каждом сообщении borrow checker
- [F] `#line` директивы в debug режиме
- [F] `#line` директивы отсутствуют в release режиме

---
