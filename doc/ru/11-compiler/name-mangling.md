# Name mangling

[← Вверх](./index.md) | [Следующий →](./debug.md) | [Предыдущий ←](./phases.md)

---

Схема кодирования TSClang-имён в C-символы. Манглинг обеспечивает уникальность имён при совместной компиляции модулей и библиотек, а также делает возможным деманглинг без внешних метаданных.

## Правила именования типов

Имена классов, интерфейсов и type-алиасов обязаны быть **PascalCase** — ошибка компиляции:

```typescript
class rUser { }    // ❌ type name must start with uppercase letter
class ref_User { } // ❌ type name uses reserved mangling prefix
class User { }     // ✅
```

Зарезервированные префиксы: `ref_`, `mut_`, `arc_`, `opt_`, `arr_`. Это гарантирует отсутствие коллизий с ownership-квалификаторами.

## Кодирование типов

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

Generic-типы кодируют **арность** числом сразу после имени — деманглер однозначно разбирает параметры без метаданных:

```
Map<string, User>           →  Map2_string_User
Box<i32>                    →  Box1_i32
Box<Ref<User>>              →  Box1_ref_User
Map<string, arr_i32>        →  Map2_string_arr_i32
```

### Примеры составных типов

```
Ref<User>                   →  ref_User
Mut<i32[]>                  →  mut_arr_i32
User | null                 →  opt_User
Map<string, User[]>         →  Map2_string_arr_User
Shared<Node>                →  arc_Node
```

## Манглинг функций

```
<mangled>   ::= [<module_slug> "_"] <name> ("_" <type_enc>)*
```

Параметры кодируются по порядку, **только типы** (не имена):

```typescript
function foo(a: i32, b: Ref<User>, c: Map<string, i32[]>): void
// → foo_i32_ref_User_Map2_string_arr_i32

function process(x: string): void   // → process_string
function process(x: i32): void      // → process_i32
```

## Манглинг методов

Метод предваряется именем класса через `_`:

```typescript
class Counter {
    get(): i32 { ... }             // → Counter_get
    mut increment(): void { ... }  // → Counter_increment
    static create(): Counter { }   // → Counter_create
}
```

`mut` и `move` не попадают в манглинг — они не являются discriminator'ом перегрузки.

## Module slug

Все публичные C-символы (типы и функции в `.h`) получают **module slug** как префикс — предотвращает коллизии при совместной компиляции модулей с одинаковыми именами типов.

### Формирование slug

```
package name    "myco/mylib"  →  "myco_mylib"
file path       "src/user.tsc" →  "src_user"
slug            =  package_slug "_" file_slug
```

```
@myco/mylib / src/user.tsc    →  myco_mylib_src_user
src/models.tsc  (проект myapp) →  myapp_src_models
```

### Пример: коллизия типов

```c
// @myco/mylib/src/user.tsc — export class User
typedef struct { ... } myco_mylib_src_user_User;

// src/models.tsc проекта myapp — export class User
typedef struct { ... } myapp_src_models_User;
// нет коллизии при совместном include
```

Внутренние (неэкспортируемые) типы используют короткое имя внутри своего `.c` файла — module slug не нужен.

### Флаг `--short-symbols`

В release-билде исполняемого проекта (не библиотеки) module slug можно опустить — в рамках одного проекта коллизий нет. Флаг не применим к библиотекам.

## Формальная грамматика (EBNF)

```ebnf
mangled      ::= module_slug "_" local_name | local_name
local_name   ::= ident ("_" type_enc)*
type_enc     ::= primitive
               | "ref_" type_enc
               | "mut_" type_enc
               | "arc_" type_enc
               | "opt_" type_enc
               | "arr_" type_enc
               | user_type digit+ ("_" type_enc)*   (* generic: arity *)
               | user_type                           (* non-generic *)
primitive    ::= "i8"|"i16"|"i32"|"i64"|"u8"|"u16"|"u32"|"u64"
               | "f32"|"f64"|"bool"|"string"|"usize"|"void"
user_type    ::= [A-Z] [a-zA-Z0-9]*
module_slug  ::= [a-z0-9] [a-z0-9_]*
```

Грамматика **самодостаточна** — деманглер реализуется без внешних метаданных.

## C-output

```typescript
// src/calc.tsc
function add(a: i32, b: i32): i32 {
    return a + b
}
```

```c
// module slug: myapp_src_calc
int32_t myapp_src_calc_add_i32_i32(int32_t a, int32_t b) {
    return a + b;
}
```

С `--short-symbols` (executable):

```c
int32_t add_i32_i32(int32_t a, int32_t b) {
    return a + b;
}
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `type name must start with uppercase letter` | Имя типа не PascalCase |
| `type name uses reserved mangling prefix` | Префикс `ref_`/`mut_`/`arc_`/`opt_`/`arr_` в имени типа |

## См. также

- [Фазы компиляции](./phases.md) — pipeline компилятора
- [Debug info](./debug.md) — деманглинг в debugger
- [Модули: импорт/экспорт](../08-modules/import-export.md) — структура модулей
- [Дженерики](../04-classes/generics.md) — generic-типы и арность
