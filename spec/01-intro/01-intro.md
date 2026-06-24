# TSClang — Введение

## Зачем

Много разработчиков с TypeScript идут на C — и это боль. C я люблю, C++ — нет. У C нет достойной экосистемы.

TypeScript компилируется в JavaScript. Почему бы не компилировать его в C? И добавить удобную экосистему — управление библиотеками, зависимостями, кросс-компиляцию под разные платформы (благо есть Clang и LLVM).

Потом я учил Rust. Понравилась безопасная работа с памятью. Почему бы не принести её в C — но сделать лёгкой и простой?

Так появился TSClang: **TypeScript как синтаксис. C как цель. Rust как модель безопасности. npm как опыт экосистемы.**

### Для чего

**Сейчас:**
- Серверный код — HTTP, сокеты, бэкенд
- Десктопные приложения — от терминальных CLI/TUI до полноценных (файловые менеджеры, офисные пакеты, всё что угодно)

**Важно:**
- Системный уровень — драйверы, операционные системы
- Embedded — Arduino, Raspberry Pi, ESP и подобные
- Игры — через OpenGL, DirectX и аналоги
- Библиотеки для нейросетей

**Мечта:**
- Кросс-платформа — Windows, Linux, Mac, Android, iOS
- Ретро-платформы — ZX Spectrum, NES, Sega, MS-DOS
- Собственный ретро-ПК с операционкой и играми

---

## Дизайн-философия

При любом дизайн-решении — иерархия приоритетов:

1. **Безопасность памяти** — ownership, borrow checker
2. **Производительность и типизация**
3. **TS-синтаксис** — максимально сохранять, но не ценой п.1 и п.2

Цель не "существующий TS-код компилируется без изменений", а "TS-разработчик узнаёт синтаксис и чувствует себя дома".

**TS-синтаксис имеет приоритет над любым другим** (Rust, C, Go и т.д.). Заимствовать синтаксис из других языков — только если в TS нет никакой подходящей конструкции.

Новые концепции встраиваются через TS-совместимый синтаксис: `Ref<T>` вместо `&T`, `Mut<T>` вместо `&mut T`, `mut` и `readonly` — уже есть в TS. Классы сохранены, несмотря на отсутствие в Rust.

Вопрос при каждом решении: *можно ли выразить это через существующий TS-синтаксис или его естественное расширение?*

**Обратная совместимость:** простой нативный TS-код без внешних библиотек должен компилироваться в TSClang или требовать только тривиальных правок, которые остаются валидным TS:

```typescript
let a = 10          // может потребовать явной аннотации
let a: number = 10  // — валидно и в TS, и в TSClang
```

Код с классами, объектами, массивами, циклами, template literals — должен работать как есть или с минимальными изменениями.

---

## Overview

TSClang — компилируемый язык с TypeScript-совместимым синтаксисом. Компилятор генерирует C-код и `CMakeLists.txt`, затем C-компилятор (gcc/clang/avr-gcc) собирает бинарник.

- Расширение файлов: `.tsc`
- CLI: `tsclang` (npm-пакет)
- Выход: `.c` / `.h` файлы + `CMakeLists.txt`

### Пайплайн компиляции

```
.tsc → [парсер] → AST → [тайпчекер] → [codegen] → .c → [gcc/clang] → бинарник
```

### Поддерживаемые платформы

| Платформа | Runtime | Примеры |
|-----------|---------|---------|
| Desktop (Linux, macOS, Windows) | libuv | CLI-утилиты, серверы, десктопные приложения |
| Embedded (AVR, ARM) | без heap, без OS | Arduino, ESP, STM32 |
| Retro (NES, Genesis, Spectrum) | bare metal | ZX Spectrum, Sega Genesis |

### Ключевые возможности

- **Ownership и borrow checker** — детерминированное управление памятью без GC, вдохновлено Rust
- **Async/await** — state machine компиляция, event loop через libuv (desktop) или кооперативная многозадачность (embedded)
- **Generics с монорфизацией** — type-safe generics без runtime overhead
- **Кросс-компиляция** — одна кодовая база, разные платформы через `@platform` декоратор
- **npm-подобная экосистема** — `tsc.package.json`, зависимости, версии, реестр пакетов

### Hello World

```typescript
console.log("Hello, TSClang!")
```

Компиляция и запуск:

```bash
tsclang build hello.tsc --outDir out/
cd out && cmake --build . && ./hello
# → Hello, TSClang!
```

---

## Установка

### Требования

- Node.js `>=18.0.0`
- npm `>=9.0.0`
- CMake `>=3.16` (для сборки бинарника / hex)
- Компилятор C: gcc, clang, или avr-gcc (для embedded таргетов)

### Установка из репозитория

```bash
git clone <repo-url> tsclang
cd tsclang
npm install
npx tsx src/index.ts --version
```

### Установка через npm (roadmap)

```bash
npm install -g tsclang
tsclang --version
npx tsclang build hello.tsc
```

---

## Навигация по спецификации

| Раздел | О чём |
|--------|-------|
| [02-syntax/](../02-syntax/) | Операторы, выражения, инструкции, форматирование |
| [03-types/](../03-types/) | Примитивы, number, string, enum, null, generics, utility types |
| [04-ownership/](../04-ownership/) | Ownership, borrow checker, Ref/Mut/Arc/Weak, scope constraint, clone |
| [05-control-flow/](../05-control-flow/) | if/else, loops, for-of, match, switch, while |
| [06-functions/](../06-functions/) | Функции, замыкания, extension methods, перегрузки |
| [07-classes/](../07-classes/) | Классы, интерфейсы, vtable, this-семантика, cleanup |
| [08-collections/](../08-collections/) | Массивы, кортежи, Map, Set, spread, destructuring |
| [09-errors/](../09-errors/) | throw/try/catch, Result, операторы `?` и `!`, cleanup стратегия |
| [10-async/](../10-async/) | async/await, Promise, generators, state machine, AbortSignal |
| [11-concurrency/](../11-concurrency/) | Threads, channels, Atomic, Readonly, ISR |
| [12-modules/](../12-modules/) | import/export, C interop, .d.tsc, @platform |
| [13-build/](../13-build/) | tsc.package.json, CLI, таргеты, package manager |
| [14-stdlib/](../14-stdlib/) | std/console, std/fs, std/net, std/string, std/hal и др. |
| [15-decorators/](../15-decorators/) | decorator function, Descriptor API, codegen |
| [16-tooling/](../16-tooling/) | LSP, linter, оптимизатор, архитектура компилятора |
| [17-migration/](../17-migration/) | TypeScript → TSClang: руководство |
