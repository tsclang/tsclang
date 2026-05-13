# Quick Start

[← Up](./index.md) | [Next →](./cli.md) | [Previous ←](./design-philosophy.md)

---

## Requirements

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **CMake** >= 3.16 (for binary compilation)
- **C compiler** — gcc, clang, or avr-gcc (for AVR)

## Installation

```bash
npm install -g tsclang

tsclang --version
```

Running without installation:

```bash
npx tsclang build
```

## Creating a Project

```bash
tsclang init myapp
cd myapp
```

Creates structure:

```
myapp/
  tsc.package.json
  src/
    main.tsc
```

`tsc.package.json`:

```json
{
  "name": "myapp",
  "version": "1.0.0",
  "main": "src/main.tsc"
}
```

## Hello world

`src/main.tsc`:

```typescript
console.log("Hello world")
```

## Build and Run

```bash
tsclang build                  # generate C + compile to binary
tsclang build --emit c         # C generation only (no compilation)
tsclang run                    # build and run
```

Build result:

```
dist/
  main.c              # generated C code
  CMakeLists.txt      # for manual build
  myapp               # binary (if --emit binary)
```

## Single File Build

Without `tsc.package.json` — just pass the file:

```bash
tsclang build hello.tsc
```

## What's Next

- [Syntax](../02-syntax/index.md) — language constructs
- [Memory Model](../05-memory/index.md) — ownership, borrow, `Ref<T>`
- [CLI](./cli.md) — all commands

## See also

- [CLI](./cli.md) — full command description
- [Build System](../09-build/index.md) — configuration, platforms, profiles
