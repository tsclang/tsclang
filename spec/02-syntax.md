# TSClang — Синтаксис

## Форматирование

Форматирование — **никогда не ошибка компилятора**. Компилятор проверяет только семантику. Форматирование — отдельный инструмент:

```bash
tsclang lint          # проверяет без изменений — для CI
tsclang lint -fix     # форматирует код на месте
tsclang lint -f       # алиас
```

| Инструмент | Роль |
|---|---|
| `tsclang build` | семантические ошибки, форматирование игнорируется |
| `tsclang lint` | семантические ошибки, предупреждения о стиле, CI-проверка — exit code 1 если нарушены правила |
| `tsclang lint -fix` | форматирует код (как prettier / gofmt) |
| IDE | format-on-save через плагин |

Это позволяет language server (автодополнение, типы, рефакторинг) работать корректно пока разработчик пишет незаконченный или неотформатированный код.

TSC следует соглашениям TypeScript/JavaScript.

**Точки с запятой** — опциональны, ASI как в JS:
```typescript
const x = 1       // без ;
const y = 2;      // со ; — тоже ok
```

**Фигурные скобки** — рекомендуются для всех блоков (`if`, `for`, `while`, функции):
```typescript
if (x > 0) {           // ✅ рекомендуется
    doSomething()
}
if (x > 0) doSomething()   // ✅ допустимо (линтер может предупредить)
```

**Открывающая скобка** — рекомендуется K&R стиль:
```typescript
function foo(): void {   // ✅ рекомендуется
}

function bar(): void     // ✅ допустимо (линтер может предупредить)
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

**Пробелы вокруг операторов** — рекомендуются:
```typescript
const x = a + b * c       // ✅
const x = a+b*c           // ✅ допустимо (линтер может предупредить)
```

**Пробелы в аннотациях типов** — рекомендуется после `:`, не до:
```typescript
const x: i32 = 5          // ✅
function foo(a: i32, b: string): void {}   // ✅
const x :i32 = 5          // ✅ допустимо (линтер может предупредить)
```

**Generics** — рекомендуется без пробелов внутри `<>`:
```typescript
const arr: Array<i32> = []         // ✅
const m: Map<string, User> = ...   // ✅
const arr: Array< i32 > = []       // ✅ допустимо (линтер может предупредить)
```

**Union типы** — рекомендуются пробелы вокруг `|`:
```typescript
let x: i32 | null          // ✅
function foo(): string | null {}   // ✅
let x: i32|null            // ✅ допустимо (линтер может предупредить)
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

## Переменные

- `let` — мутабельная переменная: можно переприсвоить, можно вызывать `mut` методы, можно передавать как `Mut<T>`
- `const` — иммутабельная: нельзя переприсвоить, нельзя вызывать `mut` методы, нельзя передавать как `Mut<T>`

## Перегрузка функций

Перегрузка по типам и по количеству параметров. Компилятор выбирает нужную версию на callsite, в C генерирует функции с mangled именами:

> **Видимость символов:** все TSClang-функции в C-output помечены `static` — не видны линковщику вне единицы компиляции. Коллизии с C-библиотеками невозможны. Только `export extern "C"` функции non-static и видны с явным C-именем — разработчик сам отвечает за уникальность имени.

```typescript
// по типам
function process(x: i32): void { ... }        // → static void process_i32(...) в C
function process(x: string): void { ... }     // → static void process_string(...) в C

process(42);       // вызывает process_i32
process("hello");  // вызывает process_string

// по количеству параметров
function foo(x: i32): void { ... }            // → static void foo_i32(...) в C
function foo(x: i32, y: i32): void { ... }    // → static void foo_i32_i32(...) в C

foo(1);     // вызывает foo_i32
foo(1, 2);  // вызывает foo_i32_i32

// комбинация
function add(a: i32, b: i32): i32 { ... }         // → static int32_t add_i32_i32(...)
function add(a: f64, b: f64): f64 { ... }         // → static double add_f64_f64(...)
function add(a: string, b: string): string { ... } // → static String add_string_string(...)
```

Перегрузка работает и для методов класса:
```typescript
class Printer {
    print(x: i32): void { ... }
    print(x: string): void { ... }
}
```

### Приоритет overload resolution

Когда несколько overload подходят для вызова, компилятор выбирает по приоритету:

1. **Exact match** — точное совпадение типов (non-generic)
2. **Generic с выведенным типом** — generic overload, тип выводится из аргументов
3. **Implicit widening** — расширение типа (например, `i32` → `f64`)

