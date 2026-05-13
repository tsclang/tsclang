# Name mangling

[← Up](./index.md) | [Next →](./debug.md) | [Previous ←](./phases.md)

---

TSClang name encoding scheme into C symbols. Mangling ensures name uniqueness when compiling modules and libraries together, and makes demangling possible without external metadata.

## Type naming rules

Class, interface, and type alias names **must be PascalCase** — compilation error otherwise:

```typescript
class rUser { }    // ❌ type name must start with uppercase letter
class ref_User { } // ❌ type name uses reserved mangling prefix
class User { }     // ✅
```

Reserved prefixes: `ref_`, `mut_`, `arc_`, `opt_`, `arr_`. This guarantees no collisions with ownership qualifiers.

## Type encoding

| TSClang type | Encoding |
|--------------|----------|
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

Generic types encode **arity** as a number right after the name — the demangler unambiguously parses parameters without metadata:

```
Map<string, User>           →  Map2_string_User
Box<i32>                    →  Box1_i32
Box<Ref<User>>              →  Box1_ref_User
Map<string, arr_i32>        →  Map2_string_arr_i32
```

### Composite type examples

```
Ref<User>                   →  ref_User
Mut<i32[]>                  →  mut_arr_i32
User | null                 →  opt_User
Map<string, User[]>         →  Map2_string_arr_User
Shared<Node>                →  arc_Node
```

## Function mangling

```
<mangled>   ::= [<module_slug> "_"] <name> ("_" <type_enc>)*
```

Parameters are encoded in order, **types only** (not names):

```typescript
function foo(a: i32, b: Ref<User>, c: Map<string, i32[]>): void
// → foo_i32_ref_User_Map2_string_arr_i32

function process(x: string): void   // → process_string
function process(x: i32): void      // → process_i32
```

## Method mangling

A method is prefixed with the class name via `_`:

```typescript
class Counter {
    get(): i32 { ... }             // → Counter_get
    mut increment(): void { ... }  // → Counter_increment
    static create(): Counter { }   // → Counter_create
}
```

`mut` and `move` do not participate in mangling — they are not overload discriminators.

## Module slug

All public C symbols (types and functions in `.h`) receive a **module slug** as a prefix — prevents collisions when compiling modules together that have identical type names.

### Slug formation

```
package name    "myco/mylib"  →  "myco_mylib"
file path       "src/user.tsc" →  "src_user"
slug            =  package_slug "_" file_slug
```

```
@myco/mylib / src/user.tsc    →  myco_mylib_src_user
src/models.tsc  (project myapp) →  myapp_src_models
```

### Example: type collision

```c
// @myco/mylib/src/user.tsc — export class User
typedef struct { ... } myco_mylib_src_user_User;

// src/models.tsc of project myapp — export class User
typedef struct { ... } myapp_src_models_User;
// no collision when included together
```

Internal (non-exported) types use a short name inside their own `.c` file — module slug is not needed.

### `--short-symbols` flag

In a release build of an executable project (not a library), the module slug can be omitted — there are no collisions within a single project. The flag does not apply to libraries.

## Formal grammar (EBNF)

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

The grammar is **self-contained** — the demangler is implemented without external metadata.

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

With `--short-symbols` (executable):

```c
int32_t add_i32_i32(int32_t a, int32_t b) {
    return a + b;
}
```

## Errors

| Error | Cause |
|-------|-------|
| `type name must start with uppercase letter` | Type name is not PascalCase |
| `type name uses reserved mangling prefix` | Prefix `ref_`/`mut_`/`arc_`/`opt_`/`arr_` in type name |

## See also

- [Compilation phases](./phases.md) — compiler pipeline
- [Debug info](./debug.md) — demangling in debugger
- [Modules: import/export](../08-modules/import-export.md) — module structure
- [Generics](../04-classes/generics.md) — generic types and arity
