# Overview

TSClang — компилируемый язык с TypeScript-совместимым синтаксисом. Компилятор генерирует C-код и `CMakeLists.txt`, затем C-компилятор (gcc/clang/avr-gcc) собирает бинарник.

- Расширение файлов: `.tsc`
- CLI: `tsclang` (npm-пакет)
- Выход: `.c` / `.h` файлы + `CMakeLists.txt`

## Пайплайн компиляции

```
.tsc → [lexer] → tokens → [parser] → AST → [optimizer] → [decorator pass] → [typecheck] → [codegen] → .c → [gcc/clang] → бинарник
```

Подробности — [16-tooling/16-compiler.md](../16-tooling/16-compiler.md)

## Поддерживаемые платформы

| Платформа | Profile | Async | defaultNumber |
|-----------|---------|-------|---------------|
| Desktop (Linux, macOS, Windows) | desktop | libuv | f64 |
| AVR | avr | none | i16 |
| AVR (heap) | avr-heap | state_machine | i16 |
| AVR (coop) | avr-coop | state_machine | i16 |
| ARM | arm | state_machine | i32 |
| NES | nes | none | i16 |
| Spectrum | spectrum | none | i16 |
| Genesis | genesis | none | i32 |
| PS2 | ps2 | none | f32 |
| DOS | dos | none | f64 |
| WASM | wasm | none | f64 |
| WASM32 | wasm32 | libuv | f64 |

## Ключевые возможности

- **Ownership и borrow checker** — детерминированное управление памятью без GC, вдохновлено Rust → [04-ownership/](../04-ownership/)
- **Async/await** — state machine компиляция, event loop через libuv (desktop) или кооперативная многозадачность (embedded) → [10-async/](../10-async/)
- **Generics с монорфизацией** — type-safe generics без runtime overhead → [07-classes/07-generics.md](../07-classes/07-generics.md)
- **Кросс-компиляция** — одна кодовая база, разные платформы через `@platform` декоратор → [12-modules/12-platform.md](../12-modules/12-platform.md)
- **npm-подобная экосистема** — `tsc.package.json`, зависимости, версии, реестр пакетов → [13-build/](../13-build/)

## Hello World

→ [05-hello-world.md](./05-hello-world.md)