```typescript
function foo<T>(x: T): void { ... }   // generic
function foo(x: i32): void { ... }    // non-generic

foo(42)        // → foo(i32)   — exact match (правило 1), generic игнорируется
foo<i32>(42)   // → foo<i32>  — явный generic, приоритет игнорируется
foo("hello")   // → foo<string> — exact match только для generic (правило 2)
foo(3.14)      // → foo<f64>  — только generic подходит
```

Явный generic (`foo<i32>(42)`) всегда выбирает generic overload независимо от приоритета.

Если два overload одинакового приоритета одинаково подходят — ошибка компилятора (ambiguous overload).

## Name mangling — формальная схема

### Правила именования пользовательских типов

Имена классов, интерфейсов и type-алиасов обязаны быть **PascalCase** — ошибка компилятора (не линтер):

```typescript
class rUser { }    // ❌ ошибка: type name must start with uppercase letter
class ref_User { } // ❌ ошибка: type name uses reserved mangling prefix
class User { }     // ✅
```

Зарезервированные префиксы имён типов: `ref_`, `mut_`, `arc_`, `opt_`, `arr_`. Это гарантирует отсутствие коллизий с encoding ownership-квалификаторов.

### Кодирование типов

| TSClang тип | Encoding |
|-------------|----------|
| `i8` `i16` `i32` `i64` | `i8` `i16` `i32` `i64` |
| `u8` `u16` `u32` `u64` | `u8` `u16` `u32` `u64` |
| `f32` `f64` | `f32` `f64` |
| `bool` `string` `usize` `void` | `bool` `string` `usize` `void` |
| `UserType` (non-generic) | `UserType` |
| `Ref<T>` | `ref_` + enc(T) |
| `Mut<T>` | `mut_` + enc(T) |
| `Shared<T>` | `arc_` + enc(T) |
| `T \| null` | `opt_` + enc(T) |
| `T[]` | `arr_` + enc(T) |
| `Generic<T, U>` (N type-params) | `GenericN_` + enc(T) `_` enc(U) |

Generic-типы кодируют арность числом сразу после имени — это позволяет деманглеру однозначно разобрать параметры без внешних метаданных:

```
Map<string, User>           →  Map2_string_User
Box<i32>                    →  Box1_i32
Box<Ref<User>>              →  Box1_ref_User
Map<string, arr_i32>        →  Map2_string_arr_i32
```

Примеры составных типов:

```
Ref<User>                   →  ref_User
Mut<i32[]>                  →  mut_arr_i32
User | null                 →  opt_User
Map<string, User[]>         →  Map2_string_arr_User
Shared<Node>                →  arc_Node
```

### Манглинг функций

```
<mangled>   ::= [<module_slug> "_"] <name> ("_" <type_enc>)*
<type_enc>  ::= см. таблицу выше
<name>      ::= имя функции или метода
```

Параметры кодируются по порядку, только типы (не имена параметров):

```typescript
function foo(a: i32, b: Ref<User>, c: Map<string, i32[]>): void
// → foo_i32_ref_User_Map2_string_arr_i32

function process(x: string): void   // → process_string
function process(x: i32): void      // → process_i32
```

### Манглинг методов

Метод предваряется именем класса через `_`:

```typescript
class Counter {
    get(): i32 { ... }             // → Counter_get
    mut increment(): void { ... }  // → Counter_increment
    static create(): Counter { }   // → Counter_create
}
```

`mut` и `move` не попадают в манглинг — они не являются discriminator'ом перегрузки (нельзя объявить два метода с одинаковым именем и сигнатурой, различающихся только mut/move).

### Module slug и коллизии типов в заголовках

Функции в C-output помечены `static` — коллизий между модулями нет. Типы (`typedef struct`) в `.h` файлах статическими быть не могут — если два модуля экспортируют класс с одинаковым именем, при совместной компиляции возникает коллизия в C-заголовках.

Решение: все публичные C-символы (типы и функции в `.h`) получают **module slug** как префикс.

**Формирование slug:**

```
package name    "myco/mylib"  →  "myco_mylib"
file path       "src/user.tsc" →  "src_user"
slug            =  package_slug "_" file_slug
```

```
@myco/mylib / src/user.tsc    →  myco_mylib_src_user
src/models.tsc  (проект myapp) →  myapp_src_models
```

```c
// @myco/mylib/src/user.tsc — export class User
typedef struct { ... } myco_mylib_src_user_User;

// src/models.tsc проекта myapp — export class User
typedef struct { ... } myapp_src_models_User;
// нет коллизии при совместном include
```

Внутренние (неэкспортируемые) типы используют короткое имя внутри своего `.c` файла — module slug не нужен.

**Флаг `--short-symbols`:** в release-билде исполняемого проекта (не библиотеки) module slug можно опустить — в рамках одного проекта коллизий нет. Флаг не применим к библиотекам.

### Формальная грамматика (EBNF)

