# Модульная система

[← Вверх](../index.md) | [Следующий →](./import-export.md)

---

TSClang использует **модульную систему**, совместимую с TypeScript по синтаксису: именованные `export` / `import { } from ""`. Один файл = один модуль. Компилятор автоматически генерирует `#include`, forward declarations и функции инициализации в C-output.

## Принципы

- **Один файл — один модуль** — без `namespace`, без `module`
- **Только именованные экспорты** — `export default` запрещён (C требует явного имени для каждого символа)
- **Циклические импорты разрешены** — компилятор генерирует forward declarations в `.h`
- **`.d.tsc` файлы** — декларации для C-interop (аналог `.d.ts` в TypeScript)
- **Path aliases** — короткие имена `#/`, `~/` вместо `../../../`

## Импорт и экспорт

```typescript
// math.tsc — модуль с экспортами
export const PI: f64 = 3.14159
export function add(a: i32, b: i32): i32 { return a + b }

// main.tsc — импорт
import { PI, add } from "./math"
console.log(add(1, 2))
```

## Точка входа

Точка входа определяется полем `"main"` в `tsc.package.json`. Top-level код entry-файла становится телом `main()` в C:

```typescript
const a: i32 = 1
console.log(a)
```

```c
int main(void) {
    tsc_init_all();
    int32_t a = 1;
    printf("%d\n", a);
    return 0;
}
```

## Инициализация модулей

Компилятор строит граф зависимостей и выполняет **топологическую сортировку**. Каждый модуль с module-level переменными получает `_init()` функцию. Результат — единая `tsc_init_all()` с правильным порядком вызовов.

## C interop

Для взаимодействия с C-библиотеками TSClang предоставляет несколько механизмов:

| Механизм | Назначение |
|----------|------------|
| `.d.tsc` | Декларации C-типов, функций, констант |
| `native` | Inline C-код (verbatim) |
| `unsafe {}` | Отключение borrow/type checker |
| `FnPtr<T>` | Function pointers для C callbacks |
| `@platform` | Условная компиляция под платформу |

## Подстраницы

| Страница | Описание |
|----------|----------|
| [Импорт / экспорт](./import-export.md) | Named export/import, namespace import, `import type`, инициализация, циклические импорты, path aliases |
| [.d.tsc файлы](./d-tsc.md) | Декларации для C interop: struct, opaque type, функции, константы, MMIO |
| [native — inline C](./native.md) | Синтаксис, интерполяция, ограничения, ассемблерные вставки |
| [unsafe {} — отключение проверок](./unsafe.md) | Когда использовать, что отключает, отличие от `native` |
| [Callbacks и FnPtr\<T\>](./callbacks.md) | Function pointers, TSC_CLOSURE_* макросы, closure bridging |
| [@platform — условная компиляция](./platform.md) | Платформозависимые реализации, структура пакета |

## C-output

```c
// результат компиляции нескольких модулей
#include "math.h"
#include "utils.h"

static void tsc_init_all() {
    math_init();
    utils_init();
    main_init();
}

int main(void) {
    tsc_init_all();
    // ... top-level код main.tsc ...
    return 0;
}
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `cannot determine entry point` | Не указано поле `"main"` в `tsc.package.json` |
| `main file not found: src/main.tsc` | Файл из `"main"` не существует |
| `circular initialization dependency detected` | Цикл через module-level переменные |
| `export default is not allowed` | Попытка использовать default-экспорт |
| `native block — C code inserted verbatim` | Предупреждение на каждый `native` блок |

## См. также

- [Синтаксис: переменные](../02-syntax/variables/index.md) — module-level переменные
- [Память: ownership](../05-memory/ownership-types.md) — owned/borrow при передаче между модулями
- [Конкурентность](../07-concurrency/index.md) — thread-safety для module-level переменных
