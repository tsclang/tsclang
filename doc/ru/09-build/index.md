# Система сборки

[← Вверх](../index.md) | [Следующий →](./projects.md)

---

Система сборки TSClang компилирует `.tsc`-файлы в C99 и собирает бинарник через CMake. Поддерживаются desktop-приложения, библиотеки, C-wrapper'ы для нативных C-библиотек и embedded-таргеты (AVR, ARM, ретро-платформы).

## Pipeline

```
src/*.tsc  →  <outDir>/c/*.c + CMakeLists.txt  →  <outDir>/myapp (или .hex)
              ↑                                    ↑
           tsclang build (transpile)          cmake + gcc/avr-gcc
```

Структура `outDir`:

```
build/desktop/
  c/              ← сгенерированные .c и .h
  CMakeLists.txt
  myapp           ← бинарь (emit: binary)

build/avr/
  c/
  CMakeLists.txt
  myapp.hex       ← (emit: hex)
```

## Быстрый старт

```bash
npm install -g tsclang   # установить компилятор
tsclang init myapp       # создать проект
cd myapp
tsclang install          # установить зависимости
tsclang run              # собрать и запустить
```

## Типы проектов

| Тип | Описание | `"type"` | Entry point |
|-----|----------|----------|-------------|
| **Executable** | Приложение | не указан (дефолт) | `"main"` (обязательно) |
| **TSClang-библиотека** | Библиотека на TSClang | `"library"` | `index.tsc` (конвенция) |
| **C-wrapper** | Обёртка над C-библиотекой | `"library"` | `index.d.tsc` |
| **Platform profile** | Профиль платформы | `"platform"` | `index.d.tsc` |

## CLI команды

| Команда | Алиас | Описание |
|---------|-------|----------|
| `tsclang init` | — | Создать новый проект |
| `tsclang build` | `b` | Собрать проект |
| `tsclang run` | — | Собрать и запустить |
| `tsclang dev` | — | Режим отслеживания изменений |
| `tsclang install` | `i` | Установить зависимости |
| `tsclang update` | `u` | Обновить зависимости |
| `tsclang remove` | `r` | Удалить зависимость |
| `tsclang clean` | `c` | Удалить build артефакты |
| `tsclang lint` | `l` | Проверить форматирование |
| `tsclang migrate` | — | Миграция TypeScript → TSClang *(roadmap)* |
| `tsclang lsp` | — | Language Server Protocol *(roadmap)* |

## Подстраницы

| Страница | Описание |
|----------|----------|
| [Типы проектов](./projects.md) | Executable, библиотека, C-wrapper, platform profile |
| [Конфигурация](./config.md) | Поля `tsc.package.json`, builds, platformSettings |
| [CLI](./cli.md) | Команды build, run, init, lint, migrate, lsp |
| [Пакетный менеджер](./packages.md) | install, publish, search, workspaces, lock-файл |
| [Embedded-сборка](./embedded.md) | AVR, ARM, ретро-платформы, binaryMode |
| [CMake](./cmake.md) | CMakeLists.txt, профили debug/release, оптимизация |

## C-output

```c
// build/desktop/c/main.c — сгенерировано из src/main.tsc
#include <stdint.h>
#include <stdio.h>
#include "runtime.h"

int main(void) {
    tsc_init_all();
    printf("Hello world\n");
    return 0;
}
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `cannot determine entry point` | Не указано поле `"main"` для executable |
| `unknown target arch '6502'` | Неизвестная архитектура без platform profile |
| `toolchain 'avr-gcc' not found in PATH` | Компилятор не установлен |
| `dependency conflict` | Несовместимые semver constraints |

## См. также

- [Модули: импорт/экспорт](../08-modules/import-export.md) — точка входа и инициализация
- [Память: ownership](../05-memory/ownership-types.md) — owned/borrow при FFI
- [Конкурентность](../07-concurrency/index.md) — async runtime: libuv, cooperative, none
