# Compiler Architecture

[← Up](../index.md) | [Next →](./phases.md)

---

TSClang compiler architecture for contributors. The compiler translates `.tsc` to C99, delegating machine optimizations to the C compiler (gcc/clang/avr-gcc).

## Pipeline

```
.tsc source
    ↓
Parse (lexer + parser)      →  AST
    ↓
Decorator pass              →  modified AST
    ↓
Typecheck                   →  typed AST
    ↓
Lower to IR                 →  SSA-like IR (basic blocks)
    ↓
Ownership Analysis          →  borrow checker + ARC injection
    ↓
Codegen                     →  C99 + #line + CMakeLists.txt
    ↓
C compiler                  →  binary / .hex
```

## Source Code

| Path | Purpose |
|------|---------|
| `src/compiler/lexer.js` | Lexer |
| `src/compiler/parser.js` | Parser → AST |
| `src/compiler/types.js` | Helper types and mangling |
| `src/compiler/codegen.js` | Codegen entry point, Context class |
| `src/compiler/codegen/top-level/` | Classes, functions, interfaces, enum, type aliases |
| `src/compiler/codegen/stmt/` | Variable declarations, control-flow, destructuring, match |
| `src/compiler/codegen/expr/` | Expression dispatcher, operators, assignment, literals |
| `src/compiler/codegen/calls/` | Calls: methods, console, stdlib, builtin, conversions, concurrency |
| `src/compiler/codegen/types/` | Type resolution, inference, helpers |
| `src/compiler/codegen/misc/` | Helpers, new-expr, closures, arrays |
| `src/compiler/codegen/async/` | Async: statements, emit, generators, helpers, scanning |
| `src/compiler/codegen/generics.js` | Generic monomorphization |
| `src/runtime/runtime.h` | C-runtime header file |

## Testing Methodology

Each component is implemented in a cycle:

```
1. Tests     — corpus (input.tsc → expected.c / expected.error)
2. Implementation — until all tests pass
3. Log       — log/<component>.md: decisions, problems, changes
```

Test corpus: `test/cases/phase0–phase19`, total 1028 tests. Format described in `test/CORPUS.md`.

## Subpages

| Page | Description |
|------|-------------|
| [Compilation Phases](./phases.md) | Parse → AST → Decorator → Typecheck → IR → Ownership → Codegen |
| [Name mangling](./name-mangling.md) | Formal scheme, type encoding, module slug, collisions |
| [Debug info](./debug.md) | `#line` directives, DAP server, embedded debugging |
| [Optimization](./optimization.md) | Levels O0–O3/Os, consumer-side monomorphization, incremental *(roadmap)* |

## Errors

| Error | Cause |
|-------|-------|
| `type name must start with uppercase letter` | Class/interface name not PascalCase |
| `type name uses reserved mangling prefix` | Using `ref_`, `mut_`, `arc_`, `opt_`, `arr_` in type name |
| `error[TSC-EXXX]` | Stable error code — searchable in documentation |

## See also

- [Decorators](../04-classes/decorators.md) — decorator pass: algorithm and limitations
- [Memory Model](../05-memory/index.md) — ownership, borrow checker, IR instructions
- [Build System](../09-build/index.md) — CMake, profiles, embedded targets
