# TypeScript C (tsc) — Language Design Concept

## Зачем

Много разработчиков с TypeScript идут на C — и это боль. C я люблю, C++ — нет. У C нет достойной экосистемы.

TypeScript компилируется в JavaScript. Почему бы не компилировать его в C? И добавить удобную экосистему — управление библиотеками, зависимостями, кросс-компиляцию под разные платформы (благо есть Clang и LLVM).

Потом я учил Rust. Понравилась безопасная работа с памятью. Почему бы не принести её в C — но сделать лёгкой и простой?

Так появился TSClang: **TypeScript как синтаксис. C как цель. Rust как модель безопасности. npm как опыт экосистемы.**

### Для чего

**Сейчас:**
- Серверный код — HTTP, сокеты, бэкенд
- Десктопные приложения — от терминальных CLI/TUI до полноценных (файловые менеджеры, офисные пакеты, всё что угодно)

**Важно:**
- Системный уровень — драйверы, операционные системы
- Embedded — Arduino, Raspberry Pi, ESP и подобные
- Игры — через OpenGL, DirectX и аналоги
- Библиотеки для нейросетей

**Мечта:**
- Кросс-платформа — Windows, Linux, Mac, Android, iOS
- Ретро-платформы — ZX Spectrum, NES, Sega, MS-DOS
- Собственный ретро-ПК с операционкой и играми

---

## Дизайн-философия

При любом дизайн-решении — иерархия приоритетов:

1. **Безопасность памяти** — ownership, borrow checker
2. **Производительность и типизация**
3. **TS-синтаксис** — максимально сохранять, но не ценой п.1 и п.2

Цель не "существующий TS-код компилируется без изменений", а "TS-разработчик узнаёт синтаксис и чувствует себя дома".

**TS-синтаксис имеет приоритет над любым другим** (Rust, C, Go и т.д.). Заимствовать синтаксис из других языков — только если в TS нет никакой подходящей конструкции.

Новые концепции встраиваются через TS-совместимый синтаксис: `Ref<T>` вместо `&T`, `Mut<T>` вместо `&mut T`, `mut` и `readonly` — уже есть в TS. Классы сохранены, несмотря на отсутствие в Rust.

Вопрос при каждом решении: *можно ли выразить это через существующий TS-синтаксис или его естественное расширение?*

**Обратная совместимость:** простой нативный TS-код без внешних библиотек должен компилироваться в TSClang или требовать только тривиальных правок, которые остаются валидным TS:

```typescript
let a = 10          // может потребовать явной аннотации
let a: number = 10  // — валидно и в TS, и в TSClang
```

Код с классами, объектами, массивами, циклами, template literals — должен работать как есть или с минимальными изменениями.

---

## Overview

A TypeScript-inspired language that compiles to C and auto-generates build files (CMakeLists.txt).

- File extension: `.tsc`
- CLI: `tsclang`
- Output: `.c` / `.h` files + `CMakeLists.txt`

---

## Установка

### Требования

- Node.js `>=18.0.0`
- npm `>=9.0.0`
- CMake `>=3.16` (для emit: binary / hex)
- Компилятор C: gcc, clang, или avr-gcc (для AVR targets)

### Установка CLI

```bash
# Глобальная установка (рекомендуется)
npm install -g tsclang

# Обновление
npm update -g tsclang

# Проверка установки
tsclang --version

# Запуск без установки
npx tsclang build
```

---

## Core Goals

- [ ] TypeScript-like syntax and type system
- [ ] Compiles to readable, idiomatic C
- [ ] Auto-generates CMakeLists.txt
- [ ] Dependency/library management

---

## Design Decisions

### Syntax

#### Форматирование

TSC следует соглашениям TypeScript/JavaScript.

**Точки с запятой** — опциональны, ASI как в JS:
```typescript
const x = 1       // без ;
const y = 2;      // со ; — тоже ok
```

**Фигурные скобки** — обязательны для всех блоков (`if`, `for`, `while`, функции):
```typescript
if (x > 0) {           // ✅
    doSomething()
}
if (x > 0) doSomething()   // ❌ ошибка компилятора — скобки обязательны
```

**Открывающая скобка** — на той же строке (K&R стиль):
```typescript
function foo(): void {   // ✅
}

function bar(): void     // ❌ ошибка компилятора
{
}
```

**Отступы** — не значимы (не Python). Рекомендуется 4 пробела или 2 пробела; табы допустимы.

**Кавычки** — одинарные и двойные эквивалентны:
```typescript
const a = "hello"
const b = 'hello'   // то же самое
const c = `Hello, ${name}!`   // template literal — обратные кавычки
```

**Trailing comma** — разрешена везде:
```typescript
const obj = { a: 1, b: 2, }        // ✅
function foo(x: i32, y: i32,) {}    // ✅
const arr = [1, 2, 3,]              // ✅
```

**Перенос строки** — допускается после `,`, `(`, `{`, бинарного оператора:
```typescript
const result = someFunction(
    argA,
    argB,
)

const val = a
    + b
    + c
```

**Комментарии:**
```typescript
// однострочный
/* многострочный */
/** JSDoc для документации */
```

**Пробелы вокруг операторов** — обязательны:
```typescript
const x = a + b * c       // ✅
const x = a+b*c           // ❌
```

**Пробелы в аннотациях типов** — после `:`, не до:
```typescript
const x: i32 = 5          // ✅
function foo(a: i32, b: string): void {}   // ✅
const x :i32 = 5          // ❌
```

**Generics** — без пробелов внутри `<>`:
```typescript
const arr: Array<i32> = []         // ✅
const m: Map<string, User> = ...   // ✅
const arr: Array< i32 > = []       // ❌
```

**Union типы** — пробелы вокруг `|`:
```typescript
let x: i32 | null          // ✅
function foo(): string | null {}   // ✅
let x: i32|null            // ❌
```

**Стрелочные функции** — скобки обязательны если есть аннотации типов:
```typescript
const f = (x: i32): i32 => x + 1     // ✅ — аннотации → скобки обязательны
const f = x => x + 1                  // ✅ — без аннотаций → скобки опциональны
const f = (x) => x + 1               // ✅ — тоже ok
```

**Цепочки методов** — каждый вызов на новой строке если цепочка длинная:
```typescript
// короткая — одна строка
arr.filter(x => x > 0).map(x => x * 2)

// длинная — каждый вызов на новой строке с отступом
const result = arr
    .filter(x => x > 0)
    .map(x => x * 2)
    .slice(0, 10)
```

**Тернарный оператор** — инлайн для простых случаев, многострочный для сложных:
```typescript
const label = isOk ? "yes" : "no"   // ✅ — инлайн

const message = isOk             // ✅ — многострочный
    ? "operation succeeded"
    : "operation failed"
```

**Пустые строки:**
- Одна пустая строка между функциями и классами верхнего уровня
- Внутри функции — не более одной пустой строки между логическими блоками
- Нет пустых строк сразу после `{` и перед `}`

**Длина строки** — рекомендуется не более 120 символов. Компилятор не ограничивает.

**Конец файла** — один перевод строки (`\n`).

#### Переменные

- `let` — мутабельная переменная: можно переприсвоить, можно вызывать `mut` методы, можно передавать как `Mut<T>`
- `const` — иммутабельная: нельзя переприсвоить, нельзя вызывать `mut` методы, нельзя передавать как `Mut<T>`

#### Перегрузка функций

Перегрузка по типам и по количеству параметров. Компилятор выбирает нужную версию на callsite, в C генерирует функции с mangled именами:

```typescript
// по типам
function process(x: i32): void { ... }        // → process_i32 в C
function process(x: string): void { ... }     // → process_string в C

process(42);       // вызывает process_i32
process("hello");  // вызывает process_string

// по количеству параметров
function foo(x: i32): void { ... }            // → foo_i32 в C
function foo(x: i32, y: i32): void { ... }    // → foo_i32_i32 в C

foo(1);     // вызывает foo_i32
foo(1, 2);  // вызывает foo_i32_i32

// комбинация
function add(a: i32, b: i32): i32 { ... }         // → add_i32_i32
function add(a: f64, b: f64): f64 { ... }         // → add_f64_f64
function add(a: string, b: string): string { ... } // → add_string_string
```

Перегрузка работает и для методов класса:
```typescript
class Printer {
    print(x: i32): void { ... }
    print(x: string): void { ... }
}
```

#### Ограничение: extern "C" запрещает перегрузку

`extern "C"` функции имеют фиксированное C-имя — манглинг невозможен. Перегрузка — ошибка компилятора:

```typescript
// ❌ импорт из C — линковщик не найдёт mangled имена
extern "C" function SDL_SetWindowSize(w: any, width: i32, height: i32): void { ... }
extern "C" function SDL_SetWindowSize(w: any, size: i32): void { ... }
// ошибка: extern "C" функции не могут быть перегружены

// ❌ экспорт в C — C-код ищет символ "process", а не "process_string"
export extern "C" function process(data: string): void { ... }
export extern "C" function process(data: i32): void { ... }
// ошибка: extern "C" функции не могут быть перегружены

// ✅ правильно — разные имена для C, обёртка с перегрузкой внутри TSC
extern "C" function SDL_SetWindowSize(w: any, width: i32, height: i32): void { ... }

export extern "C" function process_str(data: string): void { ... }
export extern "C" function process_int(data: i32): void { ... }

// внутренняя перегрузка — ok
function process(data: string): void { process_str(data); }
function process(data: i32): void { process_int(data); }
```

#### Дефолтные параметры

Работают для функций, методов и конструкторов. На callsite компилятор подставляет дефолтное значение:

```typescript
function greet(name: string, greeting: string = "Hello"): string {
    return `${greeting}, ${name}!`;
}

greet("Alice");          // "Hello, Alice!"
greet("Alice", "Hi");    // "Hi, Alice!"

// методы
class Printer {
    print(text: string, times: i32 = 1): void { ... }
}

printer.print("hi");     // times=1
printer.print("hi", 3);  // times=3
```

- Дефолтные параметры должны быть в конце списка
- Дефолтное значение — константа или литерал, не выражение с побочными эффектами
- Запрещено иметь overload, сигнатура которого совпадает с вызовом другого overload при подстановке дефолтных значений — ошибка компилятора:

```typescript
function foo(x: i32, y: i32 = 0): void { ... }
function foo(x: i32): void { ... }
// ошибка: ambiguous overload — foo(x: i32) совпадает с foo(x: i32, y: i32 = 0) при y=0
```

#### Функции

- Ключевое слово: `function`
  ```typescript
  function add(a: i32, b: i32): i32 {
    return a + b;
  }
  ```
- **Стрелочные функции** — сокращённый синтаксис, тип выводится:
  ```typescript
  const add = (a: i32, b: i32): i32 => a + b; // expression body
  const add = (a: i32, b: i32): i32 => {
    return a + b;
  }; // block body
  ```
- **Анонимные функции** — `function` без имени, присваивается переменной или передаётся аргументом:

  ```typescript
  const add = function (a: i32, b: i32): i32 {
    return a + b;
  };

  array.sort(function (a: i32, b: i32): i32 {
    return a - b;
  });
  ```

- **IIFE** — немедленный вызов функции:
  ```typescript
  // стрелочная функция
  ((a: i32, b: i32) => a + b)(1, 2); // => 3

  // блочное тело
  ((a: i32, b: i32): i32 => {
    return a + b;
  })(1, 2); // => 3

  // анонимная функция
  (function (a: i32, b: i32): i32 {
    return a + b;
  })(1, 2); // => 3
  ```
- **Замыкания** — стрелочные функции захватывают переменные из внешнего скопа:
  ```typescript
  let multiplier = 3;
  const triple = (x: i32) => x * multiplier; // захватывает multiplier
  ```
  - Захват **по значению** для примитивов (копируется в момент создания замыкания); `T | null` где T — примитив, тоже захватывается по значению (copy), несмотря на struct-представление в C:
    ```typescript
    let x: i32 | null = 5;
    const fn = () => console.log(x);
    x = null;
    fn();  // 5 — захвачена копия на момент создания
    ```
  - Захват **по ссылке** для сложных типов (следует правилам borrow checker) — по умолчанию
  - Явный список захвата — те же типы что везде: `T`, `Ref<T>`, `Mut<T>`, `Shared<T>`:
    ```typescript
    const fn = [data: Data]() => process(data);          // T — move (Owner)
    const fn = [data: Ref<Data>]() => data.length;       // Ref — immutable borrow
    const fn = [data: Mut<Data>]() => { data.push(1); }; // Mut — mutable borrow
    ```
  - Список захвата нужен когда компилятор не может вывести тип или нужен move
  - В C компилируется в struct с захваченными переменными + функцию принимающую этот struct

#### Семантика передачи значений

- **Примитивы** (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) — всегда **по значению** (copy)
- **Сложные типы** (объекты, массивы, коллекции, структуры, классы, строки) — управляются ownership системой
- Явные `&` аннотации не нужны для базовых случаев — компилятор решает сам

### Type System

#### Generics

- **Монорфизация** — компилятор генерирует отдельный код для каждого конкретного типа:
  - `identity<i32>` → `identity_i32` в C
  - `identity<User>` → `identity_User` в C
- **Синтаксис** — TypeScript-стиль `<T>`:
  ```typescript
  function identity<T>(x: T): T { return x; }
  function map<T, U>(arr: Ref<T[]>, f: (x: Ref<T>) => U): U[] { ... }

  class Stack<T> {
      items: T[];
      mut push(item: T): void { ... }
      mut pop(): T { ... }
  }
  ```
- **Bounds — нет**, проверка при инстанцировании. Правила ownership применяются в момент подстановки конкретного типа:
  ```typescript
  first<i32>(arr);   // ok — примитив, копируется
  first<User>(arr);  // ошибка в точке вызова: User — сложный тип, нельзя вернуть T из Ref<T[]>
  ```
- **Ownership с generics** — `Ref<T>`, `Mut<T>`, `Shared<T>`, `Weak<T>` работают как обычно:
  ```typescript
  function first<T>(arr: Ref<T[]>): Ref<T> { ... }  // borrow элемента
  function pop<T>(arr: Mut<T[]>): T { ... }          // move с удалением
  function process<T>(graph: Shared<T>) { ... }      // ARC
  ```

#### Extension Methods

Добавление методов к существующим типам без изменения их определения. Импортируются явно — не загрязняют тип глобально.

```typescript
// std/string.tsc — объявление extension
export extension function charCount(this: string): i32 {
    // ... подсчёт codepoints
}

export extension function chars(this: string): Iterator<u32> {
    // ... итератор по codepoints
}
```

```typescript
// main.tsc — использование
import { charCount, chars } from "std/string"

const s = "привет"
s.charCount()   // ✅ — extension доступен после импорта
s.chars()       // ✅

// в другом файле без импорта:
s.charCount()   // ❌ ошибка компилятора: method charCount not found on string
                //    hint: import { charCount } from "std/string"
```

**Правила:**
- `this` — первый параметр, указывает расширяемый тип; не передаётся явно при вызове
- Встроенные методы типа имеют **приоритет** над extension — shadowing built-in невозможен (ошибка компилятора)
- Extension виден только в файлах где он импортирован — **нет глобального загрязнения**
- Работает для любого типа: `string`, `i32`, пользовательских `struct`/`class`

**Пользовательские extensions:**
```typescript
// my_ext.tsc
export extension function toJson(this: User): string {
    return `{"name":"${this.name}","age":${this.age}}`
}
```

```typescript
import { toJson } from "./my_ext"
user.toJson()   // ✅
```

**C-output** — статический вызов, zero overhead:
```c
// import { charCount } from "std/string"  →
#include "std_string.h"
int32_t n = tsc_std_string_charCount(s);   // статический вызов, нет vtable
```

#### Типизация

- **Система типизации — два уровня:**

  | Конструкция | Типизация | Объектные литералы |
  |-------------|-----------|-------------------|
  | `struct` / `interface` / `type` | **Структурная** — совместимость по форме полей | ✅ `const p: Point = { x: 1, y: 2 }` — работает |
  | `class` | **Номинальная** — тип определяется именем | ❌ литерал не совместим с классом |

  ```typescript
  struct Point  { x: f64; y: f64 }
  struct Vector { x: f64; y: f64 }

  const p: Point = { x: 1.0, y: 2.0 }   // ✅ — структурная совместимость
  const v: Vector = p                     // ✅ — те же поля

  class Circle { x: f64; y: f64 }
  const c: Circle = { x: 1.0, y: 2.0 }  // ❌ — класс номинальный, нужен new Circle(...)
  ```

  `type Alias = { ... }` — синоним struct, структурная совместимость. Исключение: `type UserId = i32` — номинальный alias примитива (opaque type), отличается от `i32`.

- **Type inference** — тип выводится если не указан явно
  - `const p = { x: 1, y: 0 }` → `{ x: f64, y: f64 }` → анонимная struct в C
- **Автокаст числовых типов:**
  - Widening **без потерь** — неявно, молча:
    - `i8`/`i16`/`i32` → любой больший int (`i64`)
    - `u8`/`u16`/`u32` → любой больший uint (`u64`)
    - `i32` → `f64`, `u32` → `f64`, `f32` → `f64`
  - Widening **с потерей точности** — требует явный `as`:
    - `i32` → `f32`, `i64` → `f32`, `i64` → `f64`, `u64` → `f64`
  - Narrowing (f64→i32 и т.д.) — всегда требует `as`
- **Оператор `as`** — явное приведение типа, три случая:
  ```typescript
  // 1. Числовые типы — C-cast, может быть lossy
  3.14 as i32       // (int32_t)3.14 в C → 3
  1000 as i8        // переполнение — поведение как в C (implementation-defined)

  // 2. Non-null assertion — убрать null из типа без проверки
  let x: i32 | null = getValue();
  let y = x as i32; // runtime error если x == null
                    // лучше использовать if (x != null) для безопасности

  // 3. any — явный cast когда тип неизвестен
  let val: any = getFromC();
  let s = val as string;
  ```
- **`as` НЕ работает для:**
  - ownership типов: `user as Ref<User>` — ошибка компилятора
  - конвертации строк: `42 as string` — ошибка, используй `.toString()`

- **`as` для struct/interface** — структурная совместимость проверяется компилятором:
  ```typescript
  interface Point { x: f64; y: f64; }

  let p = { x: 1.0, y: 2.0 };  // анонимная struct
  foo(p as Point);               // ok — поля совпадают

  let q = { x: 1.0, z: 2.0 };
  foo(q as Point);               // ошибка: поле 'z' не совпадает с 'y'

  // лучше — явная аннотация сразу:
  let p: Point = { x: 1.0, y: 2.0 };
  foo(p);  // ok, без as
  ```
- **Объектные литералы** без типа → анонимная struct, генерируется компилятором
- **Пустой объектный литерал `{}`** — ошибка компилятора: struct без полей бессмысленна в TSC, память под поля не выделяется динамически:
  ```typescript
  let obj = {};       // ошибка: пустой объектный литерал запрещён
                      // hint: используй Map<K, V> для динамических ключей
                      //       или объяви тип: let obj: { field: T } = { ... }
  let obj = {};
  obj.a = 1;          // невозможно — struct фиксирована на этапе компиляции

  // правильно — динамические ключи:
  let obj = new Map<string, i32>();
  obj.set("a", 1);

  // правильно — фиксированная struct:
  let obj = { a: 1, b: 2 };  // { a: i32, b: i32 } известна компилятору
  obj.a = 5;                  // ok
  ```

#### Числовые типы

- Полный набор: `i8`, `i16`, `i32`, `i64`, `u8`, `u16`, `u32`, `u64`, `f32`, `f64`
- TypedArray алиасы — синонимы нативных типизированных массивов для JS-совместимости:
  ```typescript
  type Uint8Array   = u8[]    type Int8Array    = i8[]
  type Uint16Array  = u16[]   type Int16Array   = i16[]
  type Uint32Array  = u32[]   type Int32Array   = i32[]
  type Float32Array = f32[]   type Float64Array = f64[]
  ```
  Никакого runtime overhead — только алиасы. `Uint8Array` и `u8[]` взаимозаменяемы.

- Синоним: `number` = `f64` по умолчанию (совместимость с TypeScript-стилем)
  - Переопределяется через `"defaultNumber"` в `tsc.packages.json`
  - На 8-bit таргетах (`"target": "avr"` и др.) — warning если встречается `f64`
  ```json
  // tsc.packages.json — AVR
  { "target": "avr", "mcu": "atmega328p", "defaultNumber": "f32" }
  ```
  ```typescript
  // Десктоп (defaultNumber = f64)
  const a = 1;           // f64
  const b: number = 1;   // f64
  const c: f32 = 1;      // f32 (явно)

  // AVR (defaultNumber = f32)
  const a = 1;           // f32
  const b: number = 1;   // f32
  const c: f32 = 1;      // f32 (явно)
  const d: f64 = 1;      // f64 + warning: f64 on 8-bit target is inefficient
  ```
- Type inference выводит конкретный тип для всех значений:
  - числа → `number` (= `f64` или переопределённый тип)
  - строки → `string`, булевые → `boolean`, массивы → `number[]` и т.д.
  - явная аннотация переопределяет: `const i: i32 = 1` → `i32`
- Сообщения об ошибках используют конкретный тип: `expected f64, got i32`
- Все числа — примитивы, передаются по значению

#### Конвертация типов

##### Число → строка

Три способа:

```typescript
const age: i32 = 30;
const pi: f64 = 3.14159;

// 1. .toString() — явный метод на любом числовом типе
const s1 = age.toString();   // "30"
const s2 = pi.toString();    // "3.14159"

// 2. Template literal — автоматически
const s3 = `Age: ${age}`;    // "Age: 30"
const s4 = `Pi = ${pi}`;     // "Pi = 3.14159"

// 3. Конкатенация со строкой
const s5 = "Age: " + age;    // "Age: 30"

// as — НЕ работает для конвертации в строку:
const bad = age as string;   // ошибка компилятора
```

