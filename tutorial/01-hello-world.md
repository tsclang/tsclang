# 01 — Hello, World!

Первая программа на TSClang. Узнаем, как создать файл, скомпилировать его в C и запустить.

## Что узнаем

- Структура файла `.tsc`
- Команда `tsclang build`
- Генерация C-кода и `CMakeLists.txt`
- Параметр `--target` (desktop, avr)

## Подготовка

Создайте рабочую директорию для учебника:

```bash
mkdir ~/tsclang-tutorial && cd ~/tsclang-tutorial
```

## Шаг 1. Первый файл

Создайте файл `hello.tsc`:

```typescript
// hello.tsc
console.log("Hello, TSClang!");
```

> TSClang поддерживает top-level выражения — код выполняется последовательно, как в TypeScript. Не нужно оборачивать всё в `function main()`.

## Шаг 2. Компиляция

```bash
tsclang build hello.tsc --outDir dist
```

После выполнения в `dist/` появятся файлы:

```
dist/
├── hello.c          # Сгенерированный C-код
└── CMakeLists.txt   # Скрипт сборки
```

### Что внутри `hello.c`

Откройте файл — вы увидите примерно такое:

```c
#include "runtime.h"

int main(int argc, char **argv) {
    TSC_INIT();
    printf("%s\n", STR_LIT("Hello, TSClang!").data);
    return 0;
}
```

TSClang превратил ваш TypeScript-подобный код в читаемый C99. Runtime берёт на себя инициализацию и очистку ресурсов.

## Шаг 3. Запуск

Сборка через CMake:

```bash
cd dist && cmake -B build . && cmake --build build
./build/hello
```

Вывод:

```
Hello, TSClang!
```

Или в одну команду:

```bash
tsclang run hello.tsc
```

Команда `run` скомпилирует код во временную директорию, соберёт бинарник и сразу запустит его.

## Шаг 4. Другая платформа

TSClang умеет компилировать под разные цели. Попробуем AVR (микроконтроллеры Arduino):

```bash
tsclang build hello.tsc --outDir dist-avr --target avr
```

В `dist-avr/hello.c` код будет отличаться:

- вместо `printf` — вывод через `USART_Transmit`;
- нет динамической памяти (heap), только стек;
- `TSC_INIT()` настраивает UART вместо stdio.

Это тот же исходный `.tsc`-файл, но кодогенератор адаптировал runtime под платформу.

## Полный исходник

```typescript
// hello.tsc
console.log("Hello, TSClang!");
```

## Упражнения

1. Измените сообщение на своё имя. Пересоберите и запустите.
2. Добавьте второй вызов `console.log` с другим текстом.
3. Соберите под target `wasm` и посмотрите на сгенерированный `hello.c` — какой runtime используется?

## Что дальше

В [следующей главе](02-project-and-toolchain.md) создадим полноценный проект, разберём сборку и отладку.
