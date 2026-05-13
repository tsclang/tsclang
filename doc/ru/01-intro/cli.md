# CLI — обзор команд

[← Вверх](./index.md) | [Предыдущий ←](./quick-start.md)

---

## Список команд

| Команда | Алиас | Описание |
|---------|-------|----------|
| `tsclang init` | — | Создать новый проект |
| `tsclang build` | `b` | Собрать проект |
| `tsclang run` | `r` | Собрать и запустить |
| `tsclang lint` | `l` | Проверить форматирование |
| `tsclang migrate` | — | Миграция TypeScript → TSClang *(roadmap)* |
| `tsclang lsp` | — | Language Server Protocol для IDE *(roadmap)* |

Алиасы:

```bash
tsclang b        # = tsclang build
tsclang r        # = tsclang run
tsclang l        # = tsclang lint
```

## tsclang init

Создаёт проект из шаблона.

```bash
tsclang init myapp                    # executable (по умолчанию)
tsclang init mylib --library          # TSClang-библиотека
tsclang init sqlite3 --declaration    # C-wrapper (обёртка над C-библиотекой)
tsclang init                          # в текущей директории
```

Короткие флаги: `-l` (library), `-d` (declaration).

## tsclang build

Компилирует `.tsc` → `.c` → бинарь (по умолчанию).

```bash
tsclang build                  # собрать дефолтный build
tsclang build <name>           # собрать конкретный build из конфигурации
tsclang build hello.tsc        # одиночный файл
tsclang build --emit c         # только генерация C
tsclang build --emit binary    # C + компиляция в бинарь (по умолчанию)
tsclang build --emit hex       # C + avr-gcc → .hex (для AVR)
tsclang build --outDir ./dist  # переопределить outDir
tsclang build --target desktop # явно указать таргет
tsclang build --clean          # полная пересборка (без кеша)
```

## tsclang run

Собирает и запускает бинарь. Эквивалент `tsclang build` + запуск.

```bash
tsclang run
tsclang run -- args...         # передать аргументы в программу
```

Только для `emit: "binary"`.

## tsclang lint

Проверяет стиль кода. Для CI — `tsclang lint` (без `-fix`) возвращает exit code 1 при нарушениях.

```bash
tsclang lint          # проверить без изменений
tsclang lint --fix    # форматировать код на месте (как prettier / gofmt)
```

Разница с `tsclang build`:

| Команда | Что проверяет |
|---------|--------------|
| `tsclang build` | Семантические ошибки, форматирование игнорируется |
| `tsclang lint` | Семантика + предупреждения о стиле, exit 1 при нарушениях |
| `tsclang lint --fix` | Форматирует код автоматически |

## tsclang migrate *(roadmap)*

Миграция TypeScript-кода в TSClang.

```bash
tsclang migrate ./src            # показать что изменится (dry-run)
tsclang migrate ./src --fix      # применить изменения
tsclang migrate ./src --check    # CI-режим: exit 1 если есть несовместимости
```

## tsclang lsp *(roadmap)*

Language Server Protocol для IDE (VS Code, Neovim и др.).

```bash
tsclang lsp               # stdio transport
tsclang lsp --port 7777   # TCP transport
```

## См. также

- [Быстрый старт](./quick-start.md) — установка и первый проект
- [Система сборки](../09-build/index.md) — конфигурация, профили, платформы
- [Migration Guide](../12-migration/index.md) — перенос TS-кода