```ebnf
mangled      ::= module_slug "_" local_name | local_name
local_name   ::= ident ("_" type_enc)*
type_enc     ::= primitive
               | "ref_" type_enc
               | "mut_" type_enc
               | "arc_" type_enc
               | "opt_" type_enc
               | "arr_" type_enc
               | user_type digit+ ("_" type_enc)*   (* generic: arity digit(s) *)
               | user_type                           (* non-generic *)
primitive    ::= "i8"|"i16"|"i32"|"i64"|"u8"|"u16"|"u32"|"u64"
               | "f32"|"f64"|"bool"|"string"|"usize"|"void"
user_type    ::= [A-Z] [a-zA-Z0-9]*
module_slug  ::= [a-z0-9] [a-z0-9_]*
ident        ::= [a-zA-Z_] [a-zA-Z0-9_]*
digit        ::= [0-9]+
```

Грамматика самодостаточна: деманглер не требует внешних метаданных.

## Ограничение: extern "C" запрещает перегрузку

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

## Дефолтные параметры

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

## Функции

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
- **Async функции** — возвращают `Promise<T>`, могут содержать `await`:
  ```typescript
  async function fetchUser(id: i32): Promise<User> throws NetworkError {
      return await http.get(`/users/${id}`)
  }
  ```
- **Async стрелочные функции** — тип выводится как `async () => Promise<T>`:
  ```typescript
  const fetchUser = async (id: i32): Promise<User> => await http.get(`/users/${id}`)

  // без явной аннотации
  const fn = async () => await fetchData()               // () => Promise<Data>
  arr.map(async item => await process(item))             // (item: T) => Promise<U>

  // async IIFE
  const result = await (async () => {
      const data = await fetchData()
      return data.value
  })()
  ```
  Async лямбда везде где допустима обычная лямбда — в `map`, `filter`, `Promise.all` и т.д.

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

## Семантика передачи значений

