## Name mangling — формальная схема

### Правила именования пользовательских типов

Имена классов, интерфейсов и type-алиасов обязаны быть **PascalCase** — ошибка компилятора (не линтер):

```typescript
class rUser { }    // ❌ ошибка: type name must start with uppercase letter
class ref_User { } // ❌ ошибка: type name uses reserved mangling prefix
class User { }     // ✅
```

Зарезервированные префиксы имён типов: `ref_`, `mut_`, `shared_`, `weak_`, `opt_`, `Array_`. Это гарантирует отсутствие коллизий с encoding ownership-квалификаторов.

### Кодирование типов

| TSClang тип | Encoding |
|-------------|----------|
| `i8` `i16` `i32` `i64` | `i8` `i16` `i32` `i64` |
| `u8` `u16` `u32` `u64` | `u8` `u16` `u32` `u64` |
| `f32` `f64` | `f32` `f64` |
| `boolean` `string` `usize` `void` | `bool` `string` `usize` `void` |
| `UserType` (non-generic) | `UserType` |
| `Ref<T>` | `ref_` + enc(T) |
| `Mut<T>` | `mut_` + enc(T) |
| `Shared<T>` | `shared_` + enc(T) |
| `Weak<T>` | `weak_` + enc(T) |
| `T | null` | `opt_` + enc(T) |
| `T[]` | `Array_` + enc(T) |
| `Generic<T, U>` (N type-params) | `Generic_` + enc(T) `_` enc(U) |

Generic-типы кодируются без арности — суффикс состоит из закодированных параметров через `_`:

```
Map<string, User>           →  Map_string_User
Box<i32>                    →  Box_i32
Box<Ref<User>>              →  Box_ref_User
Map<string, Array_i32>      →  Map_string_Array_i32
```

Примеры составных типов:

```
Ref<User>                   →  ref_User
Mut<i32[]>                  →  mut_Array_i32
User | null                 →  opt_User
Map<string, User[]>         →  Map_string_Array_User
Shared<Node>                →  shared_Node
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
// → foo_i32_ref_User_Map_string_Array_i32

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
                | "f32"|"f64"|"bool"|"string"|"char"|"usize"|"void"
user_type    ::= [A-Z] [a-zA-Z0-9]*
module_slug  ::= [a-z0-9] [a-z0-9_]*
ident        ::= [a-zA-Z_] [a-zA-Z0-9_]*
digit        ::= [0-9]+
```

Грамматика самодостаточна: деманглер не требует внешних метаданных.

