# Import / Export

[← Up](./index.md) | [Next →](./d-tsc.md) | [Previous ←](./index.md)

---

TSClang's module system is compatible with TypeScript in syntax. Only named exports, two kinds of imports, automatic generation of `#include` and forward declarations.

## Named Export

All exported entities are marked with `export`:

```typescript
export class User {
    name: string
    constructor(name: string) { this.name = name }
}

export interface Drawable { draw(): void }
export type UserId = i32
export type Nullable<T> = T | null
export function helper(): void { /* ... */ }
export const MAX: i32 = 100
```

### Re-export

```typescript
export { User, helper } from "./user"
```

### export default Is Forbidden

`export default` **is forbidden** — an intentional break with TypeScript. Reason: C requires an explicit name for each symbol, anonymous and default exports have no name for code generation.

```typescript
export default class UserService { }    // ❌ — default forbidden
export default { x: 1, y: 2 }          // ❌ — no name for C symbol
export default function() { /* ... */ } // ❌ — anonymous function without name
```

## Named Import

Import specific symbols from a module:

```typescript
import { User, createUser } from "./user"
```

### Namespace Import

The entire module as an object — analog of `import * as X` from TypeScript:

```typescript
import User from "./user"    // all exports available via User.X

const u = new User.UserService()
User.getUser()
```

> **Intentional break with TS:** in TypeScript `import X from "./module"` means default import. In TSClang this is a namespace import of the entire module. There are no default exports, so the semantic redefinition does not create a conflict.

### import type

Compile-time only, generates forward declaration in C instead of full `#include`:

```typescript
import type { UserId, Drawable } from "./user"
```

Allows avoiding extra `#include` in C-output:

```c
// import { User } → #include "user.h"
// import type { UserId } → typedef int32_t UserId;  // or forward declaration
```

## Module Initialization Order

Each module with module-level variables gets an `_init()` function. Call order is determined by **topological sort** of the import graph:

```c
static void tsc_init_all() {
    a_type_init();  // no dependencies — first
    bar_init();     // depends on a_type
    foo_init();     // depends on a_type and bar
}

int main() {
    tsc_init_all();
    // ... user code
}
```

## Circular Imports

Two cases:

| Situation | Result |
|----------|-----------|
| Cycle through types and functions | ✅ Allowed — compiler generates forward declarations in `.h` |
| Cycle through module-level variables | ❌ Error — physically unresolvable |

```typescript
// a.tsc
const aVal = bFunc()   // needs b

// b.tsc
const bVal = aFunc()   // needs a — who initializes first?
```

```
error: circular initialization dependency detected
  src/a.tsc:2  aValue depends on bValue
  src/b.tsc:2  bValue depends on aValue
hint: move one of these values into a function
```

## Module-level Variables

Variables outside functions and classes — module-level. Compiled into C static memory.

```typescript
const MAX_CONNECTIONS: i32 = 100      // compile-time constant
let requestCount: i32 = 0             // mutable global
const defaultUser = new User("guest") // owned, initialized at startup
```

| TSClang | C | Initialization |
|---------|---|---------------|
| `const x: i32 = 5` | `static const int32_t x = 5` | compile-time |
| `let x: i32 = 0` | `static int32_t x = 0` | compile-time |
| `const arr: i32[4] = [...]` | `static int32_t arr[4] = {...}` | compile-time |
| `const x = new Foo()` | `static Foo* x = NULL` | in `_init()` at startup |

### Thread Safety

Mutable `let` at module level is unsafe for multi-threaded access — compile error if `Thread.spawn` captures such a variable:

```typescript
let counter = 0                     // ❌ error if captured by Thread.spawn
const counter = new Atomic<i32>(0)  // ✅ thread-safe
```

### heap: false Platforms

Module-level owned objects (`new`, `Shared<T>`) are forbidden — no heap:

```typescript
// AVR (heap: false)
const config = new Config()         // ❌ heap allocation forbidden
const config: Config = { ... }      // ✅ value type — static memory
const buf: u8[256] = [0, ...]       // ✅ fixed array — static memory
```

## Path Aliases

Short names for paths instead of `../../..`:

```typescript
// Without aliases
import { utils } from "../../../shared/utils"

// With aliases
import { utils } from "#shared/utils"
```

### Alias Symbols

`@` is reserved for package registry scopes. For aliases use `#` or `~`:

| Symbol | Purpose | Example |
|--------|------------|--------|
| `@` | Registry scopes | `@mycompany/mylib`, `@tsc/sqlite3` |
| `#` | Path aliases (recommended) | `#/components/Button`, `#shared/utils` |
| `~` | Path aliases (alternative) | `~/components/Button` |

### Configuration

In `tsc.package.json`, `paths` field:

```json
{
    "paths": {
        "#/*": ["./src/*"],
        "#shared/*": ["./src/shared/*"],
        "#ui/*": ["./src/components/ui/*"]
    }
}
```

### Wildcard `*`

`*` in the key is replaced by the matched part in the value (only one `*` per alias):

```typescript
import { Button } from "#components/Button"      // → ./src/components/Button
import { Input } from "#components/forms/Input"   // → ./src/components/forms/Input
```

### Warning About Direct Aliases

Direct aliases without prefix may conflict with stdlib:

```json
{
    "paths": {
        "io/*": ["./src/io/*"]
    }
}
```

With direct alias `io/*`, import `import ... from "io"` resolves to the alias, not `std/io`. With direct aliases always use explicit `std/` for stdlib.

## Entry Point

Defined by the `"main"` field in `tsc.package.json`:

```json
{ "name": "myapp", "main": "src/main.tsc" }
```

Multiple entry points — via `builds`:

```json
{
    "builds": {
        "server": { "main": "src/server.tsc" },
        "cli":    { "main": "src/cli.tsc" }
    }
}
```

`index.tsc`, `main.tsc`, etc. are **not** special names.

## Libraries

```json
{ "name": "mylib", "type": "library" }
```

The `"type": "library"` field — compiler generates `.h` files and `.a`/`.so` without `main()`. Declarations are recommended to be placed at the root: `index.d.tsc`.

## C-output

```typescript
import { User } from "./user"
const u = new User("Alice")
console.log(u.name)
```

```c
#include "user.h"

int main(void) {
    tsc_init_all();
    User u = {0};
    User_init(&u, STR_LIT("Alice"));
    printf("%s\n", u.name.data);
    User_free(&u);
    return 0;
}
```

`import type` does not generate `#include`, only forward declaration:

```typescript
import type { UserId } from "./user"
export function get(id: UserId): void { /* ... */ }
```

```c
typedef int32_t UserId;
void get(UserId id) { /* ... */ }
```

## Errors

| Error | Cause | Solution |
|--------|---------|---------|
| `export default is not allowed` | Default export forbidden | Use named export |
| `cannot determine entry point` | No `"main"` field | Add `"main": "src/main.tsc"` |
| `main file not found` | File does not exist | Check path |
| `circular initialization dependency detected` | Cycle of module-level variables | Move one into a function |
| `User is not Scalar` | Non-scalar type in variadic C function | Wrap or use another type |

## See Also

- [.d.tsc files](./d-tsc.md) — declarations for C interop
- [native — inline C](./native.md) — verbatim C code insertion
- [@platform — conditional compilation](./platform.md) — platform-dependent implementations
- [Variables: let / const](../02-syntax/variables/index.md) — module-level variables
- [Concurrency](../07-concurrency/index.md) — thread-safety for global variables
