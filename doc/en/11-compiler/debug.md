# Debug info

[← Up](./index.md) | [Next →](./optimization.md) | [Previous ←](./name-mangling.md)

---

Debugging TSClang applications: from basic `#line` directives to a DAP server with demangling.

## Mechanism: `#line` directives

TSClang compiles `.tsc` → `.c`, then the C compiler generates a binary with DWARF. To make DWARF reference the original `.tsc` files, the compiler inserts `#line` directives:

```c
/* generated C — debug profile */
#line 42 "src/main.tsc"
int32_t result = myapp_src_main_foo_i32(x);

#line 43 "src/main.tsc"
myapp_src_main_bar_string(msg);
```

The C compiler sees `#line` → writes `src/main.tsc:42` into DWARF instead of `main.c:17`. GDB, LLDB, and OpenOCD read DWARF and display `.tsc` lines. Works on all targets including avr-gcc.

### Profiles

`#line` is emitted **only in the debug** profile:

```json
{ "profile": "debug" }    // #line enabled
{ "profile": "release" }  // #line omitted, -O2/-O3
```

## Path configuration

`#line` contains the path to the `.tsc` file. The debugger must be able to find it. Configured in `tsc.package.json`:

```json
{ "debugSourceRoot": "relative" }        // default — relative to project root
{ "debugSourceRoot": "absolute" }        // absolute path — for remote debugging
{ "debugSourceRoot": "/custom/path" }    // explicit base path
```

- `relative` — portable paths, suitable for desktop
- `absolute` — for embedded, where the GDB server (OpenOCD) is on a different machine

## What the developer sees in the debugger

File and line — `.tsc`. Variable names and types — C (DWARF describes the generated C):

```
(gdb) backtrace
#0  myapp_src_user_loadUsers () at src/user.tsc:15   ← .tsc line ✅
#1  myapp_src_main_main ()       at src/main.tsc:8

(gdb) info locals
users = 0x20001234                                   ← C pointer
first = {name = {data = 0x20001250, len = 5}, age = 30}  ← C struct layout
```

### Closure

```
_Closure_42 = {ctx = {id = 1, name = ...}}
```

### Async state machine

```
_FetchUser_state = {_state = 1, id = 42, resp = ...}
// _state = 1 means "after the first await"
```

### Mangled names

Functions are visible with C names. The demangler is built into `tsclang debug --dap`.

## Embedded (OpenOCD / SWD)

OpenOCD uses the GDB protocol → reads DWARF → `#line` works without additional configuration. `"debugSourceRoot": "absolute"` is recommended for embedded projects.

## `tsclang debug --dap` — enhanced debugging

A DAP server (Debug Adapter Protocol) sits between the IDE and GDB/OpenOCD and transforms responses:

```
IDE (VS Code / any DAP-compatible)
    ↕  DAP protocol
tsclang debug --dap          ← TSClang DAP server
    ↕  GDB MI protocol
GDB / LLDB / OpenOCD
```

### Comparison

| Without DAP server | With `tsclang debug --dap` |
|--------------------|----------------------------|
| `myapp_src_user_User_getName` | `User.getName()` |
| `_Closure_42 = {ctx = ...}` | `[ctx](x) => ... = {ctx = ...}` |
| `_FetchUser_state._state = 1` | `fetchUser — after the first await` |
| C struct layout | TSClang types with original field names |

### Launch

```bash
tsclang debug --dap --port 4711             # desktop: GDB under the hood
tsclang debug --dap --openocd --port 4711   # embedded: OpenOCD under the hood
```

VS Code connects to port 4711 via standard DAP. No separate extension is required.

## Limitations

| Feature | Status |
|---------|--------|
| File and line in debugger | ✅ via `#line` |
| TSClang names with DAP server | ✅ via `tsclang debug --dap` |
| Columns | ❌ `#line` does not support them |
| TSClang types without DAP server | ❌ C types are visible |
| Embedded (avr-gcc + OpenOCD) | ✅ works |

## C-output

Debug profile:

```c
// build/desktop/c/main.c
#include <stdint.h>
#include "runtime.h"

#line 5 "src/main.tsc"
int32_t myapp_src_main_add_i32_i32(int32_t a, int32_t b) {
#line 6 "src/main.tsc"
    return a + b;
}
```

Release profile — `#line` directives omitted:

```c
int32_t myapp_src_main_add_i32_i32(int32_t a, int32_t b) {
    return a + b;
}
```

## Errors

| Error | Cause |
|-------|-------|
| `source file not found: src/main.tsc` | Debugger cannot find the `.tsc` file at the path from `#line` |
| `DAP connection refused` | DAP server is not running or the port is occupied |

## See also

- [Name mangling](./name-mangling.md) — encoding scheme, demangling
- [Optimization](./optimization.md) — debug/release levels
- [Embedded build](../09-build/embedded.md) — AVR, OpenOCD, SWD
- [Configuration](../09-build/config.md) — `debugSourceRoot`, profiles
