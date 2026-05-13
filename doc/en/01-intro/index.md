# Introduction to TSClang

[← Up](../index.md) | [Next →](./what-is-tsclang.md)

---

TSClang is a language with TypeScript syntax that compiles to C.

- **TypeScript as syntax** — familiar `let`/`const`, classes, arrow functions, `async`/`await`
- **C as compilation target** — readable C code + `CMakeLists.txt` is generated
- **Rust as safety model** — ownership, borrow checker, `Ref<T>`, `Mut<T>`
- **npm as ecosystem experience** — `tsc.package.json`, `tsclang install`, package registry

## Sections

- [What is TSClang](./what-is-tsclang.md) — why, for whom, use cases
- [Design Philosophy](./design-philosophy.md) — three priorities: safety, performance, TS syntax
- [Quick Start](./quick-start.md) — installation, hello world, build and run
- [CLI](./cli.md) — command overview: `build`, `init`, `lint`, `migrate`, `lsp`

## See Also

- [Syntax](../02-syntax/index.md) — language constructs
- [Memory Model](../05-memory/index.md) — ownership and borrow checker