##### Строка → число

Явный парсинг — возвращает результат или ошибку:

```typescript
// parse — бросает ParseError если строка не число
const age = i32.parse("30");      // i32
const pi  = f64.parse("3.14");    // f64
const bad = i32.parse("abc");     // throws ParseError

// tryParse — возвращает T | null, без throws
const age = i32.tryParse("30");   // 30
const bad = i32.tryParse("abc");  // null

// использование с обработкой ошибок:
function getAge(raw: string): i32 throws ParseError {
    return i32.parse(raw)?;         // propagate ParseError
}

// использование с дефолтом:
const age = i32.tryParse(raw) ?? 0;  // 0 если не распарсилось

// as — НЕ работает для парсинга строк:
const bad = "30" as i32;  // ошибка компилятора: используй i32.parse()
```

Доступно для всех числовых типов: `i8.parse`, `i16.parse`, `i32.parse`, `i64.parse`, `u8.parse`, ..., `f32.parse`, `f64.parse`.

##### JS-совместимые глобальные функции

Синонимы для привычного JS-синтаксиса:

```typescript
// parseFloat(a) — синоним f64.tryParse(a) → f64 | null
parseFloat("3.14")   // 3.14
parseFloat("abc")    // null

// parseInt(a) — парсит как f64, затем обрезает дробную часть → i64 | null
parseInt("3.14")     // 3
parseInt("42")       // 42
parseInt("abc")      // null
parseInt("-7.9")     // -7  (truncate, не floor: к нулю)

// Number(a) — синоним parseFloat(a) → f64 | null
Number("3.14")       // 3.14
Number("abc")        // null

// String(a) — синоним a.toString() → string (всегда успешно)
String(42)           // "42"
String(3.14)         // "3.14"
String(true)         // "true"
String(null)         // "null"
```

Отличия от JS: `parseInt`/`parseFloat`/`Number` возвращают `T | null` вместо `NaN` — в TSC нет `NaN`.

#### Строки

- Один тип `string` — heap, UTF-8 байтовая последовательность
- Мутабельность через `let`/`const`

##### Индексация и длина

```typescript
const s = "привет"   // 6 букв, 12 байт в UTF-8

s.length    // 12 — количество байт, O(1)
s[0]        // 208 — первый байт буквы 'п', тип u8, O(1)
s[0..2]     // string — срез по байтовым смещениям, O(1), Ref<string>
```

`s[i]` возвращает **`u8`** (байт), не `string`. Это главное отличие от JS.

Ошибка если ожидается `string`:
```
error: expected string, got u8
hint: s[i] returns a raw byte in TSC (strings are UTF-8 byte arrays).
  - s[i..i+1]  — однобайтовый срез как Ref<string>
  - for...of   — итерация по графемным кластерам
  - import { graphemeAt } from "std/string"  — графемный кластер по байтовому смещению
```

Срез `s[a..b]` по байтовым смещениям — O(1), `Ref<string>` (borrow). Разработчик несёт ответственность за корректность границ (как в Rust). Разрезать мультибайтовый символ — не ошибка компилятора, но runtime может выдать некорректный UTF-8.

##### Символьные литералы

```typescript
const a: u8 = 'A'    // 65 — тип u8, как в C
const n: u8 = '\n'   // 10
const p: u8 = 'п'    // ошибка компилятора: 'п' — мультибайтовый символ (2 байта), не u8
```

`'X'` — литерал типа `u8`. Только ASCII и escape-последовательности. Мультибайтовые символы — только в строковых литералах.

##### Итерация

```typescript
// for...of — итерация по графемным кластерам (string)
for (const ch of "привет❤️") {
    // ch: string — "п", "р", "и", "в", "е", "т", "❤️"
}
```

##### Срезы и байтовый доступ

```typescript
s.bytes        // Slice<u8> — borrow сырых байт, O(1)
s.bytes[i]     // u8 — то же что s[i]
s.bytes.clone() // u8[] — owned копия байт

s[0..4]        // Ref<string> — байтовый срез, O(1)
```

##### std/string — Unicode extension methods

TSC-специфичные методы которых нет в JS/TS. Подключаются через импорт (extension methods):

```typescript
import { chars, charCount, graphemes, codePointAt, graphemeAt, sliceChars } from "std/string"

s.chars()                  // Iterator<u32> — codepoints (1087, 1088...)
s.charCount()              // i32 — кол-во codepoints, O(n)
s.graphemes()              // Iterator<string> — графемные кластеры ("п", "❤️"...)
s.codePointAt(byteIdx)     // u32 — codepoint по байтовому смещению, O(1 символа)
s.graphemeAt(byteIdx)      // string — графемный кластер по байтовому смещению
s.sliceChars(start, end)   // string — срез по codepoint-индексам, O(n)
```

`codePointAt(byteIdx)` и `graphemeAt(byteIdx)` принимают **байтовое смещение** — удобно после `indexOf`: смещение уже известно, сканировать с начала не нужно.

