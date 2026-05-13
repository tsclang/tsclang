# 02 — Проект и тулчейн

Создадим полноценный проект на TSClang. Разберём структуру, конфигурацию, быстрый цикл разработки, отладку и сборку бинарников для разных платформ.

## Что узнаем

- `tsclang init` — создание проекта
- `tsc.package.json` — конфигурация сборки
- `tsclang run` — компиляция и запуск в одну команду
- `tsclang debug` — отладка через GDB
- `--emit c` и `--emit binary` — два режима сборки
- Кросс-платформенная компиляция (Linux, macOS, Windows)

## Шаг 1. Создание проекта

```bash
mkdir ~/tsclang-tutorial && cd ~/tsclang-tutorial
tsclang init mycalc
```

Команда `init` создаёт поддиректорию `mycalc` с файлами внутри:

```
mycalc/
├── tsc.package.json
└── src/
    └── main.tsc
```

Если имя не указано (`tsclang init`) — файлы создаются в текущей директории.

## Шаг 2. Конфигурация `tsc.package.json`

Откройте файл:

```json
{
  "version": "0.1.0",
  "type": "executable",
  "main": "src/main.tsc",
  "name": "mycalc"
}
```

| Поле | Назначение |
|------|------------|
| `name` | Имя пакета |
| `version` | Версия в формате semver |
| `type` | `"executable"` (программа) или `"library"` (библиотека) |
| `main` | Точка входа |

Позже мы добавим сюда профили сборки под разные платформы. Пока хватит минимальной конфигурации.

## Шаг 3. Первый код

Откройте `src/main.tsc` и замените содержимое:

```typescript
const args = process.argv;
console.log("Arguments count:", args.length);

for (let i = 0; i < args.length; i++) {
    console.log(i, args[i]);
}
```

Эта программа выводит все аргументы командной строки — полезно для отладки.

> **Важно:** `args.length` имеет тип `usize` (как в Rust). В цикле `for` компилятор автоматически приводит тип, но если указываете тип явно — используйте `let i: usize = 0`.

> **Совет:** передавайте в `console.log` несколько аргументов вместо конкатенации строк: `console.log(i, args[i])` вместо `console.log("[" + i + "] = " + args[i])`. Это надёжнее и читаемее.

## Шаг 4. Быстрый запуск

Команда `run` компилирует `.tsc` во временный C-файл, собирает бинарник через `gcc` и сразу запускает:

```bash
tsclang run src/main.tsc -- --hello 42
```

Флаг `--` отделяет аргументы TSClang от аргументов вашей программы.

Вывод:

```
Arguments count: 3
0 C:\Users\...\main
1 --hello
2 42
```

> `tsclang run` не создаёт постоянных файлов. Всё собирается во временной директории и удаляется после завершения. Это идеально для быстрой проверки идей.

## Шаг 5. Сборка в C

Чтобы получить читаемый C-код для изучения или ручной сборки:

```bash
tsclang build src/main.tsc --emit c --outDir build
```

В `build/` появятся файлы:

```
build/
├── main.c           # Сгенерированный C-код
└── CMakeLists.txt   # Скрипт для CMake
```

`main.c` содержит вашу программу на C99 с вызовами runtime TSClang. `CMakeLists.txt` — готовый к использованию скрипт сборки.

## Шаг 6. Сборка в бинарник

Чтобы получить готовый исполняемый файл:

```bash
tsclang build src/main.tsc --emit binary --outDir build
```

В `build/` появится бинарник `main` (Linux/macOS) или `main.exe` (Windows):

```bash
./build/main --test value
```

### Оптимизация

Добавьте флаг `--optimize` для release-сборки:

```bash
tsclang build src/main.tsc --emit binary --outDir build --optimize O2
```

| Уровень | Назначение |
|---------|------------|
| `O0` | Без оптимизаций, максимум отладочной информации |
| `O1` | Базовые оптимизации |
| `O2` | Рекомендуется для release |
| `O3` | Агрессивные оптимизации |
| `Os` | Оптимизация по размеру (для embedded) |

## Шаг 7. Отладка

Команда `tsclang debug` компилирует программу с отладочными символами (`-g`) и запускает GDB:

```bash
tsclang debug src/main.tsc
```

Если GDB установлен, откроется консоль отладчика. Если нет — программа запустится без отладчика с предупреждением.

**Полезные команды GDB:**

```gdb
(gdb) break main          # точка останова в main
(gdb) run --hello 42      # запуск с аргументами
(gdb) next                # шаг без захода в функцию
(gdb) print args.length   # вывести значение
(gdb) continue            # продолжить выполнение
(gdb) quit                # выход
```

> **Совет:** добавляйте `console.log()` в ключевых местах — это самый быстрый способ отладки, пока не нужен полноценный debugger.

## Шаг 8. Кросс-платформенная сборка

TSClang генерирует переносимый C99-код. Сборка под разные ОС выполняется стандартными инструментами.

### Linux / macOS

```bash
# Сгенерировать C
tsclang build src/main.tsc --emit c --outDir build

# Собрать через CMake
cd build
cmake -B cmake-build .
cmake --build cmake-build

# Запустить
./cmake-build/main
```

### Windows (MinGW)

```bash
# Сгенерировать C
"C:\Program Files\tsclang\bin\tsclang" build src\main.tsc --emit c --outDir build

# Собрать через CMake с MinGW
cd build
cmake -B cmake-build -G "MinGW Makefiles" .
cmake --build cmake-build

# Запустить
.\cmake-build\main.exe
```

### Windows (MSVC)

```bash
cd build
cmake -B cmake-build -G "Visual Studio 17 2022" -A x64 .
cmake --build cmake-build --config Release

.\cmake-build\Release\main.exe
```

> CMakeLists.txt, который генерирует TSClang, использует стандартный синтаксис CMake и работает с любым компилятором C11.

## Полный исходник

```typescript
// src/main.tsc
const args = process.argv;
console.log("Arguments count:", args.length);

for (let i = 0; i < args.length; i++) {
    console.log(i, args[i]);
}
```

## Расширенная конфигурация

Добавьте в `tsc.package.json` профили сборки под разные платформы:

```json
{
  "name": "mycalc",
  "version": "0.1.0",
  "type": "executable",
  "main": "src/main.tsc",
  "builds": {
    "desktop": {
      "emit": "binary",
      "outDir": "build/desktop",
      "optimize": "O2"
    },
    "debug": {
      "emit": "binary",
      "outDir": "build/debug",
      "optimize": "O0"
    }
  }
}
```

> **Примечание:** в текущей версии TSClang профили `builds` используются для валидации и документации. Собирайте проект явной командой: `tsclang build src/main.tsc --outDir build/desktop --emit binary --optimize O2`.

## Упражнения

1. Добавьте в `main.tsc` подсчёт суммы двух чисел из `process.argv` (аргументы с индексов 1 и 2). Используйте `Number.parseInt`.
2. Соберите проект с `--optimize O3` и сравните размер бинарника с `--optimize O0`.
3. Запустите `tsclang debug` и поставьте breakpoint на строку с `console.log`. Проверьте значение `args.length` через `print`.
4. Соберите проект на другой ОС (или в виртуальной машине) и убедитесь, что бинарник запускается.

## Что дальше

В [следующей главе](03-calculator.md) напишем первую полноценную программу — консольный калькулятор с обработкой ошибок.