- **Примитивы** (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`) — всегда **по значению** (copy)
- **Сложные типы** (объекты, массивы, коллекции, структуры, классы, строки) — управляются ownership системой
- Явные `&` аннотации не нужны для базовых случаев — компилятор решает сам

## Операторы

### Арифметические

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

### Присваивание

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

### Сравнения

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

### Логические

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

### Битовые

| Оператор | Описание |
|----------|----------|
| `&` | побитовое И |
| `\|` | побитовое ИЛИ |
| `^` | побитовое XOR |
| `~` | побитовое НЕ |
| `<<` | сдвиг влево |
| `>>` | сдвиг вправо (знаковый) |
| `>>>` | сдвиг вправо (беззнаковый) |

### Прочие

| Оператор | Описание |
|----------|----------|
| `? :` | тернарный оператор |
| `?.` | optional chaining — обращение к полю/методу если не `null` |
| `...` | spread |

### Приоритет операторов

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

## Truthy / Falsy

Как в JS, без `undefined` и `NaN`:

| Тип | Falsy | Truthy |
|-----|-------|--------|
| `boolean` | `false` | `true` |
| числовые (`i8`..`f64`) | `0` | любое ненулевое |
| `string` | `""` (пустая строка) | любая непустая |
| `T | null` (сложный тип) | `null` | не null |
| `T | null` (примитив) | `null` или falsy значение | не null и truthy |
| class / type / interface | никогда (всегда truthy) | всегда |
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

  **Borrow checker:** после `lhs ?? rhs` тип `lhs` сужается до `null` — либо он был null изначально, либо был moved в результат. Использование `lhs` после `??` как non-null значения — ошибка компилятора. Для цепочек `a ?? b ?? c` все левые операнды сужаются до `null`.

  ```typescript
  let s: string | null = getString()
  const result = s ?? "default"
  // после: s — null, result: string (owned)

  s.length          // ошибка: s is null
  if (s != null) {} // компилятор предупреждает: всегда false

  // если нужно переиспользовать — явный clone перед ??:
  const result = s.clone() ?? "default"
  // s жива, result — отдельная копия
  ```

  C-output зависит от типа:
  ```c
  // Примитив (struct { bool has_value; T value; }):
  // const x: i32 | null = getSomething(); const y = x ?? 0;
  int32_t y = x.has_value ? x.value : 0;

  // Сложный тип (указатель) — move: разыменовываем и обнуляем s:
  // let s: string | null = getString(); const result = s ?? "default";
  // s: String* (string | null → указатель), result: String (string → value)
  String result = s != NULL ? *s : (String){ "default", 7, 0 };
  s = NULL;  // s обнуляется после move
  ```

## Индексация и срезы (массивы и строки)

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

## `const` vs `let`

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

## For-of цикл

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

**Переприсвоение `item` — всегда ошибка компилятора**, независимо от типа:

```typescript
for (let item of arr) {
    item = newValue  // ошибка: cannot assign to loop variable
                     // hint: to replace element use index-based loop:
                     //   for (let i = 0; i < arr.length; i++) { arr[i] = newValue }
}
```

Мутация через `Mut<T>` (методы) — разрешена и попадает в массив:
```typescript
let arr = [obj1, obj2, obj3];
for (let item of arr) {
    item.mutMethod();  // ok — изменения попадают в arr
    item = newObj;     // ошибка: cannot assign to loop variable
}
```

Примитивы — `item` всегда копируется независимо от `let`/`const`:

```typescript
let nums = [1, 2, 3];
for (let item of nums) {
    item++;          // ошибка: cannot assign to loop variable
}

// чтобы изменить элементы — используй индекс:
for (let i = 0; i < nums.length; i++) {
    nums[i]++;  // ok
}
```

## while / do-while

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

### async/await в циклах

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

## switch / case

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

## match

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

// match по interface — сравнение vtable-адресов (instanceof под капотом)
// shape: Drawable (interface fat pointer)
interface Drawable { area(): f64 }
class Circle implements Drawable { r: f64; area(): f64 { return Math.PI * this.r * this.r; } }
class Rect   implements Drawable { w: f64; h: f64; area(): f64 { return this.w * this.h; } }

const a = match (shape) {
    Circle { r }    => Math.PI * r * r,
    Rect   { w, h } => w * h,
    // exhaustiveness: компилятор НЕ может знать все реализации interface
    // _ обязателен для interface (в отличие от enum)
    _ => 0.0,
};

// match по type / interface с деструктуризацией по полям (data-only, без vtable)
type Circle2D = { kind: "circle"; r: f64 }
type Rect2D   = { kind: "rect";   w: f64; h: f64 }
// для type-алиасов с дискриминатором — деструктуризация по литералу поля:
const area = match (shape2d) {
    { kind: "circle", r }  => Math.PI * r * r,
    { kind: "rect", w, h } => w * h,
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
- Для **interface**-переменных компилятор не знает всех реализаций → `_` обязателен всегда
- Для **enum** и **`T | null`** компилятор проверяет полноту → `_` только если реально не покрыто
- `|` — несколько паттернов для одной ветки
- Диапазон `a..b` — от `a` включительно до `b` не включительно (как везде в TSC)
- Деструктуризация в паттерне `match` — **move**, не borrow: match потребляет значение целиком, все ветки exhaustive, после match объект мёртв
  ```typescript
  match (result) {
      Ok  { value } => process(value),  // value: T — moved из result
      Err { error } => log(error),      // error: E — moved из result
  }
  // result мёртв — использовать нельзя
  ```
- Если нужен borrow в match — явно указать `Ref`:
  ```typescript
  match (result) {
      Ok  { value: Ref<T> } => inspect(value),  // borrow, result жив после
      Err { error: Ref<E> } => log(error),
  }
  ```

**match vs switch:**

| | `switch` | `match` |
|---|---|---|
| Тип | statement | expression (возвращает значение) |
| Exhaustiveness | warning | ошибка компилятора |
| Паттерны | только равенство | литералы, диапазоны, деструктуризация, `\|` |
| Fallthrough | запрещён | нет (каждая ветка — отдельное выражение) |

## Spread оператор

Spread **потребляет** источник — move. Работает для массивов и объектов.

**Правило:** spread на `const` разрешён если элементы — примитивы (copy). Если элементы — сложные типы, spread на `const` — ошибка компилятора (нельзя move из const).

**Массивы примитивов — const разрешён** (copy):
```typescript
const nums: i32[] = [1, 2, 3];
const copy = [...nums, 4, 5];  // ok — примитивы копируются
console.log(nums);             // ok — nums жив
```

**Массивы сложных типов — const запрещён** (move невозможен):
```typescript
const admins: Admin[] = [admin1, admin2];
const users = [...admins, ...guests];
// ошибка: cannot spread const array of non-primitive type
// hint: use let, Shared<T>, or [...admins.clone()] if Admin implements Clone

let admins: Admin[] = [admin1, admin2];
const users = [...admins, ...guests];  // ok — move из let
sendEmail(admins);  // ошибка: admins перемещён
```

**Объекты — const запрещён** (поля могут быть сложными типами):
```typescript
const base = { x: 1, name: "Alice" };
const extended = { ...base, extra: 42 };
// ошибка: cannot spread const object
// hint: use let, Shared<T>, or { ...base.clone(), extra: 42 } if type implements Clone

let base = { x: 1, name: "Alice" };
const extended = { ...base, extra: 42 };  // ok — move из let
console.log(base);  // ошибка: base перемещён
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
