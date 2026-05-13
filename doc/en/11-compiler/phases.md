# Compilation phases

[← Up](./index.md) | [Next →](./name-mangling.md) | [Previous ←](./index.md)

---

TSClang goes through several phases from source `.tsc` to C99 generation.

## Overview

```
Parse → AST → Decorator pass → Typecheck → Lower to IR → Ownership Analysis → Codegen
                                                  ↑              ↑
                                             Flatten CFG    Borrow checker / ARC injection
```

## Parse

The lexer (`lexer.js`) breaks the source into tokens, the parser (`parser.js`) builds the AST. Formatting does not affect the result — the parser checks only semantics.

## AST

The result of parsing is a tree with nodes for declarations, expressions, and types. The AST is used by all subsequent phases.

## Decorator pass

Executed **after parsing, before typecheck**. Walks all classes and functions in declaration order, applying decorators.

### Algorithm

1. Walk all classes and functions in declaration order
2. For each decorated node — evaluate decorators top-to-bottom (factories are called)
3. Apply the resulting functions bottom-to-top — each receives and returns a descriptor
4. The modified descriptor replaces the original node in the AST
5. After walking all nodes — AST is modified, proceed to Typecheck

### Limitations

| Operation | Allowed |
|-----------|---------|
| Read `cls.name`, `desc.params`, `desc.returnType` | Yes |
| Call `desc.before()`, `desc.after()` | Yes |
| Call `cls.addField()`, `cls.addMethod()` | Yes |
| Read `meta` of other classes | No — traversal order is not guaranteed |
| Call runtime functions | No — runtime does not exist yet |
| Read types of fields added by another decorator | No — if that decorator hasn't run yet |

Decorator pass errors are compile-time errors, stopping compilation before Typecheck.

## Typecheck

Type checking across the whole program: assignment compatibility, type inference, exhaustiveness of `switch`, generic constraints.

### Example type error

```
error[TSC-E011]: type mismatch — expected `i32`, got `f64`
  --> src/calc.tsc:5:18
   |
 5 |     let x: i32 = 3.14
   |                  ^^^^ expected i32
   |
   = hint: use explicit cast `3.14 as i32` (truncates) or change type to `f64`
```

## Lower to IR

The typed AST is lowered into an **SSA-like IR** based on basic blocks. IR makes the execution order explicit, "flattens" nesting.

### Basic Block

The IR unit — a linear sequence of instructions with a single terminator at the end. Branching only occurs at block boundaries.

```
block entry:
    alloc x, i32, 5
    alloc y, i32, 10
    branch (x > y), then_block, else_block

block then_block:
    call print, [x]
    jump end_block

block else_block:
    call print, [y]
    jump end_block

block end_block:
    phi result, [x from then_block, y from else_block]
    return result
```

### IR instructions

| Operation | Description |
|-----------|-------------|
| `alloc x, type, value` | Create variable, owner |
| `borrow x, source, imm\|mut` | Borrow (`Ref`/`Mut`) |
| `retain x` | Increment refcount (`Shared`) |
| `release x` | Decrement refcount |
| `call x, fn, args` | Function call, result in `x` |
| `assign x, value` | Assignment |
| `drop x` | End of variable lifetime |
| `return value` | Return (terminator) |
| `branch cond, then, else` | Conditional jump (terminator) |
| `jump label` | Unconditional jump (terminator) |
| `phi x, [v1 from b1, ...]` | Phi-node — value depends on the previous block |
| `await x, resume_label` | Suspend coroutine (terminator for async) |
| `yield value` | Yield control to the scheduler (async) |

### Phi nodes

Appear when control-flow paths merge — for example, a variable is assigned in both branches of `if/else`. Phi does not generate C code directly — the borrow checker and codegen read it to know where the value came from.

### Example: borrow in IR

```typescript
let users = [user1, user2, user3]
const first = users[0]
push(users, user4)    // error: users is borrowed
```

```
block entry:
    alloc users, User[], [user1, user2, user3]
    borrow first, users[0], imm       // first = Ref<User>
    call _, push, [users, user4]      // ← error: users is borrowed (first is alive)
    drop first
    drop users
    return void
```

## Ownership Analysis

Borrow checker + ARC injection on IR. A linear pass over basic blocks: tracks variable lifetimes, borrows, drop points.

### Async lowering

An `async` function is compiled into a state machine. `await` becomes `suspend + resume`:

```typescript
async function fetchUser(id: i32): Promise<User> {
    const resp = await fetch("/api/" + id)
    return resp.json<User>()
}
```

```
// State machine struct: { _state: u8, id: i32, resp: Response }

block state_0:         // initial state
    alloc url, string, "/api/" + id
    call resp_future, fetch, [url]
    await resp_future, state_1     // suspend → save id in struct, exit
    drop url

block state_1:         // resume after await
    assign resp, resp_future.result
    call result, resp.json<User>, []
    return result

block state_cleanup:   // on cancel or error
    drop resp
    return error
```

### Why IR

- Explicit operation order (unlike AST)
- Simple checks for the borrow checker (linear pass over blocks)
- Phi nodes make merging explicit — the borrow checker sees all paths
- Async lowering — clear mapping of `await` → state transitions
- Almost 1:1 with C — codegen is trivial

## Codegen

IR is translated into C99. The code generator produces:
- `.c` and `.h` files for each module
- `CMakeLists.txt` for building
- `#line` directives in debug profile

## C-output

```c
// generated from src/main.tsc
#include <stdint.h>
#include "runtime.h"

int32_t myapp_src_main_foo_i32(int32_t x) {
    return x * 2;
}

int main(void) {
    tsc_init_all();
    int32_t result = myapp_src_main_foo_i32(21);
    printf("%d\n", result);
    return 0;
}
```

## Errors

| Code | Description |
|------|-------------|
| `TSC-E042` | Cannot borrow `mut` — already borrowed as immutable |
| `TSC-E043` | Use of moved value |
| `TSC-E044` | `Ref<T>` cannot be stored in a field — lifetime is not tracked |
| `TSC-E051` | `Ref<T>` cannot cross `await` |
| `TSC-E011` | Type mismatch |
| `TSC-E021` | Property does not exist on type |
| `TSC-E031` | Non-exhaustive switch — missing case |

## See also

- [Name mangling](./name-mangling.md) — encoding of names and types in C-output
- [Debug info](./debug.md) — `#line` directives and DAP server
- [Decorators](../04-classes/decorators.md) — decorator pass in detail
- [Memory model](../05-memory/index.md) — ownership, borrow checker
