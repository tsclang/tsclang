# Быстрый старт

[← Вверх](./index.md) | [Следующий →](./cli.md) | [Предыдущий ←](./design-philosophy.md)

---

## Требования

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **CMake** >= 3.16 (для компиляции в бинарь)
- **Компилятор C** — gcc, clang, или avr-gcc (для AVR)

## Установка

```bash
npm install -g tsclang

tsclang --version
```

Запуск без установки:

```bash
npx tsclang build
```

## Создание проекта

```bash
tsclang init myapp
cd myapp
```

Создаёт структуру:

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

## Сборка и запуск

```bash
tsclang build                  # генерация C + компиляция в бинарь
tsclang build --emit c         # только генерация C (без компиляции)
tsclang run                    # собрать и запустить
```

Результат сборки:

```
dist/
  main.c              # сгенерированный C-код
  CMakeLists.txt      # для ручной сборки
  myapp               # бинарь (если --emit binary)
```

## Сборка одного файла

Без `tsc.package.json` — просто передай файл:

```bash
tsclang build hello.tsc
```

## Что дальше

- [Синтаксис](../02-syntax/index.md) — конструкции языка
- [Модель памяти](../05-memory/index.md) — ownership, borrow, `Ref<T>`
- [CLI](./cli.md) — все команды

## См. также

- [CLI](./cli.md) — полное описание команд
- [Система сборки](../09-build/index.md) — конфигурация, платформы, профили
