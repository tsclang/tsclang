# Введение в TSClang

[← Вверх](../index.md) | [Следующий →](./what-is-tsclang.md)

---

TSClang — язык с синтаксисом TypeScript, который компилируется в C.

- **TypeScript как синтаксис** — привычные `let`/`const`, классы, стрелочные функции, `async`/`await`
- **C как цель компиляции** — генерируется читаемый C-код + `CMakeLists.txt`
- **Rust как модель безопасности** — ownership, borrow checker, `Ref<T>`, `Mut<T>`
- **npm как опыт экосистемы** — `tsc.package.json`, `tsclang install`, реестр пакетов

## Разделы

- [Что такое TSClang](./what-is-tsclang.md) — зачем, для кого, область применения
- [Дизайн-философия](./design-philosophy.md) — три приоритета: безопасность, производительность, TS-синтаксис
- [Быстрый старт](./quick-start.md) — установка, hello world, сборка и запуск
- [CLI](./cli.md) — обзор команд: `build`, `init`, `lint`, `migrate`, `lsp`

## См. также

- [Синтаксис](../02-syntax/index.md) — конструкции языка
- [Модель памяти](../05-memory/index.md) — ownership и borrow checker