Для сегментации графем — **utf8proc** (UAX #29, ~300KB, C-native; работает на embedded).

##### Встроенные методы строк (JS-совместимые)

Импорт не нужен — доступны всегда:

```typescript
s.indexOf(sub)               // i32 — байтовое смещение, -1 если не найдено
s.includes(sub)              // boolean
s.startsWith(sub)            // boolean
s.endsWith(sub)              // boolean
s.slice(start, end?)         // string — копия по байтовым смещениям
s.substring(start, end?)     // string — копия
s.toUpperCase()              // string — ASCII only (Unicode: std/string)
s.toLowerCase()              // string — ASCII only
s.trim()                     // string
s.trimStart()                // string
s.trimEnd()                  // string
s.split(sep)                 // string[]
s.replace(search, replace)   // string — первое вхождение
s.replaceAll(search, replace) // string
s.padStart(len, fill?)       // string
s.padEnd(len, fill?)         // string
s.repeat(n)                  // string
s.charAt(i)                  // string — s[i..i+1] по байтовому смещению
s.charCodeAt(i)              // u8 — байт по смещению (синоним s[i])
```

#### Специальные типы

| Тип TSC | Тип C | Описание |
|---------|-------|----------|
| `void` | `void` | отсутствие значения — только для возвращаемого типа функции |
| `any` | `void*` | неизвестный тип — borrow checker не применяется |

```typescript
function log(msg: string): void { ... }  // void — нет return value

function getFromC(): any { ... }         // void* в C
let val: any = getFromC();
let s = val as string;                   // явный cast обязателен
```

- `void` нельзя использовать как тип переменной — только возвращаемый тип
- `any` = `void*` в C, **неявно nullable** — `void*` может быть `NULL`; писать `any | null` избыточно и запрещено (ошибка компилятора)
- `any` отключает borrow checker — **управление памятью ручное**, утечки на совести разработчика; использовать только на границах C interop

```typescript
// void + throws — Result без value-поля в C
function connect(): void throws IOError { ... }
// → typedef struct { bool ok; IOError error; } _Result_void_IOError;

connect()?;   // ok — propagate
connect()!;   // ok — panic on error
```

#### Null

- `null` — единственное "отсутствующее значение"
- `undefined` **отсутствует** — в отличие от JS, нет разделения на `null` и `undefined`
- `NaN` **отсутствует** — функции парсинга возвращают `T | null` вместо `NaN`; деление на ноль для целых → runtime panic, для float → поведение как в C (`Infinity`, `-Infinity` через IEEE 754, но не `NaN` как значение типа)

#### Операторы

##### Арифметические

| Оператор | Описание |
|----------|----------|
| `+` | сложение; для `string` — конкатенация |
| `-` | вычитание |
| `*` | умножение |
| `/` | деление |
| `%` | остаток от деления |
| `**` | возведение в степень |
| `++` | инкремент (prefix / postfix) |
| `--` | декремент (prefix / postfix) |

##### Присваивание

| Оператор | Эквивалент |
|----------|------------|
| `=` | присваивание |
| `+=` | `a = a + b` |
| `-=` | `a = a - b` |
| `*=` | `a = a * b` |
| `/=` | `a = a / b` |
| `%=` | `a = a % b` |
| `**=` | `a = a ** b` |
| `&=` | `a = a & b` |
| `\|=` | `a = a \| b` |
| `^=` | `a = a ^ b` |
| `<<=` | `a = a << b` |
| `>>=` | `a = a >> b` |
| `>>>=` | `a = a >>> b` |
| `&&=` | `a = a && b` |
| `\|\|=` | `a = a \|\| b` |
| `??=` | `a = a ?? b` |

##### Сравнения

| Оператор | Описание |
|----------|----------|
| `==` | равенство (в TSC нет type coercion — идентично `===`) |
| `!=` | неравенство (идентично `!==`) |
| `===` | строгое равенство |
| `!==` | строгое неравенство |
| `<` | меньше |
| `>` | больше |
| `<=` | меньше или равно |
| `>=` | больше или равно |

> В TSC нет неявного приведения типов, поэтому `==` и `===` ведут себя одинаково. Рекомендуется `===` для ясности.

##### Логические

| Оператор | Описание |
|----------|----------|
| `&&` | возвращает первый falsy операнд, или последний если все truthy |
| `\|\|` | возвращает первый truthy операнд, или последний если все falsy |
| `!` | логическое НЕ, возвращает `boolean` |
| `??` | возвращает правый операнд если левый `null` (не реагирует на `0`, `""`, `false`) |

Поведение `||` и `&&` аналогично JS — возвращают **сам операнд**, не `boolean`:

```typescript
const name = user.name || "Anonymous"   // string — "Anonymous" если name == ""
const port  = config.port || 8080        // i32    — 8080 если port == 0
const value = a && b && c               // тип c  — c если все truthy, иначе первый falsy

// ?? vs || — разница:
const x = value ?? "default"   // "default" только если value == null
const y = value || "default"   // "default" если value == null, "", 0, false
```

Тип результата `||` и `&&` — компилятор выводит из операндов (должны быть совместимых типов).

##### Битовые

| Оператор | Описание |
|----------|----------|
| `&` | побитовое И |
| `\|` | побитовое ИЛИ |
| `^` | побитовое XOR |
| `~` | побитовое НЕ |
| `<<` | сдвиг влево |
| `>>` | сдвиг вправо (знаковый) |
| `>>>` | сдвиг вправо (беззнаковый) |

##### Прочие

| Оператор | Описание |
|----------|----------|
| `? :` | тернарный оператор |
| `?.` | optional chaining — обращение к полю/методу если не `null` |
| `...` | spread |

##### Приоритет операторов

От высшего к низшему. Операторы на одном уровне — левоассоциативны, если не указано иное.

| Приоритет | Оператор(ы) | Ассоциативность |
|-----------|-------------|-----------------|
| 18 | `()` группировка | — |
| 17 | `.` `?.` `[]` вызов `()` | левая |
| 16 | `++` `--` (postfix) | — |
| 15 | `!` `~` `+` `-` (unary) `++` `--` (prefix) | правая |
| 14 | `**` | правая |
| 13 | `*` `/` `%` | левая |
| 12 | `+` `-` | левая |
| 11 | `<<` `>>` `>>>` | левая |
| 10 | `<` `<=` `>` `>=` | левая |
| 9 | `==` `!=` `===` `!==` | левая |
| 8 | `&` | левая |
| 7 | `^` | левая |
| 6 | `\|` | левая |
| 5 | `&&` | левая |
| 4 | `\|\|` `??` | левая |
| 3 | `? :` | правая |
| 2 | `=` `+=` `-=` `*=` `/=` `%=` `**=` `&=` `\|=` `^=` `<<=` `>>=` `>>>=` `&&=` `\|\|=` `??=` | правая |

> `??` нельзя смешивать с `||` или `&&` без явных скобок — ошибка компилятора:
> ```typescript
> a || b ?? c    // error: смешивание || и ?? требует скобок
> (a || b) ?? c  // ok
> a || (b ?? c)  // ok
> ```

#### Truthy / Falsy

Как в JS, без `undefined` и `NaN`:

| Тип | Falsy | Truthy |
|-----|-------|--------|
| `boolean` | `false` | `true` |
| числовые (`i8`..`f64`) | `0` | любое ненулевое |
| `string` | `""` (пустая строка) | любая непустая |
| `T | null` (сложный тип) | `null` | не null |
| `T | null` (примитив) | `null` или falsy значение | не null и truthy |
| class / struct | никогда (всегда truthy) | всегда |
| array / Set / Map | никогда (всегда truthy, даже пустые) | всегда |

```typescript
if ("")    { }  // falsy
if ("hi")  { }  // truthy
if (0)     { }  // falsy
if (42)    { }  // truthy
if (null)  { }  // falsy

// string | null — truthy если не null И не ""
let s: string | null = getValue();
if (s) {
    // s: string (не null и не пустая)
}

// i32 | null — truthy если не null И не 0
let n: i32 | null = getValue();
if (n) {
    // n: i32 (не null и не 0)
}

// class — всегда truthy (non-null по определению)
let u = new User("Alice");
if (u) { }  // всегда truthy — компилятор выдаёт warning: условие всегда true

// array / Set / Map — всегда truthy, даже пустые
let arr: i32[] = [];
if (arr) { }  // truthy — warning: условие всегда true
              // для проверки на пустоту используй arr.length === 0

let m = new Map<string, i32>();
if (m) { }  // truthy — warning: условие всегда true
            // для проверки на пустоту используй m.size === 0
```

Narrowing через truthy/falsy:
```typescript
let s: string | null = getValue();
if (s) {
    console.log(s.length);  // s: string — не null, не ""
} else {
    // s: string | null, но точно null или ""
}
```

C-output для truthy check:
```c
// string | null
if (s != NULL && s->length > 0) { ... }

// i32 | null (struct)
if (x.has_value && x.value != 0) { ... }

// string (non-nullable)
if (s->length > 0) { ... }
```

- Синтаксис nullable типа: `T | null` — для любых типов, компилятор выбирает реализацию:
  - Сложные типы (строки, массивы, объекты, Map, Set) → `T* = NULL` в C (бесплатно)
  - Примитивы (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) → `struct { bool has_value; T value; }` в C

  > **Overhead:** `i32 | null` занимает 8 байт вместо 4 из-за alignment в C (`bool` добавляет padding). Массив из 1 000 000 элементов `i32 | null` займёт 8 МБ вместо 4 МБ. Для горячих путей с большими nullable-массивами примитивов — используй sentinel-значения вручную (`-1`, `INT32_MIN`) и обычный `i32`.
- Компилятор сужает тип после проверки (type narrowing):
  ```typescript
  function findIndex(arr: i32[], val: i32): i32 | null {
      for (let i = 0; i < arr.length; i++) {
          if (arr[i] == val) return i;
      }
      return null;
  }

  const idx = findIndex(arr, 42);
  if (idx != null) {
      // здесь idx — просто i32
  }
  ```
- **Синтаксис `?`** — сахар для `T | null`, работает везде:
  ```typescript
  // переменные
  let x?: i32;        // то же что let x: i32 | null = null;
  let s?: string;     // то же что let s: string | null = null;

  // параметры функции
  function foo(x: i32, y?: i32) { ... }  // y: i32 | null
  foo(1);     // y = null
  foo(1, 5);  // y = 5

  // поля класса/структуры
  class User {
      name: string;
      age?: i32;      // то же что age: i32 | null
  }
  ```

- **Optional chaining `?.`** — обращение к полю/методу только если значение не null; возвращает `T | null`:
  ```typescript
  const name = user?.profile?.name;   // null если user или profile = null
  const len  = user?.tags?.length;    // i32 | null

  // методы
  const upper = user?.getName()?.toUpperCase();

  // C-output (вложенные тернарные операторы или if-цепочки)
  // String* name = (user != NULL && user->profile != NULL) ? user->profile->name : NULL;
  ```
  Тип результата `?.` всегда nullable: `T | null`.

- **Nullish coalescing `??`** — дефолтное значение если `null`:
  ```typescript
  const name = user.name ?? "Anonymous";   // string
  const age  = user.age ?? 0;              // i32

  // цепочка с ?.
  const city = user?.address?.city ?? "Unknown";
  ```
  Правая часть `??` должна быть того же типа что `T` в `T | null` — ошибка компилятора иначе.

  C-output зависит от типа:
  ```typescript
  // Примитив (struct { bool has_value; T value; }):
  const x: i32 | null = getSomething();
  const y = x ?? 0;
  // → int32_t y = x.has_value ? x.value : 0;

  // Сложный тип (указатель):
  let s: string | null = getString();
  const result = s ?? "default";
  // → String result = s != NULL ? *s : str("default");
  //   s помечается компилятором как перемещённый (moved)
  ```

#### Индексация и срезы (массивы и строки)

Единый синтаксис для массивов и строк. Конец среза всегда **эксклюзивный**, отрицательные индексы считают с конца:

| Синтаксис | Массив `T[]` | Строка `string` |
|-----------|--------------|-----------------|
| `x[i]` | элемент `T` | байт `u8`, O(1) |
| `x[1..3]` | элементы 1, 2 | байты 1, 2 → `Ref<string>`, O(1) |
| `x[1..]` | с 1 до конца | байты с 1 до конца |
| `x[..3]` | с начала до 3 | байты 0, 1, 2 |
| `x[..]` | весь массив | вся строка (borrow) |
| `x[-1]` | последний элемент | последний байт `u8` |
| `x[0..-1]` | всё кроме последнего | все байты кроме последнего |
| `x[-2..]` | последние два элемента | последние два байта |

> **Важно для строк:** индексы указывают на **байты**, не символы. Разработчик несёт ответственность за то, чтобы срез `s[a..b]` не разрывал мультибайтовый UTF-8 символ — иначе результат будет невалидной строкой. Для безопасных срезов по символам: `import { sliceChars } from "std/string"`.

#### Date

JS-совместимый тип даты/времени. Реализован поверх C `time_t` / `struct tm` из `<time.h>`.

Внутреннее представление — `int64_t` (миллисекунды с Unix epoch), как в JS.

##### Создание

```typescript
new Date()                              // текущее время
new Date(1710936000000)                 // из миллисекунд с epoch
new Date("2024-03-20")                  // из ISO строки
new Date("2024-03-20T14:30:00.000Z")    // ISO с временем
new Date(2024, 2, 20)                   // год, месяц (0-11!), день
new Date(2024, 2, 20, 14, 30, 0, 0)    // + часы, минуты, секунды, мс
```

##### Статические методы

```typescript
Date.now()   // i64 — текущее время в мс с epoch
```

##### Геттеры

```typescript
const d = new Date("2024-03-20T14:30:00.000Z");

d.getFullYear()        // i32 — 2024
d.getMonth()           // i32 — 2 (0-11, март = 2)
d.getDate()            // i32 — 20 (день месяца, 1-31)
d.getDay()             // i32 — 3 (день недели, 0=воскресенье)
d.getHours()           // i32 — 14
d.getMinutes()         // i32 — 30
d.getSeconds()         // i32 — 0
d.getMilliseconds()    // i32 — 0
d.getTime()            // i64 — мс с epoch
d.getTimezoneOffset()  // i32 — смещение timezone в минутах
```

##### Сеттеры

```typescript
d.setFullYear(2025)
d.setMonth(0)           // январь
d.setDate(1)
d.setHours(12)
d.setMinutes(0)
d.setSeconds(0)
d.setMilliseconds(0)
d.setTime(1710936000000)
```

##### Форматирование

```typescript
d.toISOString()          // "2024-03-20T14:30:00.000Z"
d.toString()             // "Wed Mar 20 2024 14:30:00 GMT+0000"
d.toDateString()         // "Wed Mar 20 2024"
d.toTimeString()         // "14:30:00 GMT+0000"
d.toLocaleDateString()   // локализованная дата
d.toLocaleTimeString()   // локализованное время
d.toLocaleString()       // локализованные дата и время
d.valueOf()              // i64 — то же что getTime()
```

##### C-output

```c
typedef struct { int64_t ms; } Date;

// Date.now()
Date Date_now() {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    return (Date){ ts.tv_sec * 1000LL + ts.tv_nsec / 1000000LL };
}

// getFullYear()
int32_t Date_getFullYear(Date d) {
    time_t t = d.ms / 1000;
    struct tm* tm = gmtime(&t);
    return tm->tm_year + 1900;
}
```

> На embedded `gmtime` / `localtime` могут быть недоступны — используй `PlainDateTime` (Temporal, в разработке).

#### Массивы и коллекции

##### Массивы

| Синтаксис | Тип | Память |
|-----------|-----|--------|
| `[1, 2, 3]` | литерал, динамический | heap |
| `i32[]` | тип динамического массива | heap |
| `i32[3]` | фиксированный, ровно 3 элемента | стек |

```typescript
let a = [1, 2, 3];               // динамический, из литерала
let b: i32[] = [];               // пустой динамический
let c: i32[3] = [1, 2, 3];       // фиксированный, ровно 3 элемента
let d: i32[] = new Array(100);   // capacity=100, length=0 (тип из аннотации)
let e = new Array<i32>(100);     // то же самое, без аннотации
// ВАЖНО: аргумент new Array(N) — это capacity, не length (расхождение с JS)
```

Фиксированный массив `T[N]`:
- Размер известен на этапе компиляции, память на стеке
- Литерал инициализации должен содержать ровно N элементов — иначе ошибка компилятора
- `push`/`pop` недоступны — ошибка компилятора
- Передаётся в функции как `Ref<T[]>` / `Mut<T[]>` — фиксированный является подтипом динамического:
  ```typescript
  function sum(arr: Ref<i32[]>): i32 { ... }  // принимает любой i32 массив

  let fixed: i32[3] = [1, 2, 3];
  let dynamic: i32[] = [1, 2, 3, 4];

  sum(fixed);    // ok — автоматически как Ref<i32[]>
  sum(dynamic);  // ok
  ```

Методы и свойства динамического массива:
- `arr.push(item)` — move item в конец массива; бросает при OOM
  ```typescript
  let arr: User[] = [];
  let user = new User();
  arr.push(user);        // move — arr владеет user
  console.log(user);     // ошибка: user перемещён
  ```
- `arr.pop()` — удалить и вернуть последний элемент как owned `T | null`; null если массив пустой
  ```typescript
  let last = arr.pop();  // User | null
  if (last != null) {
      last.doSomething(); // ok — last владеет объектом
  }
  // или короче:
  arr.pop()?.doSomething();           // ?. — только если не null
  const u = arr.pop() ?? defaultUser; // ?? — дефолт если null
  ```
- `arr.remove(i)` — удалить по индексу с возвратом ownership
- `arr.fill(value)` — **TSC**: заполнить все слоты 0..capacity, length становится равным capacity
- `arr.fill(value, start, end)` — **JS-совместимо**: заполнить индексы `start..end-1` в пределах `0..length`, length не меняется:
  - `end > length` — ошибка компилятора (константы) или runtime error (переменные)
  ```typescript
  let arr: i32[] = new Array(100); // capacity=100, length=0
  arr.fill(0);                      // capacity=100, length=100, все слоты = 0
  arr.fill(5, 0, 10);               // индексы 0..9 = 5, length остаётся 100
  arr.fill(5, 90, 110);             // ошибка: end=110 > length=100
  ```
- `arr.resize(n)` — уменьшить length до n; если n > length — ошибка компилятора (используй `resize(n, value)`)
- `arr.resize(n, value)` — изменить length до n, новые слоты заполняются `value`; если n > capacity — автоматически реаллоцирует; при уменьшении `value` игнорируется
  ```typescript
  arr.resize(10);       // ok — уменьшить, value не нужен
  arr.resize(50);       // ошибка компилятора: n > length, используй resize(n, value)
  arr.resize(200, 0);   // ok — увеличить, новые слоты = 0, реаллоцирует если нужно
  arr.resize(5, 0);     // ok — уменьшить, value игнорируется
  ```
- `arr.length` — количество элементов (доступны индексы `0..length-1`), readonly;
  присвоение `arr.length = n` — ошибка компилятора с подсказкой: `use arr.resize(n) instead`
  ```typescript
  let arr: i32[] = new Array(100); // capacity=100, length=0
  arr.push(1);
  arr.push(2);                      // capacity=100, length=2

  arr[0];   // ok → 1
  arr[1];   // ok → 2
  arr[2];   // runtime error: index 2 out of bounds (length=2)
  arr[99];  // runtime error: index 99 out of bounds (length=2)
  arr[-1];  // ok → 2 (последний элемент)
  arr[-3];  // runtime error: index -3 out of bounds (length=2)

  arr.length = 10; // ошибка компилятора: use arr.resize(10) instead
  ```
- `arr.capacity` — заранее выделенная память, читать и записывать:
  ```typescript
  let arr: i32[] = new Array(100); // capacity=100, length=0
  arr.fill(0);                      // capacity=100, length=100

  // увеличить capacity — length не меняется
  arr.capacity = 200;               // capacity=200, length=100
  console.log(arr.capacity);        // 200
  console.log(arr.length);          // 100

  // уменьшить capacity ниже length — length обрезается
  arr.capacity = 50;                // capacity=50,  length=50  (было length=100, обрезано)
  console.log(arr.capacity);        // 50
  console.log(arr.length);          // 50

  arr.capacity = 30;                // capacity=30,  length=30  (было length=50, обрезано)
  console.log(arr.capacity);        // 30
  console.log(arr.length);          // 30
  ```

##### Slice<T> — zero-copy view

`Slice<T>` — non-owning borrowed view в непрерывный участок массива или буфера. Создаётся через `.view()`. В отличие от `.slice()` (копирует), `.view()` не копирует данные.

```typescript
let arr: i32[] = [1, 2, 3, 4, 5, 6, 7, 8]

const s: Slice<i32> = arr.view(2, 6)   // элементы 2..5, zero-copy
s[0]       // 3
s[1]       // 4
s.length   // 4

s.view(1, 3)   // под-слайс: элементы 3..4
```

`Slice<T>` — borrow: borrow checker проверяет что источник не dropped пока слайс жив. Передаётся в функции как `Ref<T[]>`:

```typescript
function sum(data: Ref<i32[]>): i32 { ... }

sum(arr.view(0, 4))   // ✅ Slice<i32> совместим с Ref<i32[]>
sum(arr)              // ✅ тоже ok
```

Методы: `view(start?, end?)` — под-слайс; `[i]` — элемент; `.length` — длина. Мутабельный слайс — `MutSlice<T>` (из `.viewMut()`):

```typescript
const ms: MutSlice<u8> = buf.viewMut(0, 4)
ms[0] = 0xFF   // запись в оригинальный буфер
```

C-output:
```c
typedef struct { int32_t* ptr; size_t length; } Slice_i32;
typedef struct { int32_t* ptr; size_t length; } MutSlice_i32;
// .view(2, 6) → { .ptr = arr->data + 2, .length = 4 }  — без копирования
```

##### Структуры данных под капотом

| Тип | Реализация в C | Ключи |
|-----|----------------|-------|
| `{}` объектный литерал | `struct` | известны на этапе компиляции |
| `Map<K, V>` | хеш-таблица | известны только в runtime |
| `Set<T>` | хеш-множество | известны только в runtime |

`Object.keys(obj)` — компилятор знает ключи статически и генерирует их как массив констант. В отличие от JS, `{}` в TSC **не является** хеш-таблицей.

##### Map

Инициализация:
```typescript
// Универсальный — любой тип ключа
let m = new Map<string, i32>([["a", 1], ["b", 2]]);

// Объектный литерал — только string ключи
let m: Map<string, i32> = { "a": 1, "b": 2 };

// Пустая Map
let m = new Map<string, i32>();
```

Методы:
```typescript
m.set(key, value)   // key: move (сложный тип) / copy (примитив); value: move — Map владеет обоими
m.get(key)          // key: Ref<K>, возвращает Ref<V> | null (не V | undefined как в JS)
m.has(key)          // key: Ref<K>, boolean
m.delete(key)       // key: Ref<K>, возвращает V | null (owned) — элемент удалён из Map
m.clear()           // void
m.size              // number, readonly

// ?. и ?? с Map
const len = m.get("key")?.length ?? 0;   // Ref<string> | null → i32
const val = m.delete("key") ?? fallback;  // V | null → V
```

Примеры ownership:
```typescript
let m = new Map<string, User>();
let user = new User();
m.set("alice", user);   // "alice" — литерал, копируется; user — move
console.log(user);      // ошибка: user перемещён

let key = "alice";
m.set(key, user2);      // key — move
console.log(key);       // ошибка: key перемещён

let u = m.get("alice");    // Ref<User> | null — borrow из Map
let u = m.delete("alice"); // User | null — owned, элемент удалён

// примитивы — всегда copy
let m = new Map<string, i32>();
m.set("x", 42);         // 42 скопирован
m.get("x");             // i32 | null — copy (примитив)
```

Итерация — `k: Ref<K>`, `v: Ref<V>` для сложных типов, copy для примитивов:
```typescript
for (const [k, v] of m) {
    v.doSomething();  // ok — immutable метод
    v.mutMethod();    // ошибка — v это Ref
    m.set("x", val);  // ошибка — m заимствован
}
m.forEach((k, v) => { ... });
for (const k of m.keys()) { ... }
for (const v of m.values()) { ... }
for (const [k, v] of m.entries()) { ... }
```

##### Set

Инициализация:
```typescript
let s = new Set<i32>([1, 2, 3]);
let s = new Set<string>();
```

Методы:
```typescript
s.add(value)        // move — Set становится владельцем; бросает при OOM
s.has(value)        // Ref<T> — только для сравнения, владение не меняется; boolean
s.delete(value)     // Ref<T> для поиска, возвращает T | null (owned) — элемент удалён из Set
s.clear()           // void
s.size              // number, readonly

// ?. и ?? с Set
const deleted = s.delete(user);
deleted?.cleanup();                    // вызвать метод если элемент был в Set
const u = s.delete(user) ?? fallback; // дефолт если элемента не было
```

Примеры ownership:
```typescript
let s = new Set<User>();
let user = new User();
s.add(user);        // move — user перешёл во владение Set
console.log(user);  // ошибка: user перемещён

// примитивы — всегда copy
let s = new Set<i32>();
let x = 42;
s.add(x);           // copy
console.log(x);     // ok
```

Теоретико-множественные операции — доступны для примитивов, `string` и `Shared<T>`:
```typescript
s.union(other)               // новый owned Set — все элементы из s и other
s.intersection(other)        // новый owned Set — только общие элементы
s.difference(other)          // новый owned Set — элементы s которых нет в other
s.symmetricDifference(other) // новый owned Set — элементы только в одном из двух
s.isSubsetOf(other)          // boolean
s.isSupersetOf(other)        // boolean
s.isDisjointFrom(other)      // boolean
```

Для `Shared<T>` — union это просто retain на каждый элемент, без копирования объектов:
```typescript
let user1: Shared<User> = new User();
let user2: Shared<User> = new User();

let a = new Set<Shared<User>>([user1, user2]);
let b = new Set<Shared<User>>([user2]);
let c = a.union(b);  // ok — retain на элементы, refcount растёт
```

Для `string` — элементы клонируются в новый Set:
```typescript
let morphemes = new Set<string>(["бег", "ать"]);
let suffixes  = new Set<string>(["ать", "ить"]);
let common = morphemes.intersection(suffixes);  // new Set<string> {"ать"}
```

Для owned сложных типов — ошибка компилятора:
```typescript
let a = new Set<User>([user1, user2]);
let b = new Set<User>([user2]);
let c = a.union(b);
// ошибка: union requires Set<primitive>, Set<string> or Set<Shared<T>>
// hint: use Set<Shared<User>> instead
```

Итерация — `v` это `Ref<T>` для сложных типов, copy для примитивов:
```typescript
for (const v of s) {
    v.doSomething();  // ok — immutable метод
    v.mutMethod();    // ошибка — v это Ref
    s.add(other);     // ошибка — s заимствован
}
s.forEach((v) => { ... });
for (const v of s.values()) { ... }
```

##### Object

Статические методы для работы с объектами. Ключи — compile-time константы, возвращаются как копии. Значения — Ref для сложных типов, copy для примитивов:

```typescript
const obj = { a: user1, b: user2 };
Object.keys(obj)    // string[]              — копии ключей
Object.values(obj)  // Ref<User>[]           — borrow значений
Object.entries(obj) // [string, Ref<User>][] — ключи copy, значения Ref

const obj = { x: 1, y: 2 };
Object.keys(obj)    // string[]          — копии ключей
Object.values(obj)  // i32[]             — copy (примитивы)
Object.entries(obj) // [string, i32][]   — всё copy
```

Итерация:
```typescript
for (const k of Object.keys(obj)) { ... }
for (const v of Object.values(obj)) { ... }
for (const [k, v] of Object.entries(obj)) { ... }
```

### Memory Model

**Гибридная модель:** статический ownership/borrow checker + опциональный ARC. Нет GC, нет ручного `free`.

#### Типы владения

| Тип | Семантика |
|-----|-----------|
| `T` | **Owner** — владеет объектом, move при передаче |
| `Ref<T>` | **Immutable borrow** — только чтение |
| `Mut<T>` | **Mutable borrow** — чтение и запись |
| `Shared<T>` | **ARC** — strong ref, увеличивает refcount |
| `Weak<T>` | **Weak ref** — не увеличивает refcount, разрывает циклы |
| `Slice<T>` | **Borrowed array view** — zero-copy sub-range, pointer + length |

#### Базовые правила

- **Примитивы** (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) — всегда **копируются**, borrow checker не применяется; `T | null` компилируется в struct с флагом
- **Сложные типы** (массивы, объекты, строки, классы) — управляются ownership системой
  - `string` — Owner, heap-allocated, валидная UTF-8 последовательность байтов; передаётся как `Ref<string>`, копируется через `clone()`; `s[i]` возвращает `u8` (примитив, copy) — индексация не создаёт borrow

#### Owner (T) — владение

##### Move при присвоении

```typescript
let a = new User();
let b = a;          // MOVE: a теперь invalid
// console.log(a);  // ошибка: a перемещён
```

##### Move при передаче в функцию

```typescript
function addToCache(cache: Mut<Cache>, data: User[]) {
   cache.items.push(data);   // ok — data принадлежит функции
}

addToCache(myCache, myData);
console.log(myData);   // ошибка: myData перемещён
```

#### Ref\<T\> — immutable borrow

Только чтение, без изменения и удаления.

```typescript
function sum(arr: Ref<i32[]>): i32 { ... }

const data = [1, 2, 3];
sum(data);
console.log(data);   // ok — data не перемещён
```

#### Mut\<T\> — mutable borrow

Чтение и запись, только один `Mut` за раз.

```typescript
function push(arr: Mut<i32[]>, val: i32) {
    arr.push(val);
}

let data = [1, 2, 3];
push(data, 4);
console.log(data);   // [1, 2, 3, 4]
```

#### Shared\<T\> — ARC

Для графов, циклов, неопределённого времени жизни.

Объект становится `Shared` через аннотацию типа — компилятор автоматически оборачивает в ARC:

```typescript
let node: Shared<Node> = new Node();  // ARC
let node = new Node();                // Owner — move семантика
```

Цикл разрывается через `Weak<T>` — одна из сторон держит слабую ссылку:

```typescript
class Node {
    next: Shared<Node>;
    prev: Weak<Node>;
}

let node1: Shared<Node> = new Node();
let node2: Shared<Node> = new Node();
node1.next = node2;  // retain(node2)
node2.prev = node1;  // weak — refcount не растёт, цикл разорван
```

При обращении к `Weak<T>` — тип всегда `T | null` (объект мог быть освобождён). Используй `?.` и `??`:

```typescript
node2.prev?.doSomething();           // вызов только если объект жив
const name = node2.prev?.name ?? ""; // дефолт если объект освобождён
if (node2.prev != null) {
    // narrowing — здесь prev: Weak<Node> (жив)
}
```

Генерируемый C:
```c
Node* node1 = Node_new();
RC_retain(node1);   // refcount = 1
Node* node2 = Node_new();
RC_retain(node2);   // refcount = 1
node1->next = node2;
RC_retain(node2);   // refcount = 2
node2->prev = node1; // weak — RC_retain не вызывается
```

#### Правила Borrow Checker

1. **Нельзя два Mut одновременно**
   ```typescript
   let a = [1, 2, 3];
   let r1: Mut<i32[]> = a;
   let r2: Mut<i32[]> = a;   // ошибка: уже есть активный Mut
   ```

2. **Нельзя Mut + Ref одновременно**
   ```typescript
   let a = [1, 2, 3];
   let r1: Ref<i32[]> = a;
   let r2: Mut<i32[]> = a;   // ошибка: a уже заимствован как Ref
   ```

3. **Можно несколько Ref одновременно**
   ```typescript
   let a = [1, 2, 3];
   let r1: Ref<i32[]> = a;
   let r2: Ref<i32[]> = a;   // ok
   ```

#### Правила передачи аргументов в функцию

Тип параметра в сигнатуре **полностью диктует semantics на callsite** — явных `&` или `*` не нужно.

**Примитивы — всегда copy**, независимо от типа параметра:
```typescript
function foo(x: i32): void { ... }
let n = 42;
foo(n);  // copy — n жив после вызова
```

**Сложные типы — 4 варианта параметра:**
```typescript
function toRef(x: Ref<User>): void { ... }        // borrow
function toMut(x: Mut<User>): void { ... }        // mutable borrow
function toOwned(x: User): void { ... }           // move
function toShared(x: Shared<User>): void { ... }  // retain

let u = new User();
const c = new User();
let s: Shared<User> = new User();

toRef(u);    // ok — auto borrow, u жив
toRef(c);    // ok — auto borrow, c жив
toMut(u);    // ok — auto mutable borrow
toMut(c);    // ошибка: нельзя Mut<T> из const
toOwned(u);  // ok — move, u недоступен после вызова
toOwned(c);  // ошибка: нельзя move из const
toShared(s); // ok — retain (refcount++)
toShared(u); // ошибка: u не является Shared<T>
```

**Передача через промежуточный тип (Ref/Mut/Shared как источник):**
```typescript
function bar(u: Ref<User>): void {
    toRef(u);    // ok — re-borrow
    toMut(u);    // ошибка: Ref → Mut запрещено
    toOwned(u);  // ошибка: нельзя move из Ref
                 // hint: clone если User implements Clone
}

function baz(u: Mut<User>): void {
    toRef(u);    // ok — Mut → Ref разрешено (понижение)
    toMut(u);    // ok — re-borrow как Mut
    toOwned(u);  // ошибка: нельзя move из Mut
}

function qux(u: Shared<User>): void {
    toRef(u);    // ok — borrow из Shared
    toMut(u);    // ошибка: Shared не даёт Mut (нет эксклюзивного владения)
    toOwned(u);  // ошибка: нельзя move из Shared
    toShared(u); // ok — retain
}
```

**Матрица совместимости:**

| Источник ↓ \ Параметр → | `Ref<T>` | `Mut<T>` | `T` (owned) | `Shared<T>` |
|--------------------------|----------|----------|-------------|-------------|
| `let T`                  | ✅ auto borrow | ✅ auto mut borrow | ✅ move | ❌ |
| `const T`                | ✅ auto borrow | ❌ | ❌ | ❌ |
| `Ref<T>`                 | ✅ re-borrow | ❌ | ❌ | ❌ |
| `Mut<T>`                 | ✅ понижение | ✅ re-borrow | ❌ | ❌ |
| `Shared<T>`              | ✅ borrow | ❌ | ❌ | ✅ retain |

#### Scope Constraint (без lifetime аннотаций)

TSC не имеет явных lifetime аннотаций (как `'a` в Rust). Вместо них — набор консервативных правил, которые компилятор проверяет статически.

**Правило 1: Ref/Mut нельзя в глобал**
```typescript
let global: Ref<User>;  // ошибка

function foo(u: Ref<User>) {
    global = u;  // ошибка: borrow не может пережить функцию
}
```

**Правило 2: Нельзя вернуть ссылку на локал**
```typescript
function bad(): Ref<User> {
    const u = new User();
    return u;  // ошибка: u умрёт в конце функции
}
```

**Правило 3: Возвращаемый `Ref<T>` привязан ко всем входным `Ref<T>` параметрам**

Если функция принимает несколько `Ref<T>` и возвращает `Ref<T>` — компилятор консервативно считает что результат привязан к **минимальному** lifetime из всех входных Ref. Результат валиден пока живы **все** источники:

```typescript
function getLonger(a: Ref<string>, b: Ref<string>): Ref<string> {
    return a.length > b.length ? a : b
}

const s1 = "hello"
const s2 = "world!"
const longer = getLonger(s1, s2)
// longer валиден пока живы и s1, и s2 — borrow checker проверяет оба
console.log(longer)   // ✅

// ❌ если s1 или s2 dropped раньше longer — ошибка компилятора
```

Это **консервативно**: компилятор может отклонить валидный код если не может доказать что конкретный источник переживёт результат. В таких случаях — использовать `clone()` или `Shared<T>`:

```typescript
// если нужно чтобы результат пережил источники — clone
function getLongerOwned(a: Ref<string>, b: Ref<string>): string {
    return (a.length > b.length ? a : b).clone()
}
```

#### Автоматический Drop


Компилятор вставляет `free()` в конце scope владельца:

```c
{
    User* b = User_new();
    // ... логика ...
    User_free(b);  // вставлено автоматически
}
```

При множественных `return` — единая точка очистки:

```c
void process(User* u) {
    if (!u) goto cleanup;
    if (error) goto cleanup;
    // ... работа ...
cleanup:
    if (u_is_owned) User_free(u);
}
```

**Result + ARC — `_free` всегда проверяет дискриминант:**

`Result<T, E>` — discriminated union. Когда `?` пропагирует ошибку, T никогда не был создан → утечки нет. Но когда `Result<T, E>` dropped без потребления (например, возвращён из функции и проигнорирован), компилятор генерирует `_free_Result_T_E` который проверяет дискриминант и вызывает нужный деструктор:

```c
// генерируемый _free для Result<Shared<User>, Error>
void _free_Result_SharedUser_Error(Result_SharedUser_Error* r) {
    if (r->is_ok) {
        // успех — освобождаем Shared<User>
        SharedUser_release(r->value.ok);
    } else {
        // ошибка — освобождаем Error
        Error_free(r->value.err);
    }
}
```

Это гарантирует отсутствие утечек при любом пути выполнения: `goto cleanup` всегда вызывает `_free_Result_*` для всех Result на стеке функции.

#### Clone

`Clone` — интерфейс для deep copy. Два синтаксиса, одна семантика:

```typescript
interface Clone {
    clone(): this;
}

class User implements Clone {
    name: string;
    age: i32;

    clone(): User {
        return new User(this.name, this.age);
    }
}

let u1 = new User("Alice", 30);
let u2 = structuredClone(u1);  // функциональный стиль
let u3 = u1.clone();           // метод — то же самое
console.log(u1);               // ok — u1 жив
```

- Примитивы и `string` — auto-implement Clone
- Массивы — `clone()` / `structuredClone` работают если элементы реализуют `Clone`
- `Shared<T>` — `structuredClone` создаёт новый независимый объект (deep copy, не retain)
- Spread для pure-primitive структур = неявный clone; для сложных полей = move

```typescript
// массивы
let arr = [1, 2, 3];
let arr2 = arr.clone();           // ok — примитивы

let users = [user1, user2];
let users2 = users.clone();       // ok — User implements Clone

let items = [item1, item2];
let items2 = items.clone();       // ошибка: Item does not implement Clone
                                  // hint: implement Clone on Item
```

#### Type Aliases

`type` — compile-time алиас, не генерирует новый тип в C:

```typescript
// 1. Алиас примитива — читабельность
type UserId = i32;
type Timestamp = i64;

function getUser(id: UserId): User { ... }  // UserId = i32 в C

// 2. Алиас объекта — эквивалентен data-only interface, генерирует typedef struct
type Point = { x: f64, y: f64 };     // → typedef struct { double x; double y; } Point;
let p: Point = { x: 1.0, y: 2.0 };  // ok — Point struct

// 3. Union тип
type StringOrInt = string | i32;
type Nullable<T> = T | null;  // generic алиас

function process(x: StringOrInt): void { ... }

// 4. Тип функции — для колбэков
type Callback = (x: i32) => void;
type Comparator<T> = (a: Ref<T>, b: Ref<T>) => i32;

function sort(arr: Mut<i32[]>, cmp: Comparator<i32>): void { ... }
```

- `type Point = { ... }` = `interface Point { ... }` для data-only структур — оба генерируют `typedef struct Point` в C
- `type UserId = i32` — compile-time алиас примитива, нового C типа нет
- `type StringOrInt = string | i32` — compile-time union, нового C типа нет
- Номинальная типизация: `type UserId = i32` и `i32` — разные типы

#### Enum

##### Числовой enum

```typescript
enum Direction { North, South, East, West }   // 0, 1, 2, 3
enum Color { Red = 1, Green = 2, Blue = 4 }   // явные значения (битовые флаги)
```

C-output:
```c
typedef enum { North, South, East, West } Direction;
static const Direction Direction_values[] = { North, South, East, West };
static const char*    Direction_names[]  = { "North", "South", "East", "West" };
```

##### Строковый enum

```typescript
enum Status { Ok = "OK", Fail = "FAIL", Pending = "PENDING" }
```

C-output:
```c
typedef enum { Status_Ok, Status_Fail, Status_Pending } Status;
static const char* Status_strings[] = { "OK", "FAIL", "PENDING" };
```

##### const enum

Только C enum, без runtime таблиц. Используется когда важен размер бинаря (embedded).

```typescript
const enum Pin { PA0 = 0, PA1 = 1, PB0 = 8, PB1 = 9 }
```

C-output:
```c
typedef enum { PA0 = 0, PA1 = 1, PB0 = 8, PB1 = 9 } Pin;
// больше ничего — нет таблиц
```

Утилиты на `const enum` недоступны — ошибка компилятора:
```typescript
Pin.values()         // error: const enum has no runtime table
Pin.fromValue(0)       // error: const enum has no runtime table
Pin.PA0.toString()   // error: const enum has no runtime table
```

##### Утилиты enum (только обычный enum)

```typescript
enum Direction { North, South, East, West }

Direction.values()           // Direction[] — все значения: [North, South, East, West]
Direction.fromValue(2)         // Direction | null — Direction.East | null если не найдено
Direction.North.toString()   // string — "North"

// использование
for (const d of Direction.values()) {
    console.log(d.toString());
}

const d = Direction.fromValue(userInput);
if (d != null) {
    console.log(d.toString());
}
```

##### enum в switch / match

```typescript
// switch — компилятор выдаёт warning если не все значения покрыты
switch (dir) {
    case Direction.North: ...; break;
    case Direction.South: ...; break;
    case Direction.East:  ...; break;
    case Direction.West:  ...; break;
}

// match — ошибка компилятора если не все значения покрыты (exhaustiveness)
const label = match (dir) {
    Direction.North => "вверх",
    Direction.South => "вниз",
    Direction.East  => "вправо",
    Direction.West  => "влево",
    // _ не нужен — все случаи покрыты
};
```

##### enum vs const enum

| | `enum` | `const enum` |
|---|---|---|
| C-output | `typedef enum` + таблицы | только `typedef enum` |
| `.values()` | ✅ | ❌ |
| `.fromValue()` | ✅ | ❌ |
| `.toString()` | ✅ | ❌ |
| Размер бинаря | больше | минимальный |
| Применение | общий случай | embedded, флаги, константы |

#### Интерфейсы

Два назначения:

**1. Данные без методов** — компилируется в `typedef struct`:
```typescript
interface Point {
    x: f64;
    y: f64;
}

let p: Point = { x: 10.5, y: 20.3 };
```
```c
typedef struct { double x; double y; } Point;
```

**2. Контракт с методами** — компилируется в vtable (fat pointer, как `dyn Trait` в Rust):
```typescript
interface Drawable {
    draw(): void;
    mut resize(factor: f64): void;
}

class Circle implements Drawable {
    draw(): void { ... }
    mut resize(factor: f64): void { ... }
}

let shape: Drawable = new Circle();  // fat pointer: self + vtable
shape = new Rect();                  // ok — другой тип, та же переменная
shape.draw();                        // ok — immutable метод
shape.resize(2.0);                   // ok — mut метод, shape это let

const shape2: Drawable = new Circle();
shape2.draw();                       // ok
shape2.resize(2.0);                  // ошибка: нельзя вызвать mut метод на const
```
```c
typedef struct {
    void (*draw)(void* self);
    void (*resize)(void* self, double factor);
} Drawable_vtable;

typedef struct {
    void* self;
    Drawable_vtable* vtable;
} Drawable;
```

- Класс может реализовывать несколько интерфейсов: `class Foo implements A, B`
- `mut` методы интерфейса подчиняются тем же правилам что и `mut` методы класса: `const` переменная запрещает вызов, `let` — разрешает
  ```typescript
  interface Drawable {
      draw(): void;
  }

  interface Resizable {
      mut resize(factor: f64): void;
  }

  class Circle implements Drawable, Resizable {
      draw(): void { ... }
      mut resize(factor: f64): void { ... }
  }

  let shape: Drawable = new Circle();    // ok
  let resizable: Resizable = new Circle(); // ok
  ```
- Если класс не реализует все методы интерфейса — ошибка компилятора

#### Классы

**Наследования нет** — только композиция. `extends` отсутствует.

```typescript
// вместо наследования — композиция
class Animal {
    name: string;
    mut speak(): string { ... }
}

class Dog {
    animal: Animal;  // композиция
    breed: string;
}
```

`mut` определяет семантику `this`. Модификаторы методов и полей:

| Модификатор | Описание |
|-------------|----------|
| `public` | виден везде (по умолчанию) |
| `private` | виден только внутри класса |
| `static` | метод на классе, нет `this` |
| `mut` | `this` — `Mut<Self>`, иначе `Ref<Self>` |
| `move` | `this` — `Self` (owned), объект перемещается в метод при вызове |

```typescript
class Counter {
    private value: i32 = 0;

    public get(): i32 {                  // this — Ref<Counter>
        return this.value;
    }

    public mut increment(): void {       // this — Mut<Counter>
        this.value++;
    }

    private mut reset(): void {          // private mutable
        this.value = 0;
    }

    static create(): Counter {           // static — нет this
        return new Counter();
    }

    private static default(): Counter {  // private static
        return new Counter();
    }
}

const c = new Counter();
c.get();        // ok
c.increment();  // ошибка: нельзя вызвать mut метод на const

let c2 = new Counter();
c2.increment(); // ok
```

- `static` + `mut` — недопустимо, ошибка компилятора (нет `this`)
- `protected` — отсутствует (нет наследования)

#### Семантика `this` и доступ к полям

Тип `this` определяет тип `this.field`. Затем применяются **те же правила передачи аргументов** что и для обычных функций — см. матрицу совместимости в разделе "Правила передачи аргументов в функцию":

| Вид метода | `this` тип | `this.field` тип (сложный) | `this.field` тип (примитив) |
|-----------|------------|---------------------------|---------------------------|
| обычный | `Ref<Self>` | `Ref<T>` | copy |
| `mut` | `Mut<Self>` | `Mut<T>` | copy |
| `move` | `Self` (owned) | `T` (owned) | copy |

Тип `this.field` определяется типом `this`. Затем применяются **те же правила из матрицы совместимости** (раздел "Правила передачи аргументов в функцию"):

```typescript
function sendEmail(to: string): void { ... }    // ожидает owned string
function printRef(s: Ref<string>): void { ... } // ожидает borrow

class QueryBuilder {
    query: string;
    params: i32[];

    // обычный метод — this: Ref<Self>, this.query: Ref<string>
    preview(): void {
        printRef(this.query);          // ok — Ref<string> → Ref<string> ✅
        sendEmail(this.query);         // ошибка — Ref<string> → string ❌
                                       // матрица: Ref<T> → T (owned) = запрещено
                                       // hint: clone если string implements Clone
        sendEmail(this.query.clone()); // ok ✅
        console.log(this.params[0]);   // ok — i32 всегда copy ✅
    }

    // mut метод — this: Mut<Self>, this.query: Mut<string>
    mut setQuery(q: string): void {
        this.query = q;                // ok — Mut разрешает запись ✅
        sendEmail(this.query);         // ошибка — Mut<string> → string ❌
                                       // матрица: Mut<T> → T (owned) = запрещено
        sendEmail(this.query.clone()); // ok ✅
    }

    // move метод — this: Self (owned), this.query: string (owned)
    move build(): Query {
        return new Query(this.query, this.params);  // ok — T → T, move ✅
    }
}

let b = new QueryBuilder("SELECT *", [1, 2]);
b.preview();           // ok — b жив ✅
b.setQuery("INSERT");  // ok — b жив ✅
const q = b.build();   // ok — b moved в метод
console.log(b);        // ошибка: b перемещён ❌

const b2 = new QueryBuilder("SELECT *", []);
b2.build();            // ошибка: нельзя вызвать move метод на const ❌
```

`readonly` поле можно записать только в конструкторе:

```typescript
class User {
    readonly id: i32;
    name: string;

    constructor(id: i32, name: string) {
        this.id = id;     // ok
        this.name = name;
    }

    mut rename(newName: string) {
        this.name = newName;  // ok
        this.id = 99;         // ошибка: readonly
    }
}
```

`mut` метод может менять обычные поля, но не `readonly`.

`move` метод передает поля объекта наружу без лишнего копирования, когда исходный объект больше не нужен. Паттерн `Builder`:

```typescript
class QueryBuilder {
    query: string;
    params: i32[];

    // без move — this: Ref<Self>, поля нельзя move, нужен clone:
    build(): Query {
        return new Query(this.query.clone(), this.params.clone()); // лишняя копия данных
    }

    // с move — this: Self (owned), поля можно move, clone не нужен
    move build(): Query {
        return new Query(this.query, this.params);  // move полей — экономия памяти
    }
}

let b = new QueryBuilder("SELECT *", [1, 2, 3]);
const q = b.build();   // b перемещён в метод, данные переданы в Query без копии
console.log(b);        // ошибка: b перемещён — компилятор ловит
```

Конструктор — поля забирают владение (move):

```typescript
class Line {
    start: Point;
    end: Point;

    constructor(start: Point, end: Point) {
        this.start = start;  // move
        this.end = end;      // move
    }
}

const p1 = new Point(0, 0);
const p2 = new Point(1, 1);
const line = new Line(p1, p2);
console.log(p1);  // ошибка: p1 перемещён в line
```

Автогенерация конструктора — если конструктор не написан, компилятор генерирует его из полей:

- Поля **с дефолтом** → параметр со значением по умолчанию
- Поля **без дефолта** → обязательный параметр (в порядке объявления)

```typescript
class User {
    name: string;       // нет дефолта → обязательный параметр
    age: i32 = 0;       // есть дефолт → необязательный параметр
    active: boolean = true;
}
// компилятор генерирует:
// constructor(name: string, age: i32 = 0, active: boolean = true)

new User("Alice");           // ok — name="Alice", age=0, active=true
new User("Alice", 30);       // ok — name="Alice", age=30, active=true
new User("Alice", 30, false); // ok
new User();                  // ошибка: name обязателен

class Point {
    x: f64 = 0.0;
    y: f64 = 0.0;
    // все поля с дефолтом → генерируется конструктор без обязательных параметров
}

let p = new Point();       // ok — x=0.0, y=0.0
let p2 = new Point(1.0);   // ok — x=1.0, y=0.0
```

Если написан явный `constructor` — автогенерация не происходит.

Дефолтные параметры конструктора — вместо перегрузки по количеству:
```typescript
class Point {
    x: f64;
    y: f64;

    constructor(x: f64 = 0.0, y: f64 = 0.0) {
        this.x = x;
        this.y = y;
    }
}

let p1 = new Point();          // x=0.0, y=0.0
let p2 = new Point(1.0);       // x=1.0, y=0.0
let p3 = new Point(1.0, 2.0);  // x=1.0, y=2.0
```

`private` конструктор — для singleton/factory паттернов:
```typescript
class Config {
    private constructor() { ... }

    static create(): Config {
        return new Config();  // ok — внутри класса
    }
}

let c = new Config();         // ошибка: конструктор private
let c = Config.create();      // ok
```

#### `const` vs `let`

- `const obj` — нельзя вызывать `mut` методы, нельзя передать как `Mut`, нельзя move
- `let obj` — можно всё

```typescript
function foo(c: Mut<Counter>) { c.increment(); }

const c = new Counter();
foo(c);   // ошибка: const нельзя передать как Mut

let c2 = new Counter();
foo(c2);  // ok

// move из const — запрещён
const arr = [user1, user2];
let b = arr;       // ошибка: cannot move out of const
                   // hint: use Shared<T> if shared ownership is needed

const arr2: Shared<User[]> = [user1, user2];
let b2 = arr2;     // ok — retain, не move
```

#### For-of цикл

Тип loop-переменной определяется **объявлением** (`const`/`let`), а не источником:

- `for (const item of ...)` — **всегда** `Ref<T>` для сложных типов, copy для примитивов
- `for (let item of ...)` — `Mut<T>`, **только если источник `let`**; если источник `const` — ошибка компилятора

```typescript
const arr = [obj1, obj2, obj3];

for (const item of arr) {    // ok — item: Ref<Obj>
    item.doSomething();       // ok — immutable метод
    item.mutMethod();         // ошибка — item это Ref
}

for (let item of arr) {      // ошибка: источник const, используй for (const item of arr)
}
```

```typescript
let arr = [obj1, obj2, obj3];

for (const item of arr) {    // ok — item: Ref<Obj>
    item.doSomething();       // ok
    item.mutMethod();         // ошибка — item это Ref
}

for (let item of arr) {      // ok — item: Mut<Obj>
    item.mutMethod();         // ok — изменения попадают в arr
    arr.push(obj4);           // ошибка — arr заимствован во время итерации
}
```

Примитивы — `item` всегда копируется независимо от `let`/`const`:

```typescript
let nums = [1, 2, 3];
for (let item of nums) {
    item++;  // warning: изменение копии не имеет эффекта
}

// чтобы изменить элементы — используй индекс:
for (let i = 0; i < nums.length; i++) {
    nums[i]++;  // ok
}
```

#### while / do-while

```typescript
// while — проверка условия до итерации
let i = 0;
while (i < 10) {
    console.log(i);
    i++;
}

// do-while — проверка условия после итерации (тело выполняется минимум 1 раз)
let input: string;
do {
    input = readLine();
} while (input === "");

// break и continue работают как в JS
while (true) {
    const line = readLine();
    if (line === "quit") break;
    if (line === "") continue;
    process(line);
}
```

- `break` — выход из цикла
- `continue` — переход к следующей итерации
- Labeled break/continue для вложенных циклов:

```typescript
outer: while (true) {
    while (true) {
        if (done) break outer;    // выход из внешнего цикла
        if (skip) continue outer; // следующая итерация внешнего цикла
    }
}
```

##### async/await в циклах

`await` разрешён внутри любого цикла (`for`, `for-of`, `while`, `do-while`) при условии что функция `async`. Итерации выполняются **последовательно** — следующая итерация начинается только после завершения `await`.

```typescript
// for-of
async function processAll(ids: i32[]): void {
    for (const id of ids) {
        const user = await fetchUser(id);  // ждём каждый запрос по очереди
        console.log(user.name);
    }
}

// while
async function pollUntilReady(id: i32): Status {
    while (true) {
        const status = await checkStatus(id);
        if (status !== Status.Pending) return status;
        await delay(500);
    }
}

// для параллельного выполнения — Promise.all
async function processAllParallel(ids: i32[]): void {
    const users = await Promise.all(ids.map(id => fetchUser(id)));  // все запросы параллельно
}
```

#### switch / case

Синтаксис как в JS/TS. **Implicit fallthrough запрещён** — забытый `break` или `return` это ошибка компилятора.

```typescript
switch (status) {
    case 200:
        handleOk();
        break;
    case 404:
        handleNotFound();
        break;
    case 500:
    case 503:           // группировка case — ok (оба ведут к одному телу)
        handleError();
        break;
    default:
        handleUnknown();
}
```

- `break` или `return` обязательны в каждом `case` — иначе ошибка компилятора
- Группировка пустых `case` (`case 500: case 503:`) разрешена
- `default` необязателен, но компилятор выдаёт warning если не покрыты все значения enum
- Switch работает на: числовых типах, `string`, `boolean`, enum

#### match

> Синтаксис соответствует [TC39 Pattern Matching proposal](https://github.com/tc39/proposal-pattern-matching) и ожидаемому TypeScript 7.

Expression-based pattern matching. Возвращает значение, exhaustiveness проверяется компилятором.

```typescript
// литералы
const label = match (x) {
    0       => "zero",
    1..10   => "small",
    11..100 => "medium",
    _       => "large",
};

// null
const msg = match (user) {
    null => "not found",
    _    => `Hello, ${user.name}`,
};

// enum
const desc = match (direction) {
    Direction.North => "вверх",
    Direction.South => "вниз",
    Direction.East  => "вправо",
    Direction.West  => "влево",
    // _ не нужен — компилятор проверяет полноту
};

// деструктуризация struct / class
const area = match (shape) {
    { kind: "circle", r }    => Math.PI * r * r,
    { kind: "rect", w, h }   => w * h,
};

// несколько паттернов для одной ветки
const sign = match (n) {
    0            => "zero",
    1 | 2 | 3    => "small positive",
    _            => "other",
};
```

**Правила match:**

- `_` — wildcard, совпадает с чем угодно; обязателен если паттерны не исчерпывающие
- Паттерны проверяются сверху вниз, срабатывает первый совпавший
- Exhaustiveness: если компилятор видит что все случаи покрыты (enum, null + non-null) — `_` не нужен; если не покрыты — ошибка компилятора
- `|` — несколько паттернов для одной ветки
- Диапазон `a..b` — от `a` включительно до `b` не включительно (как везде в TSC)
- Деструктуризация в паттерне — те же правила borrow что и в обычной деструктуризации (только borrow)

**match vs switch:**

| | `switch` | `match` |
|---|---|---|
| Тип | statement | expression (возвращает значение) |
| Exhaustiveness | warning | ошибка компилятора |
| Паттерны | только равенство | литералы, диапазоны, деструктуризация, `\|` |
| Fallthrough | запрещён | нет (каждая ветка — отдельное выражение) |

#### Доступ к полям и деструктуризация

##### Доступ к полю — borrow по умолчанию

Обращение к полю сложного типа без аннотации возвращает `Ref`:

```typescript
const user = new User("Alice", [1, 2, 3]);

const name = user.name;    // Ref<string> — borrow, user жив
const age = user.age;      // i32 — copy (примитив)

console.log(user);         // ok — user не тронут
console.log(user.name);    // ok
```

Чтобы переместить поле — явная аннотация типа владельца:

```typescript
const name: string = user.name;  // string (T) — move
console.log(user.name);          // ошибка: поле перемещено
console.log(user.age);           // ok — остальные поля живы
console.log(user);               // ошибка: нельзя использовать user целиком после move поля
```

##### Деструктуризация — сахар для borrow-доступа к полям

Деструктуризация **всегда** делает borrow для сложных типов и copy для примитивов. Move через деструктуризацию невозможен.

```typescript
const { name, age } = user;
// эквивалентно:
// const name = user.name;  → Ref<string>  (borrow, не move)
// const age = user.age;    → i32 (copy)
```

`user` остаётся жив после деструктуризации:

```typescript
const user = new User("Alice", 30, [1, 2, 3]);
const { name, age, scores } = user;
// name: Ref<string>, age: i32, scores: Ref<i32[]>

console.log(user);   // ok — ничего не перемещено
console.log(name);   // ok
console.log(scores); // ok
```

Для move — только явное присвоение с аннотацией типа (не деструктуризация):

```typescript
const scores: i32[] = user.scores;  // move — явная аннотация
const name = user.name;             // Ref<string> — borrow
console.log(user.scores);           // ошибка: поле перемещено
console.log(user.name);             // ok
```

#### Срезы

По умолчанию срез — borrow (`Ref`), исходный массив остаётся жив. Явная аннотация типа даёт owned копию:

```typescript
const arr = [1, 2, 3, 4, 5];

const s = arr[1..3];          // Ref<i32[]> — borrow, arr жив
const s: i32[] = arr[1..3];   // i32[] — owned копия [2, 3]
```

Borrow-срез блокирует мутацию источника пока жив:

```typescript
let arr = [1, 2, 3, 4, 5];
const s = arr[1..3];   // Ref — arr заимствован
arr.push(6);           // ошибка: arr заимствован
```

Отрицательные индексы и открытые срезы:

```typescript
const last = arr[-1];      // последний элемент (copy — примитив)
const tail = arr[1..];     // Ref<i32[]> — с 1 до конца
const init = arr[..-1];    // Ref<i32[]> — всё кроме последнего
const last2 = arr[-2..];   // Ref<i32[]> — последние два
```

#### Move из массива по индексу

```typescript
let ref: User;
{
    const users = [user1, user2, user3];
    ref = users[0];  // попытка move из массива
}  // users умирает → ref dangling
```

```
error: cannot move out of array by index
  --> main.tsc:4
hint: use users.remove(0) to take ownership
```

Исправление:

```typescript
let ref: User;
{
    let users = [user1, user2, user3];
    ref = users.remove(0);  // move с удалением — ok
}
```

#### Мутация коллекции при активном borrow

Borrow элемента = borrow коллекции.

```typescript
let users = [user1, user2, user3];
let u: Ref<User> = users[0];  // borrow на users
users.push(user4);            // ошибка: mut на заимствованном
```

#### Возврат borrow из метода

Возвращаемый `Ref<T>`/`Mut<T>` неявно привязан к `this`:

```typescript
class Config {
    data: string[];

    getFirst(): Ref<string> {
        return this.data[0];  // привязан к this
    }
}

const config = new Config();
const s = config.getFirst();  // ok — s привязан к config
console.log(s);               // ok
```

```typescript
let s: Ref<string>;
{
    const config = new Config();
    s = config.getFirst();  // borrow привязан к config
}  // config умер
console.log(s);  // ошибка: config умер, s dangling
```

#### Borrows в полях класса — запрещено

```typescript
class View {
    data: Ref<User[]>;  // ошибка: нельзя хранить borrow в поле
}
```

Альтернативы:

```typescript
// Владеем данными
class View {
    data: User[];  // owned
}

// Или Shared
class View {
    data: Shared<User[]>;  // ARC
}

// Временный доступ — через параметр метода
function renderView(data: Ref<User[]>) { ... }
```

#### Замыкания

По умолчанию захватывают сложные типы по `Ref`:

```typescript
const items = [1, 2, 3];
const fn = (): i32 => items.length;  // fn держит Ref<items>
fn();  // ok — items жив
```

```typescript
let fn: () => i32;
{
    const items = [1, 2, 3];
    fn = (): i32 => items.length;  // захватывает Ref<items>
}
fn();  // ошибка: items мёртв
```

Для явного управления захватом используется список `[var: Type]` перед параметрами — те же типы что везде:

```typescript
[data: Data]()          // T — move, замыкание становится владельцем
[data: Ref<Data>]()     // Ref — immutable borrow (явно, то же что по умолчанию)
[data: Mut<Data>]()     // Mut — mutable borrow
```

Move-захват решает проблему когда замыкание переживает источник:

```typescript
// ошибка без явного захвата — Ref не может пережить функцию
function makeGreeter(): () => void {
    const name = "Alice";
    return (): void => console.log(name);  // ошибка: name умрёт
}

// ok — name перемещён в замыкание, живёт пока живёт замыкание
function makeGreeter(): () => void {
    const name = "Alice";
    return [name: string](): void => console.log(name);  // ok
}
```

```typescript
// Mut-захват — замыкание мутирует внешний объект
let counter = new Counter();
const inc = [counter: Mut<Counter>]() => counter.increment();
inc();
inc();
```

#### Spread оператор

Spread **потребляет** источник — move. Работает для массивов и объектов. Spread на `const` — ошибка компилятора. **Исключение**: `const Shared<T>` — разрешено, это retain, не move.

**Массивы:**
```typescript
let admins = [admin1, admin2];
const users = [...admins, ...guests];  // ok — move из let
sendEmail(admins);  // ошибка: admins перемещён

const admins = [admin1, admin2];
const users = [...admins];
// ошибка: cannot spread const
// hint: use let, Shared<T>, or [...admins.clone()] if Admin implements Clone
```

**Объекты:**
```typescript
let base = { x: 1, name: "Alice" };
const extended = { ...base, extra: 42 };  // ok — move из let
console.log(base);  // ошибка: base перемещён

const base = { x: 1, name: "Alice" };
const extended = { ...base, extra: 42 };
// ошибка: cannot spread const
// hint: use let, Shared<T>, or { ...base.clone(), extra: 42 } if type implements Clone
```

**`Shared<T>` — const разрешён** (retain, не move):

```typescript
const base: Shared<Item[]> = [item1, item2];
const listA = [...base, itemA];  // ok — retain
const listB = [...base, itemB];  // ok — retain

const obj: Shared<Config> = { x: 1 };
const a = { ...obj, y: 2 };  // ok — retain
const b = { ...obj, z: 3 };  // ok — retain
```

### Compiler Architecture

#### Фазы компиляции

```
Parse → AST → Typecheck → Lower to IR → Ownership Analysis → Codegen
                                 ↑              ↑
                            Flatten CFG    Borrow checker / ARC injection
```

#### IR (Intermediate Representation)

IR — linear представление между AST и C. Flattens вложенность, делает порядок выполнения явным.

**Операции:**

| Операция | Описание |
|----------|----------|
| `alloc x, value` | Создать переменную, владелец |
| `borrow x, source, imm/mut` | Заимствовать (`Ref`/`Mut`) |
| `retain x` | Увеличить refcount (`Shared`) |
| `release x` | Уменьшить refcount |
| `call fn, args` | Вызов функции |
| `assign x, value` | Присвоение |
| `drop x` | Конец жизни переменной |
| `return value` | Возврат |
| `branch cond, label1, label2` | Условный переход |
| `jump label` | Безусловный переход |

**Пример трансформации:**

TypeScript:
```typescript
let users = [user1, user2, user3]
const first = users[0]
push(users, user4)
```

IR:
```
alloc users, [user1, user2, user3]
borrow first, users[0], imm  // first = Ref<User>
call push, [users, user4]    // ← ошибка: users заимствован
drop first
drop users
```

**Почему IR:**

- Явный порядок операций (не как в AST)
- Простые проверки для borrow checker
- Легко вставлять `retain`/`release` для `Shared<T>`
- Почти 1:1 с C — кодоген тривиальный

### Module System

- Синтаксис как в TypeScript: именованные `export` / `import { } from ""`
- Один файл = один модуль
- `export default` — отсутствует, только именованные экспорты
- **Циклические импорты разрешены** — компилятор автоматически генерирует forward declarations в C

#### Export

```typescript
export class User { ... }
export interface Drawable { ... }
export type UserId = i32;
export type Nullable<T> = T | null;
export function helper(): void { ... }
export const MAX: i32 = 100;

// реэкспорт
export { User, helper } from "./user";
```

#### Import

```typescript
// обычный импорт — runtime, генерирует #include "user.h" в C
import { User, createUser } from "./user";

// type-only импорт — только compile-time, генерирует forward declaration в C
import type { UserId, Drawable } from "./user";
```

`import type` важен для кодогена — позволяет избежать лишних `#include` в C:
```c
// import { User } → в .c файле:
#include "user.h"

// import type { UserId } → в .h файле:
typedef int32_t UserId;  // или forward declaration
```

#### Порядок инициализации модулей

Каждый модуль с module-level переменными получает `_init()` функцию в C. Порядок вызовов определяется **топологической сортировкой** графа импортов — зависимости инициализируются раньше.

Для правильного порядка компилятор строит граф зависимостей и делает топологическую сортировку. Результат — одна функция `tsc_init_all()` с правильным порядком:

```c
// сгенерировано компилятором
static void tsc_init_all() {
    a_type_init();  // нет зависимостей — первый
    bar_init();     // зависит от a_type
    foo_init();     // зависит от a_type и bar
}

int main() {
    tsc_init_all();
    // ... код пользователя
}
```

Два случая циклических зависимостей:

- **Цикл через типы и функции** — разрешён, компилятор генерирует forward declarations в .h файлах
- **Цикл через module-level переменные** — физически неразрешимо, ошибка компилятора:
  ```
  error: circular initialization dependency detected
    src/a.tsc:2  aValue depends on bValue
    src/b.tsc:2  bValue depends on aValue
  hint: move one of these values into a function
  ```
  Пример в коде:
  ```typescript
  a.tsc: const aVal = bFunc()   // нужен b
  b.tsc: const bVal = aFunc()   // нужен a
  // кто инициализируется первым?
  ```

#### Точка входа

Поле `"main"` в `tsc.packages.json` указывает главный файл проекта. Компилятор определяет тип проекта по содержимому файла:

- Есть top-level statements → **executable**, компилятор генерирует `main()` в C
- Только `export` декларации → **library**, `main()` не генерируется

```json
{
  "name": "myapp",
  "main": "src/index.tsc"
}
```

```json
{
  "name": "myapp",
  "builds": {
    "server": { "main": "src/server.tsc" },
    "cli": { "main": "src/cli.tsc" }
  }
}
```

`"main"` внутри build config переопределяет верхний уровень для конкретного билда.

**Без `tsc.packages.json`** (одиночный скрипт):
- Один файл с top-level кодом → он entry point: `tsclang build hello.tsc`
- Несколько файлов с top-level кодом → ошибка компилятора

**Правила:**

| Ситуация | Результат |
|---------|-----------|
| `"main"` + top-level код в файле | executable |
| `"main"` + только exports | library |
| Нет конфига + один файл с top-level кодом | он entry point |
| Нет конфига + несколько файлов с top-level кодом | ошибка компилятора |

**Ошибки:**

- `"main"` не указан, несколько файлов с top-level кодом:
  ```
  error: multiple files with top-level statements, entry point is ambiguous
  hint: add "main" to tsc.packages.json
  ```

- `"main"` указан, файл не существует:
  ```
  error: main file not found: src/index.tsc
  ```

- Типы импортов по источнику:
  - `"./path"` — локальный файл
  - `"libc"`, `"libm"` и др. — встроенные декларации + генерирует `#include <...>` в C
    ```typescript
    import { printf } from "libc";
    // компилятор знает сигнатуру printf — есть встроенный libc.d.tsc
    // генерирует в C: #include <stdio.h>
    ```
  - остальное — внешние пакеты из реестра
- **Файлы деклараций `.d.tsc`** — типизация внешнего кода:
  - Для C-библиотек без встроенных деклараций
  - Для `.tsc` модулей без исходников (бинарные пакеты)
  - Сообщество публикует `.d.tsc` для популярных C-либ в реестре
- **Если деклараций нет** — тип `any`, компилятор не ругается

### Build System & Package Manager

#### Build Profiles

Именованные профили сборки в `tsc.packages.json`:

```json
{
  "builds": {
    "desktop": {},
    "avr": {
      "target": "avr",
      "mcu": "atmega328p",
      "defaultNumber": "f32"
    },
    "release": {
      "optimize": "O2"
    }
  }
}
```

#### Поля build конфига

| Поле | Описание | Дефолт |
|------|----------|--------|
| `"main"` | entry point файл (override верхнего уровня) | наследует |
| `"emit"` | тип вывода: `"c"`, `"binary"`, `"hex"`, `"lib"` | `"binary"` для desktop, `"hex"` для embedded |
| `"outDir"` | директория вывода | `./build/<name>` |
| `"target"` | целевая платформа | текущая платформа |
| `"mcu"` | модель MCU (только для embedded) | — |
| `"optimize"` | уровень оптимизации (`O0`..`O3`, `Os`) | `O0` |
| `"defaultNumber"` | тип для `number` | `f64` |
| `"runtime"` | async runtime: `"libuv"`, `"io_uring"`, `"embedded"` | `"libuv"` для desktop, `"embedded"` для embedded |
| `"binaryMode"` | `"normal"` или `"small"` | `"normal"` |

**`"binaryMode": "small"`** — режим для сильно ограниченных embedded платформ (AVR Arduino: 32 КБ flash). Включает type erasure для generic pointer types:
- `Array<T>` где T — pointer/complex type → единая реализация через `void*` (одна копия кода для всех Array типов)
- Монорфизация только для примитивов (`Array<i32>`, `Array<u8>` — остаются отдельными)
- Enum string tables — не генерируются, `.toString()` возвращает номер
- Трейдофф: меньше кода → меньше flash; но нет type-safe runtime проверок для erased типов

#### Pipeline сборки

```
src/*.tsc  →  <outDir>/c/*.c + CMakeLists.txt  →  <outDir>/myapp (или .hex)
              ↑                                    ↑
           tsclang build (transpile)          cmake + gcc/avr-gcc
```

Структура `outDir`:
```
build/desktop/
  c/              ← сгенерированные .c и .h
  CMakeLists.txt
  myapp           ← бинарь (emit: binary)

build/avr/
  c/
  CMakeLists.txt
  myapp.hex       ← (emit: hex)
```

#### CLI команды

```bash
tsclang init                  # создать новый проект
tsclang build                 # собрать проект
tsclang install               # установить зависимости из tsc.packages.json
tsclang update                # обновить зависимости, пересоздать lock-файл
tsclang clean                 # удалить build артефакты (outDir)
tsclang run                   # собрать дефолтный build + запустить бинарь
tsclang lint                  # отформатировать все .tsc файлы проекта
tsclang lint --check          # проверить форматирование без изменений (CI)
```

- Если build не указан — используется `"desktop"` или первый в списке
- Параметры build переопределяют дефолтные настройки компилятора

#### `tsclang install` vs `tsclang update`

| | `tsclang install` | `tsclang update` |
|---|---|---|
| Lock-файл существует | использует точные версии из lock | игнорирует lock, ищет новые версии |
| Lock-файл отсутствует | резолвит по constraints, создаёт lock | то же |
| Результат | воспроизводимая установка | обновлённый lock-файл |

#### `tsclang update` подробно

Поведение по типу зависимости:

| Тип | Поведение |
|-----|-----------|
| semver `^1.0.0` | обновляет до последней версии в рамках constraint |
| git `@main` (ветка) | pull latest commit, обновляет lock |
| git `@1.0.0` (тег) | зафиксирован — пропускает, выводит предупреждение |
| git `@a1b2c3d` (коммит) | зафиксирован — пропускает, выводит предупреждение |
| url | нет реестра — пропускает, выводит предупреждение |

```bash
tsclang update            # обновить всё что можно
tsclang update <dep>      # обновить конкретную зависимость
tsclang update sdl2       # обновить только sdl2
tsclang update sdl2 json  # обновить несколько
```

После `tsclang update` необходимо запустить `tsclang install` для применения изменений.

#### `tsclang build` подробно

```bash
tsclang build                 # собрать дефолтный build
tsclang build <name>          # собрать конкретный build
tsclang build hello.tsc       # одиночный файл → binary

# флаги (override конфига)
tsclang build --emit c        # только генерация C
tsclang build --emit binary   # C + компиляция в бинарь
tsclang build --emit hex      # C + avr-gcc → .hex
tsclang build --outDir ./dist # переопределить outDir
```

- Если build не указан — используется `"desktop"` или первый в списке
- Параметры build переопределяют дефолтные настройки компилятора

#### `tsclang run` подробно

```bash
tsclang run                   # собрать дефолтный build + запустить бинарь
tsclang run <name>            # собрать конкретный build + запустить бинарь
tsclang run -- --foo bar      # передать аргументы в запускаемый бинарь
```

`tsclang run` = `tsclang build` + запуск скомпилированного бинаря. Только для `emit: "binary"`.

```
tsclang run
  │
  ├─ 1. tsclang build        ← компилирует .tsc → .c → бинарь
  └─ 2. exec <outDir>/myapp  ← запускает бинарь, stdout/stderr в терминал
```

- Если `emit` не `"binary"` — ошибка: `error: tsclang run requires emit: "binary"`
- Код выхода бинаря пробрасывается как код выхода `tsclang run`
- Аргументы после `--` передаются напрямую в бинарь:
  ```bash
  tsclang run -- --port 8080 --verbose
  # запускает: ./build/desktop/myapp --port 8080 --verbose
  ```

#### `tsclang init` подробно

```bash
tsclang init             # создать проект в текущей директории
tsclang init myapp       # создать проект в новой директории myapp
```

`tsclang init` создаёт:

```
myapp/
  src/
    index.tsc
  tsc.packages.json
```

Минимальный `tsc.packages.json`:

```json
{
  "name": "myapp",
  "version": "1.0.0",
  "main": "src/index.tsc",
  "builds": {
    "desktop": { "emit": "binary", "outDir": "build/desktop" }
  }
}
```

#### Быстрый старт

```bash
npm install -g tsclang   # установить компилятор
tsclang init myapp       # создать проект
cd myapp
tsclang install          # установить зависимости
tsclang run              # собрать и запустить
```

#### Источники зависимостей (все варианты вместе)

```json
{
  "dependencies": {
    "mylib": "^1.0.0",
    "sdl2": ">=2.28.0",
    "json": {
      "git": "github.com/nlohmann/json@3.11.0"
    },
    "libfoo": {
      "git": "github.com/someuser/libfoo@1.0.0",
      "build": "make PREFIX={install_dir}",
      "headers": "include/",
      "lib": "libfoo.a"
    },
    "libbaz": {
      "url": "https://some.site.com/download/lib_1.0.0.zip",
      "version": "1.0.0",
      "build": "make PREFIX={install_dir}",
      "headers": "include/",
      "lib": "libbaz.a"
    }
  }
}
```

#### Версионирование

- **Semver строка** — полный semver: `^1.0.0`, `~1.2.0`, `>=1.0.0`, `1.0.0`
- **Git** — только точный тег (`@2.28.0`), коммит (`@a1b2c3d`), или ветка (`@main`); semver операторы не поддерживаются
- **URL** — версия задаётся обязательным полем `version:` (используется для кэша и lock-файла)

#### Резолюция semver-зависимостей

Для зависимостей заданных строкой компилятор ищет в следующем порядке:

1. **Система** — `pkg-config` проверяет наличие и версию
   - Найдена и версия удовлетворяет constraint → используем, ничего не скачиваем
   - Не найдена или версия не подходит → переходим к шагу 2
2. **Реестр** (`tsc-lang.org`) — скачивает и собирает нужную версию
   - _(реестр не реализован)_ → ошибка компилятора с подсказкой:
     ```
     error: sdl2 >=2.28.0 not found
     hint: install it manually, e.g.:
       apt install libsdl2-dev
       brew install sdl2
     ```

#### URL-зависимости (zip-архив)

- Поле `url:` — прямая ссылка на `.zip` архив
- Поле `version:` — **обязательно**, используется для именования кэша и lock-файла
- Поддерживаемые форматы архивов: `.zip`, `.tar.gz`, `.tar.bz2`, `.tar.xz`
- Flow:

  ```bash
  # 1. Скачивает архив
  curl -L https://some.site.com/download/lib_1.0.0.zip \
       -o ~/.tsc/cache/libbaz@1.0.0.zip

  # 2. Распаковывает
  unzip ~/.tsc/cache/libbaz@1.0.0.zip -d ~/.tsc/cache/libbaz@1.0.0/
  ```

- Дальше — тот же порядок инструкций что и для git:
  1. **CMake** — есть `CMakeLists.txt` → auto-flow
  2. **`tsc.build.json`** — есть в архиве → используем
  3. **inline в `tsc.packages.json`** — описываем сами
  4. Ничего → ошибка компилятора
- В lock-файле фиксируется URL + `sha256` архива для воспроизводимости

#### Git-зависимости

- Версия по тегу (`@2.28.0`), ветке (`@main`) или коммиту (`@a1b2c3d4`)
- Lock-файл `tsc.packages.lock` — фиксирует точные коммиты для воспроизводимости
- Сборка скачанной либы — приоритет поиска инструкций:
  1. **CMake** — есть `CMakeLists.txt` в репо → поддерживается автоматически
  2. **`tsc.build.json`** — есть в репо библиотеки → используем его
  3. **inline в `tsc.packages.json`** — описываем сборку прямо в своём проекте
  4. Ничего из вышеперечисленного → ошибка компилятора
- `tsc.build.json` в корне репо библиотеки (удобство для авторов либ, чтобы пользователи не описывали сборку вручную):
  ```json
  {
    "build": "make PREFIX={install_dir}",
    "headers": "include/",
    "lib": "libfoo.a"
  }
  ```

##### CMake auto-flow

Когда в репо есть `CMakeLists.txt`, компилятор запускает стандартный cmake pipeline:

```bash
# 1. Клонирует репо в кэш
git clone github.com/someuser/libfoo@1.0.0 ~/.tsc/cache/libfoo@1.0.0

# 2. Конфигурирует — cmake_options из tsc.packages.json пробрасываются как -D флаги
cmake -S ~/.tsc/cache/libfoo@1.0.0 \
      -B ~/.tsc/cache/libfoo@1.0.0/_build \
      -DCMAKE_INSTALL_PREFIX=~/.tsc/cache/libfoo@1.0.0/_install \
      -DBUILD_SHARED_LIBS=OFF \
      -DCMAKE_BUILD_TYPE=Release \
      -DFOO_BUILD_TESTS=OFF \      # ← из cmake_options
      -DFOO_USE_SSL=ON             # ← из cmake_options

# 3. Собирает
cmake --build ~/.tsc/cache/libfoo@1.0.0/_build --parallel

# 4. Устанавливает в _install/
cmake --install ~/.tsc/cache/libfoo@1.0.0/_build
```

После install — стандартная структура:

```
_install/
  include/        ← headers
  lib/            ← libfoo.a
  lib/cmake/      ← FooConfig.cmake (если есть)
```

Линковка в генерируемый `CMakeLists.txt` проекта — два варианта:

```cmake
# Вариант A: есть FooConfig.cmake / foo-config.cmake → используем find_package
find_package(Foo REQUIRED
    PATHS ~/.tsc/cache/libfoo@1.0.0/_install
    NO_DEFAULT_PATH)
target_link_libraries(myapp PRIVATE Foo::Foo)

# Вариант B: config-файла нет → прописываем пути напрямую
target_include_directories(myapp PRIVATE ~/.tsc/cache/libfoo@1.0.0/_install/include)
target_link_libraries(myapp PRIVATE ~/.tsc/cache/libfoo@1.0.0/_install/lib/libfoo.a)
```

##### cmake_options в tsc.packages.json

Опциональное поле для передачи `-D` флагов при конфигурации:

```json
{
  "dependencies": {
    "libfoo": {
      "git": "github.com/someuser/libfoo@1.0.0",
      "cmake_options": {
        "FOO_BUILD_TESTS": false,
        "FOO_USE_SSL": true,
        "FOO_MAX_CONNECTIONS": 128
      }
    }
  }
}
```

- `boolean` → `ON` / `OFF`
- `number` / `string` → передаётся как есть
- Компилятор всегда добавляет `BUILD_SHARED_LIBS=OFF`, `CMAKE_BUILD_TYPE=Release`, `CMAKE_INSTALL_PREFIX` — пользователь не переопределяет эти три

##### Flow сборки для tsc.build.json / inline

```bash
# Запускает сборку, подставляет {install_dir}
make PREFIX=~/.tsc/cache/libfoo@1.0.0/out
# Забирает результат по путям из инструкций
#    headers: include/  →  ~/.tsc/cache/libfoo@1.0.0/include/
#    lib:     libfoo.a  →  ~/.tsc/cache/libfoo@1.0.0/libfoo.a
# Прописывает пути в генерируемый CMakeLists.txt проекта
target_include_directories(myapp PRIVATE ~/.tsc/cache/libfoo@1.0.0/include)
target_link_libraries(myapp ~/.tsc/cache/libfoo@1.0.0/libfoo.a)
```

#### Реестр

- Централизованный реестр `tsc-lang.org`
- Публикация `.tsc` пакетов и `.d.tsc` деклараций для C-либ

### Error Handling

#### Принцип

Синтаксис как в TypeScript (`throw`, `try`/`catch`/`finally`), но под капотом компилируется в **Result-структуры в C** — без `setjmp`/`longjmp`. Это даёт:

- **Zero-cost**: нет сохранения регистров на каждом `try`-блоке
- **Безопасный C interop**: нет `longjmp` через сторонний C-код
- **Корректный ownership**: обычный control flow, компилятор знает все owned переменные

#### Объявление функции с ошибками

Функция объявляет `throws` в сигнатуре. Компилятор может вывести `throws` автоматически, если внутри есть `throw`, но явное объявление является документацией:

```typescript
function readFile(path: string): string throws IOError { ... }
function fetch(url: string): Response throws IOError | NetworkError { ... }
```

Без `throws` — функция не может содержать `throw` (ошибка компилятора).

#### throw

Бросается экземпляр класса:

```typescript
class IOError {
    message: string;
    constructor(msg: string) { this.message = msg; }
}

function readFile(path: string): string throws IOError {
    if (!exists(path)) {
        throw new IOError(`file not found: ${path}`);
    }
    return read(path);
}
```

#### try / catch / finally

```typescript
try {
    const content = readFile("data.txt");
    console.log(content);
} catch (e: IOError) {
    console.log(e.message);
} finally {
    cleanup();  // выполняется всегда
}
```

Несколько `catch`-блоков — диспатч по типу:

```typescript
try {
    const r = fetch("https://...");
    process(r);
} catch (e: IOError) {
    console.log("IO:", e.message);
} catch (e: NetworkError) {
    console.log("Network:", e.message);
} finally {
    closeConnection();
}
```

Union catch — обработка нескольких типов в одном блоке:

```typescript
try {
    fetch("https://...");
} catch (e: IOError | NetworkError) {
    console.log("error:", e.message);  // тип e = IOError | NetworkError
}
```

#### Union errors

Функция может бросать несколько типов ошибок:

```typescript
function process(path: string): Response throws IOError | NetworkError {
    const content = readFile(path);  // throws IOError
    return fetch(content);           // throws NetworkError
}
```

Компилятор объединяет `throws`-типы автоматически при вызове функций внутри тела.

#### Оператор `?` — propagate

`expr?` — если функция вернула ошибку, немедленно вернуть её из текущей функции. Текущая функция обязана иметь совместимый `throws`:

```typescript
function process(path: string): string throws IOError | NetworkError {
    const content = readFile(path)?;   // propagate IOError
    const r = fetch(content)?;         // propagate NetworkError
    return r.body;
}
```

Несовместимый `throws` — ошибка компилятора:

```typescript
function main(): void {
    const data = readFile("x")?;
    // ошибка: main не объявляет throws, нельзя использовать ?
}
```

#### Оператор `!` — unwrap или panic

`expr!` — если функция вернула ошибку, вызвать `abort()` (runtime panic). Не требует `throws` у текущей функции:

```typescript
function main(): void {
    const content = readFile("config.txt")!;  // panic если ошибка
    console.log(content);
}
```

#### C-output

`throws` меняет C-сигнатуру функции: возвращаемый тип оборачивается в Result-структуру. Для `throws IOError | NetworkError`:

```c
// Генерируется компилятором
typedef enum { _ERR_IO, _ERR_NETWORK } _fetch_err_kind;

typedef struct {
    bool ok;
    union {
        Response value;
        struct {
            _fetch_err_kind _kind;
            union {
                IOError io;
                NetworkError net;
            } _err;
        };
    };
} _Result_Response_IOError_NetworkError;

_Result_Response_IOError_NetworkError fetch(String url) { ... }
```

`try/catch` компилируется в `if/else` по полю `ok` и `_kind`:

```c
_Result_Response_IOError_NetworkError _r = fetch(str("https://..."));
if (_r.ok) {
    Response r = _r.value;
    process(r);
    Response_free(r);
} else if (_r._kind == _ERR_IO) {
    IOError e = _r._err.io;
    printf("IO: %s\n", e.message.data);
    IOError_free(e);
} else if (_r._kind == _ERR_NETWORK) {
    NetworkError e = _r._err.net;
    printf("Network: %s\n", e.message.data);
    NetworkError_free(e);
}
// finally
closeConnection();
```

Оператор `?`:
```c
_Result_String_IOError _r = readFile(str("x"));
if (!_r.ok) return (_Result_String_NetworkError){ .ok = false, ._err = ... };
String content = _r.value;
```

Оператор `!`:
```c
_Result_String_IOError _r = readFile(str("config.txt"));
if (!_r.ok) { fprintf(stderr, "panic\n"); abort(); }
String content = _r.value;
```

#### Ownership при ошибках

Компилятор отслеживает все owned переменные в `try`-блоке. Если выбрасывается ошибка, все уже инициализированные owned переменные корректно освобождаются через обычный control flow — никаких специальных механизмов не нужно, так как это просто `if/else` в C:

```typescript
function process(): void throws IOError {
    const a = new Foo();     // owned
    const b = new Bar();     // owned
    riskyOp()?;              // если ошибка → a и b освобождаются в else-ветке
    use(a, b);
}
```

Генерируется:
```c
// try-ветка
Foo* a = Foo_new();
Bar* b = Bar_new();
_Result_void_IOError _r = riskyOp();
if (!_r.ok) {
    Foo_free(a);   // компилятор генерирует cleanup
    Bar_free(b);
    return (_Result_void_IOError){ .ok = false, ._err = _r._err };
}
use(a, b);
Foo_free(a);
Bar_free(b);
```

#### Ограничения

- `throw` запрещён в функциях без `throws` — ошибка компилятора
- `?` запрещён в функции без `throws` — ошибка компилятора
- Исключения нельзя бросать через C interop границы — функции, объявленные как `extern "C"`, не могут содержать `throws`
- `finally` не может содержать `throw` или `return` — ошибка компилятора (неопределённое поведение)

### Concurrency

#### Уровни модели

TSC разделяет конкурентность на три независимых механизма:

| Механизм | Платформа | Уровень |
|----------|-----------|---------|
| `async/await` | все | стандартный |
| `std/threads` | OS (desktop/server) | продвинутый |
| `@interrupt` | embedded (AVR/Cortex) | системный |

---

#### 1. Async/Await — стандартный способ

##### Архитектура async runtime

```
TSC код (async/await)
        ↓
  компилятор TSC
        ↓
  state machines в C   ← как Rust генерирует Future
        ↓
  Runtime Interface (абстракция)
        ↓
  ┌─────────────┬──────────────┬──────────────┐
  │   libuv     │   io_uring   │  poll loop   │
  │  (desktop)  │   (Linux)    │  (embedded)  │
  └─────────────┴──────────────┴──────────────┘
```

TSC-код не знает какой runtime под капотом — работает с абстракцией. Runtime задаётся в `tsc.packages.json` через поле `"runtime"`. `std/fs`, `std/net`, `std/ws` зависят от этого runtime.

Единственный event loop, один поток исполнения. `Shared<T>` и `Weak<T>` **не атомарны** — никаких накладных расходов. Narrowing через `if (x != null)` безопасен — между проверкой и использованием никакой другой код не выполняется.

```typescript
async function fetchUser(id: i32): User throws NetworkError {
    const conn = await connect("https://api.example.com");
    const data = await conn.get(`/users/${id}`);
    return User.parse(data);
}

async function main(): void {
    const user = await fetchUser(42);
    console.log(user.name);
}
```

На **embedded** `async fn` компилируется в state machine в C — без runtime, без heap:

```c
// async fn → конечный автомат
typedef struct { int _state; /* захваченные переменные */ } FetchUserTask;
bool FetchUserTask_poll(FetchUserTask* t) { switch (t->_state) { ... } }
```

##### Promise<T>

Тип возвращаемого значения `async` функции — `Promise<T>`. Обе записи эквивалентны:

```typescript
async function fetchUser(id: i32): User { ... }           // компилятор выводит Promise<User>
async function fetchUser(id: i32): Promise<User> { ... }  // то же самое явно
```

Создать `Promise<T>` вручную (для оборачивания callback-based API):

```typescript
function delay(ms: i32): Promise<void> {
    return new Promise((resolve, reject) => {
        setTimeout(() => resolve(), ms);
    });
}

function readFile(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!fileExists(path)) reject(new IOError("not found"));
        else resolve(fs.readSync(path));
    });
}
```

- `resolve(value)` — завершает Promise успехом, передаёт значение
- `reject(error)` — завершает Promise ошибкой; тип ошибки должен совпадать с `throws`
- Вызов `resolve` или `reject` после первого вызова — no-op

С error handling:

```typescript
async function fetch(url: string): string throws NetworkError {
    return new Promise((resolve, reject) => {
        httpGet(url, (err, data) => {
            if (err) reject(new NetworkError(err));
            else resolve(data);
        });
    });
}
```

##### Promise.all

Запуск нескольких async задач параллельно:

```typescript
const [users, posts] = await Promise.all([
    fetchUsers(),   // Promise<User[]>
    fetchPosts(),   // Promise<Post[]>
]);

// с error handling — если любая задача бросает, вся группа бросает
const [a, b, c] = await Promise.all([taskA(), taskB(), taskC()]);
```

- Все задачи запускаются одновременно, ждём завершения всех
- Если любая задача завершается ошибкой — `Promise.all` бросает эту ошибку, остальные отменяются
- Типы элементов выводятся компилятором из переданных Promise

##### Promise.any

Ждёт **первого успешного**. Если все задачи завершились ошибкой — бросает ошибку последней:

```typescript
// возвращает первый успешно загруженный ресурс
const data = await Promise.any([
    fetchFromMirror1(url),
    fetchFromMirror2(url),
    fetchFromMirror3(url),
])
```

- Тип результата: `T` (общий тип всех Promise)
- Если хотя бы одна задача успешна — остальные отменяются
- Если все задачи бросают — `Promise.any` бросает ошибку последней завершившейся

##### Promise.race

Ждёт **первого завершившегося** — успех или ошибка:

```typescript
// таймаут через Promise.race
const result = await Promise.race([
    fetchData(url),
    sleep(5000).then(() => { throw new TimeoutError() })
])
```

- Возвращает результат первой завершившейся задачи (или бросает её ошибку)
- Остальные задачи отменяются
- Тип результата: общий тип всех Promise в массиве

##### Promise.allSettled

Ждёт **всех**, собирает результаты включая ошибки — никогда не бросает:

```typescript
type SettledResult<T> =
    | { status: "fulfilled", value: T }
    | { status: "rejected",  reason: Error }

const results = await Promise.allSettled([taskA(), taskB(), taskC()])

for (const r of results) {
    if (r.status == "fulfilled") console.log(r.value)
    else                         console.error(r.reason)
}
```

- Всегда завершается успехом
- Возвращает `SettledResult<T>[]` — по одному элементу на каждую задачу
- Порядок результатов соответствует порядку задач в массиве

**Сравнительная таблица:**

| Метод | Ждёт | При ошибке | Результат |
|-------|------|------------|-----------|
| `Promise.all` | всех | бросает сразу | `T[]` (или кортеж) |
| `Promise.any` | первого успешного | бросает если все упали | `T` |
| `Promise.race` | первого (любого) | бросает если первый упал | `T` |
| `Promise.allSettled` | всех | не бросает | `SettledResult<T>[]` |

##### Правила await

- `await` только внутри `async` функции — иначе ошибка компилятора
- `await` только на `Promise<T>` — `await` на обычном значении ошибка компилятора

```typescript
// ✅ ok
async function foo(): i32 {
    return await bar();   // bar(): Promise<i32>
}

// ❌ await вне async функции
function bad(): void {
    await foo();   // error: await outside async function
}

// ❌ await на не-Promise
async function bad2(): void {
    const x: i32 = 42;
    await x;   // error: cannot await i32, expected Promise<T>
}
```

##### async main

Entry point может быть `async` — компилятор запускает event loop автоматически:

```typescript
async function main(): void {
    const user = await fetchUser(42);
    console.log(user.name);
}
```

На desktop/server — стандартный event loop (libuv или аналог).
На embedded — poll loop, скомпилированный в state machine без heap.

##### Рекурсивные async функции

Обычная async функция компилируется в state machine фиксированного размера — размер известен на этапе компиляции, память на стеке. Рекурсивная async функция требует state machine неизвестного размера → компилятор обнаруживает рекурсию и автоматически размещает state machine на **heap**:

```typescript
// прямая рекурсия — компилятор обнаруживает, выдаёт предупреждение
async function traverse(node: Ref<TreeNode>): void {
    await process(node)
    if (node.left)  await traverse(node.left)   // ← рекурсия
    if (node.right) await traverse(node.right)
}
// warning: async function `traverse` is recursive — state machine heap-allocated
```

```typescript
// взаимная рекурсия — тоже обнаруживается
async function ping(): void { await pong() }
async function pong(): void { await ping() }
// warning: mutual recursion detected (ping ↔ pong) — state machines heap-allocated
```

Поведение по платформам:

| Платформа | Рекурсивная async | Поведение |
|-----------|-------------------|-----------|
| Desktop/server | ✅ | heap allocation, предупреждение компилятора |
| Embedded | ❌ | ошибка компилятора: no heap available |

На **embedded** рекурсивная async функция — ошибка компилятора с подсказкой переписать через явный стек (`u8[]` или `i32[]`) или итеративно.

##### Отмена задач — AbortSignal

Кооперативная отмена async операций. Компилятор вставляет проверку флага автоматически — разработчик пишет только бизнес-логику.

```typescript
const controller = new AbortController()
const signal = controller.signal

// отменяем через 5 секунд
setTimeout(() => controller.abort(new TimeoutError()), 5000)

try {
    const data = await fetch(url, { signal })
} catch (e) {
    if (e instanceof AbortError) console.log("отменено:", e.cause)
}
```

**`AbortController`:**
```typescript
class AbortController {
    readonly signal: AbortSignal
    abort(reason?: Error): void   // idempotent — повторный вызов no-op
}
```

**`AbortSignal`:**
```typescript
class AbortSignal {
    readonly aborted: boolean      // true после abort()
    readonly reason:  Error | null // reason переданный в abort(), или null

    onAbort(callback: () => void): void  // низкоуровневая очистка (close fd, cancel io_uring)

    static timeout(ms: i32): AbortSignal // хелпер — сигнал который отменяется через N мс
}
```

`AbortSignal.timeout(ms)` — удобный хелпер, не нужен лишний `AbortController`:
```typescript
const data = await fetch(url, { signal: AbortSignal.timeout(5000) })
```

**Автоматические проверки компилятора:**

Если функция принимает `signal?: AbortSignal` — компилятор вставляет проверку в начале каждого state в сгенерированной state machine (каждая `await`-точка):

```typescript
// TSC — пишем только логику
async function loadConfig(path: string, signal?: AbortSignal): Config {
    const raw  = await readFile(path)    // ← автопроверка
    const json = await parseJson(raw)   // ← автопроверка
    return validate(json)
}
```

C-output (каждый state начинается с проверки):
```c
case STATE_READ_FILE:
    if (signal && atomic_load(&signal->aborted)) {
        ctx->state = STATE_ERROR;
        ctx->error = signal->reason ? signal->reason : &AbortError_default;
        break;
    }
    // ... логика чтения ...
```

Компилятор также добавляет проверку в начало длинных циклов `for`/`while`, если внутри есть хотя бы одна `await`.

**`signal.onAbort(callback)`** — для очистки ресурсов которые не управляются через `await`:

```typescript
async function readSocket(fd: i32, signal?: AbortSignal): Buffer {
    signal?.onAbort(() => close(fd))   // закрываем fd при отмене
    const data = await recv(fd)
    return data
}
```

Callbacks вызываются **синхронно** в том потоке который вызвал `abort()`. Никакого `await` внутри callback — ошибка компилятора.

**`AbortError`** — ошибка которую бросает state machine при обнаружении отменённого сигнала:

```typescript
class AbortError extends Error {
    cause: Error | null   // reason из controller.abort(reason)
}
```

**Ownership при отмене — cleanup всегда выполняется:**

Когда state machine обнаруживает `signal.aborted`, она не прерывается немедленно — она переходит в режим **unwind**: проходит все cleanup-состояния для живых ресурсов точно так же, как при обычном завершении или ошибке. Owned ресурсы всегда освобождаются:

```typescript
async function processFile(path: string, signal?: AbortSignal): Buffer {
    const file = await openFile(path)       // file: owned FileHandle
    // ← если signal.aborted здесь → unwind: file._free() вызывается автоматически
    const data = await readAll(file)
    // ← если signal.aborted здесь → unwind: data._free() + file._free()
    return data
}
```

C-output — при отмене state machine переходит в `STATE_CLEANUP`, не в немедленный выход:
```c
case STATE_READ_ALL:
    if (signal && atomic_load(&signal->aborted)) {
        ctx->error = signal->reason ? ... : &AbortError_default;
        ctx->state = STATE_CLEANUP;   // → cleanup, не abort
        break;
    }
    // ...

case STATE_CLEANUP:
    if (ctx->file) FileHandle_free(ctx->file);   // owned ресурсы освобождаются
    ctx->state = STATE_ERROR;
    break;
```

C-output — `AbortSignal` это `Readonly`-подобная структура:
```c
struct AbortSignal {
    atomic_bool  aborted;
    Error*       reason;       // null если нет причины
    AbortCallback* callbacks;  // linked list onAbort-обработчиков
};
```

**Взаимодействие с `Promise.race`:**
```typescript
// AbortController позволяет остановить проигравшие задачи
const ctrl = new AbortController()

const result = await Promise.race([
    fetchFromA(url, { signal: ctrl.signal }),
    fetchFromB(url, { signal: ctrl.signal }),
])

ctrl.abort()   // победитель уже вернул результат, проигравший прекратит работу при следующей await
```

---

#### 2. Threads (std/threads) — продвинутый уровень

Только там где есть OS. Потоки работают как **изоляты** — без общей памяти. Связь через каналы (передача владения) или через `Atomic<T>` / `AtomicArray<T>`.

##### Atomic<T>

Единственный способ разделить значение между потоками без канала. Heap-allocated, встроенный атомарный ref count. Compiler делает escape analysis: если `Atomic<T>` не уходит в `Thread.spawn` — размещается на стеке без ref count.

```typescript
import { Atomic, AtomicArray, LoadOrdering, StoreOrdering, RmwOrdering } from "std/threads"

const counter = new Atomic<i32>(0)

Thread.spawn(() => {
    // компилятор: counter._retain() перед spawn
    // компилятор: counter._release() в конце потока
    counter.fetchAdd(1, RmwOrdering.AcqRel)
})

counter.load(LoadOrdering.Acquire)          // i32
counter.store(0, StoreOrdering.Release)     // void
counter.fetchAdd(1, RmwOrdering.AcqRel)     // i32 — старое значение
counter.fetchSub(1, RmwOrdering.AcqRel)     // i32
counter.fetchAnd(0xFF, RmwOrdering.AcqRel)  // i32
counter.fetchOr(0x01,  RmwOrdering.AcqRel)  // i32
counter.fetchXor(0x01, RmwOrdering.AcqRel)  // i32
counter.swap(42, RmwOrdering.AcqRel)        // i32 — старое значение
counter.compareExchange(
    expected, desired,
    RmwOrdering.AcqRel,   // success ordering
    LoadOrdering.Acquire  // failure ordering — провал только читает
): { success: boolean, value: i32 }
```

Memory ordering типы — компилятор запрещает неверные комбинации:

```typescript
enum LoadOrdering  { Relaxed, Acquire, SeqCst }           // только для load / failure
enum StoreOrdering { Relaxed, Release, SeqCst }           // только для store
enum RmwOrdering   { Relaxed, Acquire, Release, AcqRel, SeqCst }  // read-modify-write
```

C-output:
```c
struct Atomic_i32 {
    _Atomic int32_t value;
    atomic_size_t ref_count;
};
```

##### AtomicArray<T>

Массив атомарных значений — одна аллокация, все элементы атомарны. Использует C99 Flexible Array Member.

```typescript
// инициализация
const arr = new AtomicArray<i32>(1024)          // нулями, размер 1024
const arr = new AtomicArray<i32>([1, 2, 3, 4]) // из литерала — без двойного цикла
const arr = new AtomicArray<i32>(existing)      // из i32[] — move, без двойного цикла

arr.load(0, LoadOrdering.Acquire)              // i32
arr.store(0, 42, StoreOrdering.Release)        // void
arr.fetchAdd(0, 1, RmwOrdering.AcqRel)         // i32
arr.compareExchange(0, expected, desired,
    RmwOrdering.AcqRel,
    LoadOrdering.Acquire
)                                              // { success: boolean, value: i32 }
arr.length                                     // i32 — bounds checking при каждом обращении
```

C-output (FAM — одна аллокация):
```c
struct AtomicArray_i32 {
    atomic_size_t ref_count;
    size_t length;
    _Atomic int32_t data[];  // данные идут сразу за метаданными (C99 FAM)
};
// аллокация: malloc(sizeof(struct AtomicArray_i32) + sizeof(int32_t) * n)
```

Заметки компилятора:
- **compareExchange zero-cost**: `const { success, value } = arr.compareExchange(...)` — компилятор не создаёт временную структуру на стеке, переменные используются напрямую
- **Relaxed на x86/ARM практически бесплатен** — используй `RmwOrdering.Relaxed` для счётчиков профилировщика и статистики где порядок не важен; значительно быстрее чем JS `Atomics` который всегда использует более тяжёлую семантику
- **Bounds checking**: `length` хранится в структуре — компилятор вставляет проверку индекса при каждом обращении к элементу

##### Правила Thread.spawn (обновлено)

| Тип | Разрешено | Поведение |
|-----|-----------|-----------|
| Owned `T` | ✅ | неявный move |
| Примитив | ✅ | copy |
| `Atomic<T>` | ✅ | retain/release автоматически |
| `AtomicArray<T>` | ✅ | retain/release автоматически |
| `Readonly<T>` | ✅ | retain/release автоматически |
| `Ref<T>` / `Mut<T>` | ❌ | ошибка компилятора |
| `Shared<T>` / `Weak<T>` | ❌ | ошибка компилятора |

Только там где есть OS. Потоки работают как **изоляты** — без общей памяти. Связь через каналы с передачей владения или через `Atomic<T>`.

##### channel<T>

**Bounded MPMC** — кольцевой буфер, одна аллокация. Capacity обязателен.

```typescript
import { Thread, channel, select, after } from "std/threads"

const [tx, rx] = channel<Message>(128)   // capacity = 128

// sender
await tx.send(msg)         // move владения в канал; ждёт если полный (backpressure)
tx.trySend(msg)            // boolean — false если полный, не блокирует
tx.close()                 // закрыть канал; получатель вычитает остаток, затем получает null

// receiver
const msg = await rx.recv()   // Message | null — null если канал закрыт и пуст
rx.tryRecv()                  // Message | null — не блокирует
```

Ownership: `await tx.send(msg)` — move `msg` в канал. При удалении канала с непрочитанными элементами компилятор вызывает деструкторы всех оставшихся объектов.

C-output — кольцевой буфер с MPMC:
```c
typedef struct {
    pthread_mutex_t  mutex;
    pthread_cond_t   not_full;
    pthread_cond_t   not_empty;
    void**           buf;          // ring buffer
    size_t           capacity;
    size_t           head, tail, count;
    atomic_size_t    ref_count;
    bool             closed;
} Channel;
```

##### select

Ждёт первого готового из нескольких каналов. Ровно одно поле результата non-null.

```typescript
const result = await select({
    msg:     rx1.recv(),     // Message | null
    err:     errCh.recv(),   // AppError | null
    timeout: after(500)      // null — сигнал таймаута
})

if (result.msg)      handleMsg(result.msg)
else if (result.err) handleErr(result.err)
else                 handleTimeout()
```

`after(ms)` — Timer Task в event loop, не полноценный канал (нет аллокации буфера).

Fairness: перед регистрацией callbacks компилятор обходит каналы в случайном порядке через `tryRecv()`. Если хотя бы один готов — возвращает сразу без регистрации в event loop.

C-output — SelectState:
```c
typedef struct {
    void*    channel;      // указатель на канал или таймер
    void*    result_buf;   // куда писать значение
    size_t   val_size;     // сколько байт копировать
    int      arm_id;       // индекс → имя поля (msg=0, err=1, timeout=2)
} SelectArm;

typedef struct {
    SelectArm*    arms;
    size_t        count;
    atomic_bool   resolved;   // CAS — только один arm побеждает
    atomic_size_t ref_count;  // = count; каждый callback делает release()
    void*         promise;    // резолвить при победе
} SelectState;
```

Результат select — tagged union (экономия стека: в каждый момент заполнено ровно одно поле):
```c
struct SelectResult {
    int arm_id;   // дискриминант: 0=msg, 1=err, 2=timeout
    union {
        Message*  msg;
        AppError* err;
        // для timeout поле не нужно
    } data;
};
```
Компилятор генерирует `SelectResult` по конкретному вызову `select{}` — типы в union известны на этапе компиляции.

Жизненный цикл `SelectState`: `ref_count = arms_count`. Каждый callback (победитель или нет) делает `dec_ref`. Последний вошедший освобождает память. После победы одного — остальные отписываются от своих каналов.

##### Readonly<T>

Глубоко иммутабельная обёртка для zero-copy sharing крупных данных между потоками. Compile-time проверка: все поля рекурсивно должны быть примитивами, `string`, `Atomic<T>`, `AtomicArray<T>` или `Readonly<U>`. Любое мутабельное поле — ошибка компилятора.

```typescript
import { Readonly } from "std/threads"

struct Config {
    maxRetries: i32
    timeout:    f64
    hosts:      string[]
}

// создаём один раз — передаём во все потоки
const cfg = new Readonly(new Config {
    maxRetries: 3,
    timeout:    5000.0,
    hosts:      ["a.example.com", "b.example.com"]
})

Thread.spawn(() => {
    // компилятор: cfg._retain() перед spawn
    // компилятор: cfg._release() в конце потока
    console.log(cfg.maxRetries)   // ✅ чтение безопасно из любого потока
    cfg.maxRetries = 5            // ❌ ошибка компилятора: Readonly
})
```

`new Readonly(obj)` — move `obj` внутрь. После этого исходный `obj` недоступен. Нельзя создать `Readonly<T>` если `T` содержит `Shared<U>`, `Weak<U>`, `Ref<U>`, `Mut<U>` или мутабельное поле — ошибка компилятора.

C-output — одна аллокация (`atomic_size_t ref_count` + inline данные):
```c
struct Readonly_Config {
    atomic_size_t ref_count;
    Config data;               // данные сразу за счётчиком
};
// аллокация: malloc(sizeof(struct Readonly_Config))
```

Retain/release генерируется компилятором автоматически на границе `Thread.spawn`. `ref_count` доходит до нуля → вызов деструктора `data` → `free`.

Зачем не `const`: `const` локальная переменная — это гарантия компилятора только в текущем потоке. `Readonly<T>`:
1. **Thread-safe** — атомарный ref count, safe для `Thread.spawn`
2. **Deep** — рекурсивная проверка; `const obj` может хранить `Shared<T>` внутри
3. **Owned** — автоматическое управление памятью

Типичное использование: конфиги, lookup-таблицы, скомпилированные шейдеры, статичные данные уровня — один раз создать, раздать во все потоки без копирования.

```typescript
// ✅ Readonly<T> с Atomic<T> внутри — допустимо
struct Stats {
    hits:   Atomic<i64>   // мутабельный, но сам по себе thread-safe
    misses: Atomic<i64>
}

const stats = new Readonly(new Stats {
    hits:   new Atomic<i64>(0),
    misses: new Atomic<i64>(0)
})

// несколько потоков читают конфиг и пишут в атомики одновременно
Thread.spawn(() => {
    stats.hits.fetchAdd(1, RmwOrdering.Relaxed)   // ✅
})
```

```typescript
import { Thread, channel, select, after } from "std/threads"

async function main(): void {
    const [tx, rx] = channel<i32[]>(64)

    const t = Thread.spawn(() => {
        // тяжёлые вычисления в отдельном потоке
        const result = heavyComputation()
        tx.send(result)   // move владения в канал
    })

    const result = await rx.recv()   // ждём результат
    t.join();
    console.log(result);
}
```

**Правила передачи в Thread.spawn:**

| Тип | Разрешено | Поведение |
|-----|-----------|-----------|
| Owned `T` | ✅ | неявный move |
| Примитив | ✅ | copy |
| `Atomic<T>` | ✅ | retain/release автоматически |
| `AtomicArray<T>` | ✅ | retain/release автоматически |
| `Readonly<T>` | ✅ | retain/release автоматически |
| `Ref<T>` / `Mut<T>` | ❌ | ошибка компилятора |
| `Shared<T>` / `Weak<T>` | ❌ | ошибка компилятора |

**Global State в контексте потоков:**

```typescript
const CONFIG = { maxRetries: 3 };     // const — ok, читать из потоков можно
let counter = 0;                       // ошибка компилятора если Thread.spawn захватывает
const ac = new Atomic<i32>(0);         // Atomic<T> — ok из потоков

class Server {
    static count: i32 = 0;             // mutable static — ошибка при захвате в Thread.spawn
    static readonly MAX: i32 = 100;    // const static — ok
}
```

Компилятор проверяет захваченные переменные **на границе `Thread.spawn`**:
- Мутабельный `let` или глобаль → ошибка компилятора
- `Shared<T>` или `Weak<T>` → ошибка компилятора
- `Ref<T>` / `Mut<T>` → ошибка компилятора
- Owned `T` → неявный move
- Примитив → copy
- `Atomic<T>` / `AtomicArray<T>` / `Readonly<T>` → retain/release автоматически

---

#### 3. @interrupt — только Embedded

ISR — аппаратное прерывание. Не поток, не closure. Никакого захвата контекста.

##### Volatile<T> — регистры MMIO

`Volatile<T>` гарантирует что каждое чтение/запись доходит до памяти (не кэшируется в регистр процессора). Транслируется в `volatile T*` в C. Используется исключительно для Memory-Mapped I/O.

```typescript
import { Volatile, pointer } from "std/embedded"

// описываем регистры периферии
struct UartRegs {
    dr:        Volatile<u32>   // Data Register
    rsr:       Volatile<u32>   // Status Register
    _reserved: u32[4]          // пропуск памяти
    fr:        Volatile<u32>   // Flag Register
}

// маппинг на физический адрес
const UART0 = pointer<UartRegs>(0x101f1000)

UART0.dr.write(0x41)              // C: *(volatile uint32_t*)0x101f1000 = 0x41
const status = UART0.fr.read()   // C: *(volatile uint32_t*)0x101f1018 — не кэшируется
```

> `Volatile<T>` ≠ `Atomic<T>`: атомики используют инструкции синхронизации которые периферия не понимает. Для MMIO регистров — только `Volatile<T>`.

Два гарантии `Volatile<T>`:
1. **No cache** — каждое чтение/запись физически идёт на шину, не кэшируется в регистр процессора
2. **No reordering** — компилятор не переставляет инструкции чтения/записи `Volatile<T>` относительно друг друга (критично для последовательности инициализации периферии)

##### @interrupt

```typescript
import { Atomic, RmwOrdering } from "std/threads"

static readonly irqCount = new Atomic<u32>(0)
static readonly [tx, rx] = channel<Event>(32)

@interrupt(14)    // номер вектора IRQ
function onTimerInterrupt(): void {
    // Atomic<T> — ok
    irqCount.fetchAdd(1, RmwOrdering.Relaxed)

    // channel trySend — ok (не блокирует)
    tx.trySend(new Event(14))

    // Volatile<T> — ok
    TIMER_REG.sr.write(0x0)   // сброс флага прерывания
}
```

Компилятор генерирует платформенный атрибут:
```c
// GCC/Clang (ARM Cortex)
__attribute__((interrupt("IRQ")))
void onTimerInterrupt(void) { ... }

// AVR
ISR(TIMER0_OVF_vect) { ... }
```

Context saving — полностью на стороне C компилятора через `__attribute__((interrupt))`. TSC не генерирует код сохранения регистров.

##### Правила @interrupt

| Операция | Разрешено |
|----------|-----------|
| `Atomic<T>` / `AtomicArray<T>` | ✅ |
| `Volatile<T>` (MMIO) | ✅ |
| `tx.trySend()` | ✅ (не блокирует) |
| `await` | ❌ ошибка компилятора |
| `new` (heap allocation) | ❌ ошибка компилятора |
| `await tx.send()` (блокирующий) | ❌ ошибка компилятора |
| Owned / `Shared<T>` / `Ref<T>` | ❌ ошибка компилятора |
| Обычные переменные программы | ❌ ошибка компилятора |

`std/threads` на embedded targets — ошибка компилятора (нет OS).

##### std/sync — критические секции (embedded)

Для безопасного доступа к составным данным которые меняет IRQ — временный запрет прерываний:

```typescript
import { interrupts } from "std/sync"

interrupts.disable(() => {
    // прерывания выключены на время выполнения лямбды
    // гарантирует атомарность группы операций
    const snapshot = sensorData.x  // читаем составную структуру безопасно
    const y = sensorData.y
    process(snapshot, y)
})
// прерывания автоматически включаются по выходу
```

C-output (платформозависимый):
```c
// ARM Cortex-M
__asm volatile("cpsid i");   // disable interrupts
{ /* тело лямбды */ }
__asm volatile("cpsie i");   // enable interrupts

// x86
__asm volatile("cli");
{ /* тело лямбды */ }
__asm volatile("sti");

// AVR
uint8_t sreg = SREG; cli();
{ /* тело лямбды */ }
SREG = sreg;  // восстанавливаем флаги (не просто sei())
```

> Внутри `interrupts.disable()` те же ограничения что и в `@interrupt`: нет `await`, нет `new`.

##### Итоговая таблица Low-level инструментов

| Задача | TSC синтаксис | Гарантия |
|--------|---------------|----------|
| MMIO регистры | `Volatile<T>` | Прямое обращение к шине, no reorder |
| Обработчик прерывания | `@interrupt(N)` | `__attribute__((interrupt))`, context saved |
| Общее состояние с IRQ | `static Atomic<T>` | Атомарный доступ без гонок |
| Составные данные с IRQ | `interrupts.disable()` | Критическая секция |
| Связь IRQ → основной код | `channel.trySend()` | Передача без блокировки |

---

#### Итоговая картина

```
┌─────────────────────────────────────────────────────┐
│  TSC Concurrency Model                               │
│                                                      │
│  async/await ──── event loop ──── все платформы      │
│       │                                              │
│       └── Shared<T>/Weak<T> не атомарны              │
│       └── Weak narrowing безопасен                   │
│                                                      │
│  std/threads ───── isolates ────── OS only            │
│       │                                              │
│       ├── channel<T>: передача владения              │
│       ├── Atomic<T> / AtomicArray<T>: shared счётчики│
│       ├── Readonly<T>: zero-copy immutable sharing   │
│       └── компилятор проверяет на Thread.spawn       │
│                                                      │
│  @interrupt ────── ISR ─────────── embedded only     │
│       │                                              │
│       └── только Volatile<T> + Atomic<T>             │
│       └── нет захвата контекста                      │
└─────────────────────────────────────────────────────┘
```

### Standard Library

#### Globals

Глобальные объекты и функции — импорт не нужен.

`console` и `process` — глобальные, импорт не нужен.

```typescript
// console — все платформы
console.log("hello")
console.error("error")
console.warn("warning")
console.debug("debug")

// таймеры — все платформы
const id = setTimeout(() => console.log("hello"), 1000)  // i64 — id таймера
clearTimeout(id)
const tick = setInterval(() => update(), 100)             // i64 — id интервала
clearInterval(tick)

// sleep — все платформы (только внутри async)
await sleep(500)   // пауза 500мс

// высокоточный таймер — все платформы
performance.now()  // f64 — миллисекунды с момента старта программы

// process — только desktop/server
process.exit(0)
process.argv   // string[] — аргументы командной строки
process.env    // Map<string, string> — переменные окружения
```

На **embedded** targets `process.*` — ошибка компилятора (нет OS, нет процесса). Вместо этого используются `std/serial`, `std/gpio` и др.

Недоступно на embedded (требует OS):
- `process.*`
- `std/threads`

Только для embedded:
- `std/sync` — критические секции (`interrupts.disable()`)
- `std/embedded` — `Volatile<T>`, `pointer<T>(addr)`

#### Buffer

Глобальный класс для работы с бинарными данными — байтовый буфер с удобным API для I/O. Импорт не нужен. Доступен на всех платформах.

```typescript
// создание
const buf = Buffer.alloc(1024)                         // нули, size=1024
const buf = Buffer.alloc(256, 0xFF)                    // заполнен 0xFF
const buf = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // из u8[]
const buf = Buffer.from("hello", "utf8")               // из строки
const buf = Buffer.from("aGVsbG8=", "base64")
const buf = Buffer.concat([buf1, buf2, buf3])           // объединить

// размер
buf.length   // i32, readonly

// доступ к байтам
buf[0]        // u8 — чтение
buf[0] = 0xFF // запись

// zero-copy view
const s: Slice<u8>    = buf.view(4, 12)     // байты 4..11, не копирует
const ms: MutSlice<u8> = buf.viewMut(0, 4)  // мутабельный view

// копирование
buf.copy(target, targetStart?, sourceStart?, sourceEnd?): i32  // возвращает кол-во скопированных байт

// заполнение
buf.fill(value: u8, start?: i32, end?: i32): void

// поиск
buf.indexOf(value: u8, start?: i32): i32   // -1 если не найдено

// конвертация в строку
buf.toString("utf8" | "ascii" | "hex" | "base64"): string
```

C-output:
```c
typedef struct {
    uint8_t* data;
    size_t   length;
    size_t   capacity;
} Buffer;
```

#### DataView

Чтение и запись примитивных типов в `Buffer` по произвольным смещениям с контролем byte order (endianness). Импорт не нужен. Критично для парсинга бинарных протоколов.

```typescript
const buf = Buffer.alloc(64)
const dv = new DataView(buf)          // весь буфер
const dv = new DataView(buf, 4, 16)   // byteOffset=4, byteLength=16

dv.byteLength   // i32
dv.byteOffset   // i32

// чтение (littleEndian по умолчанию = false — big-endian)
dv.getU8(offset)
dv.getI8(offset)
dv.getU16(offset, littleEndian?: boolean)
dv.getI16(offset, littleEndian?: boolean)
dv.getU32(offset, littleEndian?: boolean)
dv.getI32(offset, littleEndian?: boolean)
dv.getU64(offset, littleEndian?: boolean)
dv.getI64(offset, littleEndian?: boolean)
dv.getF32(offset, littleEndian?: boolean)
dv.getF64(offset, littleEndian?: boolean)

// запись
dv.setU8(offset, value)
dv.setI8(offset, value)
dv.setU16(offset, value, littleEndian?: boolean)
// ... аналогично для всех типов

// пример: парсинг бинарного заголовка протокола
struct PacketHeader {
    magic:   u32   // big-endian
    version: u16
    length:  u32
    checksum: u32
}

function parseHeader(buf: Ref<Buffer>): PacketHeader {
    const dv = new DataView(buf)
    return {
        magic:    dv.getU32(0),         // big-endian (по умолчанию)
        version:  dv.getU16(4),
        length:   dv.getU32(6),
        checksum: dv.getU32(10),
    }
}
```

C-output — `getU32` big-endian:
```c
uint32_t tsc_DataView_getU32(DataView* dv, size_t offset, bool little_endian) {
    uint8_t* p = dv->buffer->data + dv->byte_offset + offset;
    if (little_endian)
        return (uint32_t)p[0] | ((uint32_t)p[1]<<8) | ((uint32_t)p[2]<<16) | ((uint32_t)p[3]<<24);
    else
        return ((uint32_t)p[0]<<24) | ((uint32_t)p[1]<<16) | ((uint32_t)p[2]<<8) | (uint32_t)p[3];
}
```

#### process.stdin / stdout / stderr

```typescript
// stdin — async чтение
const line = await process.stdin.readLine()   // string | null (null = EOF)
const all  = await process.stdin.readAll()    // string

// stdout / stderr — запись
await process.stdout.write("hello")
await process.stderr.write("error\n")
```

#### std/io

Абстракция потоков — базовые интерфейсы `Reader` и `Writer`. Используются для построения поверх них (файлы, сеть, serial).

```typescript
import { Reader, Writer, Stream } from "std/io"

interface Reader {
    read(buf: u8[]): i32 | null throws IOError   // прочитать в буфер, null = EOF
    readLine(): string | null throws IOError
    readAll(): string throws IOError
}

interface Writer {
    write(data: string): void throws IOError
    write(data: u8[]): void throws IOError
    flush(): void throws IOError
}

interface Stream extends Reader, Writer {}
```

`process.stdin` реализует `Reader`, `process.stdout` / `process.stderr` реализуют `Writer`.

#### std/fs

Все операции async. Реализация зависит от платформы:

| Платформа | Реализация |
|-----------|-----------|
| Desktop/Server | POSIX / Windows API |
| Embedded (SD карта) | FatFS |
| Embedded (Flash) | LittleFS |

```typescript
import { fs } from "std/fs"

// файлы
const text = await fs.readFile("data.txt")            // string throws IOError
const raw  = await fs.readFileBytes("data.bin")       // u8[] throws IOError
await fs.writeFile("out.txt", "hello")                // void throws IOError
await fs.writeFileBytes("out.bin", bytes)             // void throws IOError
await fs.appendFile("log.txt", "new line\n")          // void throws IOError
await fs.deleteFile("old.txt")                        // void throws IOError
await fs.copyFile("src.txt", "dst.txt")               // void throws IOError
await fs.moveFile("old.txt", "new.txt")               // void throws IOError

// директории
await fs.mkdir("mydir")                               // void throws IOError
await fs.mkdir("a/b/c", { recursive: true })          // создать вложенные
await fs.rmdir("mydir")                               // void throws IOError
await fs.rmdir("mydir", { recursive: true })          // удалить со содержимым
const entries = await fs.readDir(".")                 // DirEntry[] throws IOError

// мета
const exists = await fs.exists("file.txt")            // boolean
const info   = await fs.stat("file.txt")              // FileStat throws IOError
const isFile = await fs.isFile("file.txt")            // boolean
const isDir  = await fs.isDir("mydir")                // boolean
```

Типы:

```typescript
struct DirEntry {
    name: string        // имя файла/директории
    path: string        // полный путь
    isFile: boolean
    isDir: boolean
}

struct FileStat {
    size: i64           // размер в байтах
    createdAt: Date
    modifiedAt: Date
    isFile: boolean
    isDir: boolean
}
```

#### std/net

Реализация зависит от платформы: POSIX sockets на desktop/server, lwIP на embedded.

##### fetch (глобальный)

```typescript
// GET
const res = await fetch("https://api.example.com/users")
const users = await res.json<User[]>()

// POST
const res = await fetch("https://api.example.com/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
})

// Response
res.status    // i32 — 200, 404, 500...
res.ok        // boolean — status 200-299
res.headers   // Map<string, string>
await res.text()        // string throws NetworkError
await res.json<T>()     // T throws NetworkError | ParseError
await res.bytes()       // u8[] throws NetworkError
```

##### HTTP сервер

```typescript
import { HttpServer, HttpRequest, HttpResponse } from "std/net"

const server = new HttpServer(async (req: HttpRequest, res: HttpResponse) => {
    if (req.method === "GET" && req.path === "/") {
        res.status = 200
        res.headers.set("Content-Type", "text/plain")
        await res.send("Hello, World!")
    } else {
        res.status = 404
        await res.send("Not Found")
    }
})

await server.listen(8080)
console.log("listening on :8080")
```

```typescript
struct HttpRequest {
    method:  string               // "GET", "POST", ...
    path:    string               // "/users/42"
    headers: Map<string, string>
    body:    string | null
}

struct HttpResponse {
    let status:  i32
    let headers: Map<string, string>
    send(body: string): void throws IOError
    send(body: u8[]): void throws IOError
    json<T>(data: T): void throws IOError
}
```

##### TCP сокеты

```typescript
import { TCPSocket, TCPServer } from "std/net"

// клиент
const socket = await TCPSocket.connect("localhost", 8080)  // throws NetworkError
await socket.write("hello\n")
const line = await socket.readLine()   // string | null
socket.close()

// сервер
const server = new TCPServer()
await server.listen(8080)
while (true) {
    const client = await server.accept()   // TCPSocket
    const data = await client.readAll()
    await client.write("ok")
    client.close()
}
```

##### UDP сокеты

```typescript
import { UDPSocket } from "std/net"

const socket = new UDPSocket()
await socket.bind(8080)

// отправка
await socket.send("192.168.1.1", 8080, bytes)

// приём
const { data, addr, port } = await socket.recv()  // throws NetworkError
```

#### std/ws

WebSocket клиент и сервер. Работает на desktop/server и embedded (например ESP32 + lwIP).

```typescript
import { WebSocket, WebSocketServer } from "std/ws"

// клиент
const ws = await WebSocket.connect("ws://localhost:8080")  // throws NetworkError

ws.onMessage((data: string) => {
    console.log("received:", data)
})

ws.onClose(() => {
    console.log("disconnected")
})

await ws.send("hello")
await ws.close()

// бинарные данные
ws.onMessage((data: u8[]) => { ... })
await ws.sendBytes(bytes)

// сервер
const server = new WebSocketServer()

server.onConnect((client: WebSocket) => {
    client.onMessage((data: string) => {
        client.send(`echo: ${data}`)
    })
})

await server.listen(8080)
```

#### std/math

`Math` — глобальный объект, импорт не нужен.

##### Константы

```typescript
Math.PI       // 3.141592653589793
Math.E        // 2.718281828459045
Math.SQRT2    // 1.4142135623730951
Math.LN2      // 0.6931471805599453
Math.LN10     // 2.302585092994046
Math.LOG2E    // 1.4426950408889634
Math.LOG10E   // 0.4342944819032518
```

##### Методы

```typescript
// округление
Math.floor(4.7)       // f64 → f64 — 4.0
Math.ceil(4.2)        // f64 → f64 — 5.0
Math.round(4.5)       // f64 → f64 — 5.0
Math.trunc(4.9)       // f64 → f64 — 4.0

// арифметика
Math.abs(-5)          // перегрузка: i32|f64 → тот же тип
Math.pow(2.0, 10.0)   // f64 → f64 — 1024.0
Math.sqrt(9.0)        // f64 → f64 — 3.0
Math.cbrt(27.0)       // f64 → f64 — 3.0
Math.hypot(3.0, 4.0)  // f64 → f64 — 5.0

// тригонометрия (радианы)
Math.sin(Math.PI / 2) // 1.0
Math.cos(0.0)         // 1.0
Math.tan(Math.PI / 4) // 1.0
Math.asin(1.0)        // Math.PI / 2
Math.acos(1.0)        // 0.0
Math.atan(1.0)        // Math.PI / 4
Math.atan2(1.0, 1.0)  // Math.PI / 4

// логарифмы
Math.log(Math.E)      // 1.0
Math.log2(8.0)        // 3.0
Math.log10(1000.0)    // 3.0
Math.exp(1.0)         // Math.E

// утилиты
Math.min(3, 1, 4, 1)       // перегрузка: i32|f64 → тот же тип
Math.max(3, 1, 4, 1)       // перегрузка: i32|f64 → тот же тип
Math.clamp(15, 0, 10)      // перегрузка: i32|f64 → тот же тип — 10
Math.sign(-5.0)            // f64 → f64 — -1.0
Math.sign(0.0)             // 0.0
Math.sign(5.0)             // 1.0

// random (0..1, без seed)
Math.random()              // f64 — [0.0, 1.0)
```


#### std/string

##### Unicode extension methods

Extension methods для работы с Unicode — импортируются явно:

```typescript
import { chars, charCount, graphemes, codePointAt, graphemeAt, sliceChars } from "std/string"

const s = "привет❤️"

s.chars()                  // Iterator<u32> — codepoints (1087, 1088...), O(1) per step
s.charCount()              // i32 — количество codepoints, O(n)
s.graphemes()              // Iterator<string> — графемные кластеры ("п", "р", "❤️")
s.codePointAt(byteIdx)     // u32 — codepoint по байтовому смещению
s.graphemeAt(byteIdx)      // string — графемный кластер по байтовому смещению
s.sliceChars(start, end)   // string — безопасный срез по codepoint-индексам, O(n)
```

`codePointAt(byteIdx)` и `graphemeAt(byteIdx)` принимают **байтовое смещение** — удобно после `indexOf`: смещение уже известно, сканировать с начала не нужно. Декодирование одного UTF-8 символа — O(1..4 байта).

utf8proc (UAX #29, ~300KB, C-native) — используется для сегментации графемных кластеров. Работает на embedded.

```typescript
// паттерн: найти подстроку → получить символ по смещению
const idx = s.indexOf("❤️")        // байтовое смещение, O(n)
if (idx >= 0) {
    const g = s.graphemeAt(idx)    // "❤️", O(1 символа)
}
```

##### Regex

```typescript
import { Regex } from "std/string"

const re = new Regex("^\\d+$")
const reLiteral = /^\d+$/          // литеральный синтаксис (как в JS)
const reFlags = /hello/gi          // флаги: g, i, m

re.test("123")                     // boolean
re.match("hello world")            // string[] | null — все совпадения
re.matchAll("aabbcc")              // string[][] — все группы
re.replace("hello", "world")       // string
re.replaceAll("aaa", "b")          // string
re.split("a,b,c")                  // string[]
```

##### Кодирование

```typescript
import { base64, hex, url } from "std/string"

// base64
base64.encode(bytes: u8[]): string
base64.decode(s: string): u8[] throws ParseError

// hex
hex.encode(bytes: u8[]): string     // "deadbeef"
hex.decode(s: string): u8[] throws ParseError

// URL
url.encode(s: string): string       // "hello%20world"
url.decode(s: string): string throws ParseError
url.encodeComponent(s: string): string
url.decodeComponent(s: string): string throws ParseError
```

##### Форматирование

```typescript
import { format } from "std/string"

format("Hello %s, you are %d years old", name, age)   // string
format("Pi is %.2f", Math.PI)                          // "Pi is 3.14"
format("%05d", 42)                                     // "00042"

// спецификаторы:
// %s — string
// %d — целое число
// %f — float (%.Nf — N знаков после запятой)
// %x — hex (нижний регистр)
// %X — hex (верхний регистр)
// %b — binary
// %o — octal
// %% — литеральный %
```

#### std/random

`Math.random()` остаётся как JS-совместимое легаси. `std/random` — полноценный типизированный API.

Единственный метод `next<T>` — тип параметра диктует поведение:

```typescript
rng.next<i32>()           // случайный i32 (весь диапазон)
rng.next<i16>(0, 100)     // i16 в [0, 100)
rng.next<u8>(0, 255)      // u8 в [0, 255)
rng.next<f64>()           // f64 в [0.0, 1.0)
rng.next<f32>(0.0, 5.0)   // f32 в [0.0, 5.0)
rng.next<boolean>()       // boolean
rng.next<u8[]>(16)        // u8[] длиной 16
rng.next<i32[]>(10)       // i32[] длиной 10

rng.shuffle(arr)          // перемешать массив на месте
rng.pick<T>(arr)          // T | null — случайный элемент массива
```

##### Random (все платформы)

```typescript
import { Random } from "std/random"

const rng = new Random()            // auto-seed из OS энтропии (desktop/server)
                                    // на embedded — ошибка компилятора
const rng = new Random(42)          // фиксированный seed — воспроизводимо (все платформы)

const a = rng.next<i32>(0, 100)
```

##### SecureRandom — криптографически стойкий (desktop/server)

```typescript
import { SecureRandom } from "std/random"

const secure = new SecureRandom()
const key = secure.next<u8[]>(32)   // 32 случайных байта из OS
// на embedded — ошибка компилятора
```

##### HardwareRandom — аппаратный источник (embedded)

```typescript
import { HardwareRandom } from "std/random"

const hw = new HardwareRandom()     // ADC шум, аппаратный RNG, таймер
const seed = hw.next<u32>()         // получить seed из железа
const rng = new Random(seed)        // использовать как seed для Random
// на desktop/server — ошибка компилятора
```

#### std/temporal

Полноценная замена legacy `Date`. Основан на TC39 Temporal proposal. Все объекты **иммутабельны**. Месяцы **1-based** (январь = 1).

```typescript
import { PlainDate, PlainTime, PlainDateTime, Instant, ZonedDateTime, Duration, Now } from "std/temporal"
```

##### PlainDate

```typescript
const d = PlainDate.from("2024-03-20")
const d = new PlainDate(2024, 3, 20)    // year, month (1-12), day

d.year    // i32 — 2024
d.month   // i32 — 3 (март, 1-based!)
d.day     // i32 — 20
d.dayOfWeek  // i32 — 1=пн, 7=вс

d.add({ days: 10 })           // PlainDate
d.subtract({ months: 1 })     // PlainDate
d.until(other)                // Duration
d.since(other)                // Duration
d.toString()                  // "2024-03-20"
```

##### PlainTime

```typescript
const t = PlainTime.from("14:30:00")
const t = new PlainTime(14, 30, 0)      // hour, minute, second

t.hour    // i32
t.minute  // i32
t.second  // i32

t.add({ hours: 2 })           // PlainTime
t.toString()                  // "14:30:00"
```

##### PlainDateTime

```typescript
const dt = PlainDateTime.from("2024-03-20T14:30:00")
const dt = new PlainDateTime(2024, 3, 20, 14, 30, 0)

dt.date   // PlainDate
dt.time   // PlainTime
dt.year   // i32
dt.month  // i32
dt.day    // i32
dt.hour   // i32
dt.minute // i32
dt.second // i32

dt.add({ days: 1, hours: 2 })  // PlainDateTime
dt.until(other)                // Duration
dt.toString()                  // "2024-03-20T14:30:00"
```

##### Instant

```typescript
const i = Instant.from("2024-03-20T14:30:00Z")
const i = Now.instant()         // текущий момент

i.epochSeconds      // i64
i.epochMilliseconds // i64
i.epochNanoseconds  // i64

i.add({ hours: 1 })    // Instant
i.until(other)         // Duration
i.toString()           // "2024-03-20T14:30:00Z"
```

##### Duration

```typescript
const dur = Duration.from({ years: 1, months: 2, days: 3, hours: 4 })

dur.years   // i32
dur.months  // i32
dur.days    // i32
dur.hours   // i32
dur.minutes // i32
dur.seconds // i32

dur.total("hours")   // f64 — всё в часах
dur.toString()       // "P1Y2M3DT4H"
```

##### ZonedDateTime (только desktop/server)

```typescript
import { ZonedDateTime } from "std/temporal"

const zdt = ZonedDateTime.from("2024-03-20T14:30:00[Europe/Moscow]")
const zdt = Now.zonedDateTime("Europe/Moscow")  // текущее время в timezone

zdt.timeZone  // string — "Europe/Moscow"
zdt.offset    // string — "+03:00"
zdt.toPlainDateTime()   // PlainDateTime (без timezone)
zdt.toInstant()         // Instant

// на embedded — ошибка компилятора (нет tzdata)
```

##### Now

```typescript
Now.instant()                      // Instant — текущий момент UTC
Now.plainDate()                    // PlainDate — сегодня (системный timezone)
Now.plainTime()                    // PlainTime — текущее время
Now.plainDateTime()                // PlainDateTime
Now.zonedDateTime("Europe/Moscow") // ZonedDateTime (desktop/server only)
```

#### std/threads

Только для desktop/server — на embedded ошибка компилятора (нет OS scheduler).

Подробное описание API — в разделе [Concurrency → Threads (std/threads)](#2-threads-stdthread----продвинутый-уровень).

```typescript
import { Thread, channel } from "std/threads"
```

---

## Roadmap

### Этап 0: Подготовка

Нужно выявить потенциальные проблемы дизайна.

Дальше используется термин `Кодовая база` - это файл, в котором описывается:
- `реализация` на JS, включая методы
- `реализация` на C, вплоть до каждого метода
- `реализация` на TSC, вплоть до каждого метода

Для каждой `реализации`:
- пример кода
- результат, который код должен выдавать
- пример кода с ошибкой
- какую ошибку должен выдавать
- пример исправления ошибки
- результат, который должен быть после исправления

Примерная структура документации к проекту:

```
doc/
  index.md
  1_перегрузка_функций/
    1_1_перегрузка_по_типам.md
    1_2_перегрузка_по_количеству.md
```

Примерная структура файла `index.md`:

```
# Раздел 1. Перегрузка функций

## Правило 1. Перегрузка по типам.
## Правило 2. Перегрузка по количеству.

...
```

Примерная структура файла `1_1_перегрузка_по_типам.md`:

```
# Раздел 1. Перегрузка функций

## Правило 1

Перегрузка по типам.

Код на typescript

```typescript
...
```

Код на c

```c
...
```

Код на tsc

```
...
```

Результат выполнения

```
...
```

Ошибка, если перегрузка будет содержать необязательный параметр

Код на tsc

```
...
```

Вывод с подсказкой

```
...
```

Чтобы исправить, нужно сделать ...

Код на tsc

```
...
```

Результат выполнения

```
...
```

- [ ] Создать каталог `doc` в котором будет хранится документация по проекту
- [ ] Создать внутри файл `index.md`
- [ ] Разбить весь концепт на ключевые разделы
- [ ] Для каждого раздела создать свой каталог в `doc`
- [ ] Записать раздел в файл `index.md`
- [ ] Разделы разбить на правила и операторы
- [ ] Каждое правило и оператор записать в каталог раздела, в файл вида `[номер_раздела]_[название_раздела].md`
- [ ] Собрать под каждое правило и оператор кодовую базу и записать в тот же файл

---

### Методология

Каждый компонент реализуется по одному циклу:

```
1. Тесты    — написать test corpus (формат Этап 0):
               входной .tsc → ожидаемый C output / ошибка компилятора
2. Реализация — реализовать компонент до полного прохождения тестов
3. Лог      — вести log/<компонент>.md: решения, проблемы, изменения дизайна
```

Структура файлов проекта:
```
doc/          — test corpus (Этап 0)
log/          — логи компонентов
src/          — исходный код компилятора
```

---

### Этап 1: Инфраструктура

Фундамент — без него ничего не работает.

| Компонент | Тесты | Лог |
|-----------|-------|-----|
| Парсер (swc или свой) + синтаксические правила форматирования (обязательные `{}`, K&R, ASI) | `doc/parser/` | `log/parser.md` |
| AST → IR lowering | `doc/ir/` | `log/ir.md` |
| ScopeManager (ALIVE / MOVED / DROPPED) | `doc/scope/` | `log/scope.md` |
| tsclang CLI (init, build, run, clean, **lint**) | `doc/cli/` | `log/cli.md` |

---

### Этап 2: Базовая кодогенерация

Простейший рабочий компилятор: типы, функции, управляющие конструкции.

| Компонент | Тесты | Лог |
|-----------|-------|-----|
| Примитивные типы (i8..u64, f32/f64, bool, string) + TypedArray aliases | `doc/types/primitives/` | `log/types.md` |
| Функции → C функции | `doc/functions/` | `log/functions.md` |
| struct / class / interface → C struct + `_free` | `doc/structs/` | `log/structs.md` |
| `Slice<T>` / `MutSlice<T>` — array views | `doc/types/slice/` | `log/types.md` |
| `Buffer` + `DataView` | `doc/types/buffer/` | `log/types.md` |
| enum → C typedef + string tables | `doc/enums/` | `log/enums.md` |
| if / else / ternary | `doc/control/if/` | `log/control.md` |
| for / while / do-while / labeled break | `doc/control/loops/` | `log/control.md` |
| switch / case | `doc/control/switch/` | `log/control.md` |
| match (pattern matching) | `doc/control/match/` | `log/control.md` |
| Операторы и приоритеты | `doc/operators/` | `log/operators.md` |

---

### Этап 3: Package Manager (базовый)

Минимум для сборки — чтобы как можно раньше видеть рабочий C-код.

| Компонент | Тесты | Лог |
|-----------|-------|-----|
| `tsc.packages.json` — парсинг и валидация | `doc/pkg/config/` | `log/pkg.md` |
| CMakeLists.txt генерация | `doc/pkg/cmake/` | `log/pkg.md` |
| `tsclang init` — создать проект | `doc/pkg/init/` | `log/pkg.md` |
| `tsclang install` — pkg-config / git / url зависимости | `doc/pkg/install/` | `log/pkg.md` |
| `tsclang build` — transpile + cmake + компиляция | `doc/pkg/build/` | `log/pkg.md` |

После этого этапа: `.tsc` → `.c` → бинарь — работает end-to-end.

---

### Этап 4: Система типов

| Компонент | Тесты | Лог |
|-----------|-------|-----|
| Номинальная типизация | `doc/typesystem/nominal/` | `log/typesystem.md` |
| Type inference | `doc/typesystem/inference/` | `log/typesystem.md` |
| Generics → монорфизация | `doc/typesystem/generics/` | `log/generics.md` |
| Перегрузка функций | `doc/typesystem/overloads/` | `log/overloads.md` |
| Result\<T,E\> + оператор `?` | `doc/errors/` | `log/errors.md` |

---

### Этап 5: Ownership & Borrow Checker

| Компонент | Тесты | Лог |
|-----------|-------|-----|
| Move при присваивании | `doc/ownership/move/` | `log/ownership.md` |
| Вставка `_free` / `free()` в конце блоков | `doc/ownership/free/` | `log/ownership.md` |
| Эпилог cleanup (early return, throw) | `doc/ownership/epilog/` | `log/ownership.md` |
| `Ref<T>` / `Mut<T>` — borrow check | `doc/borrow/` | `log/borrow.md` |
| Scope Constraint | `doc/borrow/scope/` | `log/borrow.md` |

---

### Этап 6: ARC & Thread-Safety

| Компонент | Тесты | Лог |
|-----------|-------|-----|
| `Shared<T>` — ARC retain/release | `doc/arc/shared/` | `log/arc.md` |
| `Weak<T>` — weak ref + narrowing | `doc/arc/weak/` | `log/arc.md` |
| `Atomic<T>` / `AtomicArray<T>` | `doc/threads/atomic/` | `log/threads.md` |
| `Readonly<T>` — deep immutability | `doc/threads/readonly/` | `log/threads.md` |
| `Thread.spawn` + capture rules | `doc/threads/spawn/` | `log/threads.md` |
| `channel<T>` + `select` | `doc/threads/channel/` | `log/threads.md` |
| `@interrupt` + `Volatile<T>` + `std/sync` | `doc/embedded/interrupt/` | `log/embedded.md` |

---

### Этап 7: Async/Await

| Компонент | Тесты | Лог |
|-----------|-------|-----|
| async/await → state machine codegen | `doc/async/statemachine/` | `log/async.md` |
| `Promise<T>` — explicit/implicit | `doc/async/promise/` | `log/async.md` |
| `Promise.all/any/race/allSettled` | `doc/async/promise_combinators/` | `log/async.md` |
| `AbortSignal` / `AbortController` | `doc/async/abort/` | `log/async.md` |
| Runtime интеграция (libuv / io_uring / embedded poll) | `doc/async/runtime/` | `log/async_runtime.md` |

---

### Этап 8: Standard Library

| Компонент | Тесты | Лог |
|-----------|-------|-----|
| Globals: console, setTimeout, Math, Date, JSON, fetch | `doc/stdlib/globals/` | `log/stdlib.md` |
| `std/io` | `doc/stdlib/io/` | `log/stdlib.md` |
| `std/fs` | `doc/stdlib/fs/` | `log/stdlib.md` |
| `std/net` + `std/ws` | `doc/stdlib/net/` | `log/stdlib.md` |
| `std/string` + `std/math` + `std/random` | `doc/stdlib/utils/` | `log/stdlib.md` |
| `std/temporal` | `doc/stdlib/temporal/` | `log/stdlib.md` |
| `std/embedded` | `doc/stdlib/embedded/` | `log/embedded.md` |

---

### Этап 9: Package Manager (полный)

| Компонент | Тесты | Лог |
|-----------|-------|-----|
| `tsclang update` — обновление зависимостей | `doc/pkg/update/` | `log/pkg.md` |
| Lock-файл — воспроизводимые сборки | `doc/pkg/lock/` | `log/pkg.md` |
| `tsclang run` — build + execute | `doc/pkg/run/` | `log/pkg.md` |
| `tsclang lint` — форматтер | `doc/pkg/lint/` | `log/pkg.md` |

---

