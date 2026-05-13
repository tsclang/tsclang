# Классы и объектная система

[← Вверх](../index.md) | [Следующий →](./classes.md)

---

Объектная система TSClang строится на композиции вместо наследования, номинальной типизации классов и структурной типизации интерфейсов. Generics мономорфизируются — отдельный C-код для каждого конкретного типа.

## Ключевые принципы

- **Наследования нет** — только `extends Error` для иерархии ошибок. Полиморфизм через `interface` + `implements`.
- **Композиция** — вместо `class Dog extends Animal` используется `class Dog { animal: Animal }`.
- **Ownership интегрирован** — `mut`, `move` модификаторы методов контролируют семантику `this`.
- **Generics мономорфизируются** — `Stack<i32>` и `Stack<User>` генерируют отдельные C-функции.
- **Декораторы — compile-time** — трансформируют AST до проверки типов, нулевой рантайм-оверхед.

## Подстраницы

| Страница | Описание |
|----------|----------|
| [Классы](./classes.md) | Определение, модификаторы, `this`-семантика, `readonly`, конструкторы, value object, builder |
| [Интерфейсы](./interfaces.md) | Data-интерфейсы vs контрактные, fat pointer vtable, `instanceof`, структурная совместимость |
| [Enum](./enum.md) | Числовые, строковые, `const enum`, утилиты, exhaustiveness в `match` |
| [Generics](./generics.md) | Синтаксис, bounds (`implements`/`extends`), мономорфизация, ownership с generics |
| [Декораторы](./decorators.md) | `decorator function`, Descriptor API, `@packed`, `@align`, `@static`, `@embedded.*`, `@signal`, `@platform` |

## Extension Methods

TSClang поддерживает extension methods — добавление методов к существующим типам без изменения определения. Импортируются явно, не загрязняют глобальную область видимости.

```typescript
export extension function charCount(this: string): i32 {
    // подсчёт codepoints
}

import { charCount } from "std/string"
"привет".charCount()   // ok
```

C-output — статический вызов, zero overhead:

```c
int32_t n = tsc_std_string_charCount(s);
```

Extension, конфликтующий с существующим методом — ошибка компилятора. Два extension с одинаковым именем из разных модулей — разрешаются через `import { format as fmtA } from "./module-a"`.

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `extends is only allowed for Error` | Попытка унаследоваться от произвольного класса |
| `extension 'format' conflicts with existing method` | Extension с именем существующего метода |
| `ambiguous extension 'format' for type 'string'` | Два импортированных extension с одним именем |

## См. также

- [Модель памяти](../05-memory/index.md) — ownership, `Ref<T>`, `Mut<T>`, move-семантика
- [Система типов](../03-types/index.md) — структурная vs номинальная типизация
- [Обработка ошибок](../06-errors/index.md) — `extends Error`, `throws`, `try/catch`
- [Спецификация: Классы](../../spec/04-classes.md) — полное описание объектной системы
