# Книга-спецификация TSClang

Подробная человекочитаемая спецификация от начального уровня до хардкора, с последовательным погружением.
Учебник не только по TSClang, но и по работе и проектированию ЯП как в принципе.

## Принципы проектирования TSClang

### П1. Кросс-платформенная верификация
Любое решение проверяется на то, как оно работает на **всех** целевых платформах:
- **Desktop** (libuv, full heap, threads)
- **Embedded/AVR** (no heap или static heap, no OS, cooperative scheduler)
- **Async/await** (state machine, borrow across await, generator)
- **Многопоточность** (threads, channels, Atomic, data races)

Если фича работает на desktop, но ломается на embedded — это баг, а не feature flag.

### П2. Максимальная совместимость с TypeScript
TSClang — это TypeScript-подобный язык. Максимальное число вещей из TS должно работать:
- `async/await` на embedded — работает (cooperative scheduler)
- `Map<K,V>` на embedded — работает (static map)
- Строки, массивы, closures — работают везде
- Если TS делает что-то определённым образом, TSClang должен делать так же — **если нет явной причины отклониться** (memory safety, embedded constraints)

### П3. TSClang лучше, чем TS/C/C++/Rust
Мы не делаем «ограниченный TS» или «удобный C». Мы делаем язык, который:
- **Безопаснее C/C++** — borrow checker, no UB, deterministic cleanup
- **Быстрее TS** — компилируется в нативный код, zero-cost abstractions
- **Проще Rust** — нет lifetime annotations, нет сложного borrow checker, но memory safety сохраняется
- **Работает на железе** — embedded, retro, bare metal — без исключений

Любое решение, которое делает язык *хуже* конкурентов в их сильных сторонах — пересматривается.

## Принципы написания книги

- Каждая тема — глубоко: примеры, edge cases, все 3 таргета, C-output
- Примеры сочетания с другими областями (вложенные, в замыканиях, через импорты и т.д.)
- Реальные примеры кода — best practices из тестовой базы
- Примеры плохого кода — как писать не надо
- Примеры ошибок — что сломается и как реагирует компилятор
- Примеры исправления ошибок — как переписать код
- Какой C-код генерируется
- Почему принято именно ЭТО решение
- Какие были альтернативные варианты
- Что было плохого в каждом альтернативном варианте

## Тестирование и верификация глав

### Цикл после каждой главы

1. **Пишу главу** (все файлы темы)
2. **Собираю примеры** из файлов главы
3. **Создаю тесты** в `test/cases/book/<блок>/<глава>/` — структура зеркально книге
4. **Запускаю тесты** — обязательно, после каждой главы
5. **Анализирую текст главы** — сверяю каждое утверждение со спецификацией и реализацией, даже если тесты зелёные
6. **Обновляю глоссарий** — новые термины из главы добавляю в `book/GLOSSARY.md`
7. Если расхождений нет и тесты зелёные — глава готова
8. Если есть расхождения (текст vs spec, текст vs impl, тесты красные) — стоп, полная картина, арбитраж от человека

### Анализ текста (шаг 5)

Даже если тесты проходят, текст главы может утверждать что-то, что не соответствует spec или impl. Поэтому:

- Каждое утверждение в тексте сверяется с spec/ (если есть соответствующий раздел)
- Каждое утверждение о поведении компилятора сверяется с impl (src/compiler/)
- Каждое утверждение о C-output сверяется с реальным выводом компилятора
- Каждое утверждение о runtime сверяется с runtime.h

### Тестирование примеров

Каждый пример кода из книги должен быть покрыт тестом.

Структура: `test/cases/book/<блок>/<глава>/` — зеркально книге.
Каждый пример = отдельный тест (папка с `input.tsc` + `expected.c` + `expected.out` или `expected.error`).

### Дописывание фрагментов

- Фрагмент описывает нормальное поведение → дописать до полного примера, который компилируется и даёт ожидаемый output
- Фрагмент описывает ошибку → дописать до полного примера, который падает с `expected.error`
- Пример уже полный → как есть

Пример: фрагмент `let s2 = s;` (move semantics) → полный тест:
```typescript
const s = "hello"
let s2 = s
console.log(s2)
```

### Запуск тестов

```bash
node test/runner.js book
```

### Арбитраж при конфликтах

При любом расхождении (текст vs spec vs impl vs тест):

1. **Собрать полную картину** — что говорит компилятор, что говорит существующий тест, что говорит spec, как работают П1–П3
2. **Дать анализ** — по иерархии: проходящий тест → spec → П1–П3
3. **Остановиться и ждать** — арбитраж от человека

Без вердикта человека — ничего не фиксим. Никаких автономных решений при конфликтах.

### Порядок арбитража

Арбитраж проводится **по каждому расхождению отдельно**. Не один вердикт на всю главу — а отдельное решение по каждому пункту.

Для каждого расхождения:
1. Я даю анализ: что говорит impl, что говорит spec, что говорят П1–П3, моё мнение
2. Ты даёшь вердикт по этому конкретному пункту
3. Я фикслю и перехожу к следующему

Возможные вердикты по каждому пункту:
- «impl прав» → исправляю книгу
- «книга права» → исправляю impl (с проверкой существующих тестов)
- «оба неправы» → определяю правильное через П1–П3, исправляю обоих
- «отложить» → отмечаю в .analysis.md, перехожу к следующему пункту

Вердикт записывается в .analysis.md и LOG.md.

### Файл анализа

Для каждой главы создаётся файл анализа рядом с файлами главы:
`book/<блок>/<глава>/<номер>.analysis.md`

Шаблон:

```markdown
# Анализ: <название главы>

## Тесты
- Запущено: X тестов
- Результат: X зелёных / X красных
- [если красные — детали ниже]

## Сверка текста со spec
- [утверждение из главы] → spec/XX.md → совпадает / расходится: (детали)

## Сверка текста с impl
- [утверждение о поведении] → src/compiler/... → совпадает / расходится: (детали)

## Сверка текста с runtime
- [утверждение о runtime] → runtime.h → совпадает / расходится: (детали)

## Расхождения
(если есть — полная картина для арбитража)

## Вердикт
Глава готова / ожидает арбитраж
```

### Лог написания книги

Ведётся в `book/LOG.md`. Для каждой главы — запись с датой, результатами тестов, анализом и вердиктом.

Формат записи:
```markdown
### <номер> <название> — <дата>
- Написано: X файлов
- Тесты: X тестов, X зелёных / X красных
- Анализ: расхождений не найдено / X расхождений (кратко)
- Вердикт: готова / ожидает арбитраж
```

Правки фиксируются под основной записью:
```markdown
#### Правка 1 — <дата>
- Причина: арбитраж / найдено расхождение / влияние другой главы
- Изменено: файл1, файл2, ...
- Тесты после правки: X зелёных
- Вердикт: готова / ожидает арбитраж
```

## Формат каждой главы (гибрид)

1. Систематическое описание фичи
2. Примеры программы как иллюстрация
3. Параллельно — устройство компилятора
4. Задачи для закрепления

## Таргеты — всегда все 3

Каждый пример проверяется на:
- **Desktop** (libuv, full heap, threads)
- **Embedded/AVR** (no heap, cooperative scheduler)
- **Async/await** (state machine)

Даже если поведение одинаковое — объясняем почему.

## Подход: итеративная сходимость

Нельзя разрешать спорные точки изолированно — каждое решение влияет на другие через систему зависимостей. Поэтому:

1. Пишем главу, проверяем на всех таргетах
2. Если упёрлись в проблему — разбираем, какие решения от неё зависят
3. Прорабатываем все связанные решения как систему
4. Если сложное правило ломает простое — откатываемся и пересматриваем
5. Итерируем, пока не сойдётся

### Возможные вердикты по каждой спорной точке

| # | Вердикт | Что делать |
|---|---------|------------|
| 1 | Spec прав, impl wrong | Исправить impl |
| 2 | Impl прав, spec wrong | Исправить spec |
| 3 | Оба правы (согласны) | Закрыть |
| 4 | Оба неправы | Определить правильное поведение через П1–П3, исправить обоих |

### Риски и сложности

**1. Каскадная зависимость решений**

Каждое более сложное правило опирается на более простое. Пример: String = ARC → влияет на closure capture строк → влияет на async retain-on-capture → влияет на for-of по строке. Если решили «closure capture = copy» — кажется нейтрально, но для async это может означать retain строки на каждом capture → embedded не влезает в память → П1 нарушен.

**2. Конфликт П1–П3 между собой**

П2 (TS compat) может хотеть `undefined = synonym null`, а П3 (лучше Rust) — `undefined = нет вообще`. Выбор влияет на optional types, `??`, type narrowing, migration guide. Жертва в одном месте ломает другое.

**3. Невозможность выполнить все три принципа одновременно**

Может оказаться, что для какой-то точки П1 и П2 требуют противоположных решений. Тогда нужно выбирать — и этот выбор повлияет на все зависимые правила.

### Порядок работы

1. Идём по блокам последовательно (от простого к сложному)
2. Внутри блока — по главам
3. Для каждой главы: пишем код → компилируем → проверяем все 3 таргета → анализируем C-output → пишем текст
4. Если обнаруживается расхождение spec↔impl — разбираем через П1–П3
5. Если обнаруживается противоречие с уже принятым решением — откатываемся к корню и пересматриваем

## Детальное оглавление

См. [TOC.md](TOC.md) — полный список всех тем (каждая тема = отдельный файл).

## Структура (обзор)

### Блок 0: Введение

| # | Глава | Темы |
|---|-------|------|
| 00.1 | Что такое TSClang и зачем он нужен | мотивация, проблемы TS/C/C++/Rust, что TSClang делает иначе |
| 00.2 | Установка и первый запуск | CLI, `tsclang build`, структура проекта |
| 00.3 | Архитектура компилятора | фазы компиляции (лексер → парсер → typecheck → codegen), что происходит под капотом |
| 00.4 | Hello World | первый файл, компиляция, C-output, запуск на desktop |
| 00.5 | Hello World на AVR | тот же файл, другой таргет, разница в C-output и runtime |
| 00.6 | Hello World async | async main, state machine, разница с desktop |

### Блок 1: Лексика и форматирование

| # | Глава | Темы |
|---|-------|------|
| 01.1 | Токены и лексер | как компилятор видит код, типы токенов |
| 01.2 | Комментарии | `//`, `/* */`, doc-комментарии |
| 01.3 | Форматирование | точка с запятой (почему optional, а не ASI), отступы, braces |
| 01.4 | Идентификаторы и ключевые слова | правила имён, зарезервированные слова, зарезервированные префиксы типов |
| 01.5 | Литералы | числовые, строковые, символьные (char), boolean, null, undefined |

### Блок 2: Переменные и базовые типы

| # | Глава | Темы |
|---|-------|------|
| 02.1 | `let` и `const` | объявление, отличие от TS, `var` как синоним |
| 02.2 | Type inference | как компилятор выводит тип, когда нужна аннотация |
| 02.3 | Числовые типы | i8, u8, i16, u16, i32, u32, i64, u64, f32, f64, usize, isize |
| 02.4 | Числовые литералы | десятичные, hex, binary, octal, разделители, суффиксы |
| 02.5 | Числовая конвертация | widening (auto), narrowing (explicit), overflow, почему так |
| 02.6 | Boolean | true/false, truthy/falsy, правила приведения, отличие от TS |
| 02.7 | null и undefined | синонимы или нет, `T \| null`, почему так решили, альтернативы |
| 02.8 | void и never | когда используются, C-output, отличие от TS |
| 02.9 | unknown | type-safe top-type, typeof narrowing, C-layout, ограничения |
| 02.10 | any | когда нужен, отличие от unknown, опасности |

### Блок 3: Операторы

| # | Глава | Темы |
|---|-------|------|
| 03.1 | Арифметические операторы | `+`, `-`, `*`, `/`, `%`, `**`, целочисленное деление, переполнение |
| 03.2 | Операторы сравнения | `==`, `!=`, `<`, `>`, `<=`, `>=`, `===` (есть ли?), string comparison |
| 03.3 | Логические операторы | `&&`, `\|\|`, `!`, short-circuit, truthy/falsy взаимодействие |
| 03.4 | Битовые операторы | `&`, `\|`, `^`, `~`, `<<`, `>>`, целевые платформы |
| 03.5 | Операторы присваивания | `=`, `+=`, `-=`, compound assignment, string `+=` |
| 03.6 | Тернарный оператор | `? :`, тип результата, отличие от TS |
| 03.7 | Nullish coalescing | `??`, `?.`, optional chaining, ownership семантика |
| 03.8 | Приоритет операторов | таблица, почему так, сравнение с TS/C |
| 03.9 | Оператор `as` | type cast, когда нужен, когда опасен, const cast |

### Блок 4: Функции

| # | Глава | Темы |
|---|-------|------|
| 04.1 | Объявление функций | синтаксис, параметры, return type, type inference для return |
| 04.2 | Параметры по умолчанию | default params, правила вычисления, C-output |
| 04.3 | Rest-параметры | `...args`, тип, ограничения |
| 04.4 | Перегрузка функций | overload resolution, приоритет, name mangling, почему не runtime dispatch |
| 04.5 | Name mangling | формальная схема, кодирование типов, module slug, коллизии |
| 04.6 | Стрелочные функции | `(x) => x + 1`, когда можно сократить, отличие от TS |
| 04.7 | Функции как значения | присвоение функции переменной, передача как аргумент, type loss (баг?) |
| 04.8 | Семантика передачи значений | copy/move/borrow при передаче аргументов, почему так |
| 04.9 | `throws` | объявление, вызов, почему явное (а не inferred), сравнение с TS exceptions |
| 04.10 | Функции на AVR | ограничения, static dispatch, no recursion (?), стек |

### Блок 5: Строки

| # | Глава | Темы |
|---|-------|------|
| 05.1 | Тип string | immutable, ARC, C-layout (struct с data/length/owned), почему не pointer |
| 05.2 | Строковые литералы | двойные кавычки, escape-последовательности, STR_LIT в C |
| 05.3 | Символьные литералы | одинарные кавычки = char/u8, отличие от TS, почему так |
| 05.4 | Конкатенация | `+`, `+=`, временные значения, leak (?), C-output |
| 05.5 | Индексация и длина | `s[i]` возвращает u8, `s.length`, почему не grapheme |
| 05.6 | Итерация по строке | for-of = bytes, почему не codepoints/graphemes, embedded ограничения |
| 05.7 | Срезы строк | Slice<string>, zero-copy, borrowing |
| 05.8 | Встроенные методы строк | toUpperCase, indexOf, slice, split, trim и т.д. |
| 05.9 | Unicode extension methods | std/string, graphemes, normalize, доступность по платформам |
| 05.10 | String на AVR | PROGMEM, статические строки, ограничения, почему так |
| 05.11 | String в async | retain-on-capture, cleanup, goto _cleanup, почему так |

### Блок 6: Управление потоком

| # | Глава | Темы |
|---|-------|------|
| 06.1 | if / else | синтаксис, тип условия (boolean only?), type narrowing в ветках |
| 06.2 | Вложенные условия и сложные выражения | &&, \|\| в условиях, early return, guard clauses |
| 06.3 | switch / case | синтаксис, отличия от TS (break нужен?), числовые/строковые типы |
| 06.4 | match | сопоставление с образцом, литералы, диапазоны, wildcard, exhaustiveness |
| 06.5 | match с enum | мощная комбинация, exhaustiveness check, C-output |
| 06.6 | match с type narrowing | instanceof, почему NOT YET, альтернативы |
| 06.7 | for цикл | классический `for (let i = 0; ...)`, usize, off-by-one |
| 06.8 | for-of | итерация по массивам, строкам, Map, Set, переприсвоение запрещено |
| 06.9 | for-of с деструктуризацией | Map.entries(), tuples, nested patterns |
| 06.10 | while / do-while | синтаксис, бесконечные циклы, break/continue |
| 06.11 | Циклы на AVR | for vs while, ограничение памяти, no dynamic bounds (?) |
| 06.12 | Циклы в async | async/await в циклах, for await, что происходит с state machine |

### Блок 7: Массивы

| # | Глава | Темы |
|---|-------|------|
| 07.1 | Объявление и создание | литерал `[]`, `new Array<N>()`, type inference |
| 07.2 | Индексация | `arr[i]`, bounds checking (?), usize, что возвращает |
| 07.3 | Мутация | push, pop, shift, splice, C-output, realloc |
| 07.4 | Функциональные методы | map, filter, reduce, forEach, find, findIndex, some, every |
| 07.5 | Поиск и сортировка | indexOf, includes, sort, toSorted, comparator |
| 07.6 | Spread и конкатенация | `[...arr1, ...arr2]`, временные массивы |
| 07.7 | Slice<T> | zero-copy view, borrowing, почему нужен |
| 07.8 | Массивы строк | ownership, retain/release, C-output |
| 07.9 | Массивы optional | `[1, null, 3]`, struct с has_value, баг (?) |
| 07.10 | Массивы на AVR | статические массивы, стек, BSS, no heap, ограничения |
| 07.11 | Массивы в async | capture в state machine, ownership через await |
| 07.12 | Метод chaining | `.map().filter()`, type loss (баг?), fallback i32 |

### Блок 8: Кортежи

| # | Глава | Темы |
|---|-------|------|
| 08.1 | Объявление и создание | `[T, U]`, type annotation, inference |
| 08.2 | Доступ к элементам | `t[0]`, destructuring, rest elements |
| 08.3 | Labeled tuples | `type Point = [x: i32, y: i32]`, зачем |
| 08.4 | Readonly, Optional, Rest | вариации tuple types |
| 08.5 | Ownership кортежей | move, borrow, element-level, C-output |
| 08.6 | Tuple vs Array | когда что, семантическая разница, C-output разница |
| 08.7 | Tuple destructuring с type annotation | баг: аннотация игнорируется (?) |

### Блок 9: Map и Set

| # | Глава | Темы |
|---|-------|------|
| 09.1 | Map<K,V> | создание, set/get/delete/has/size, итерация |
| 09.2 | Map string keys | retain/release, use-after-free (баг?), C-output |
| 09.3 | Map на AVR | статическая хеш-таблица, ограничения размера, C-output |
| 09.4 | Set<T> | создание, add/delete/has, итерация, delete return type |
| 09.5 | Set на AVR | реализация, ограничения |
| 09.6 | Object.fromEntries | конвертация Map ↔ Array of tuples |

### Блок 10: Классы

| # | Глава | Темы |
|---|-------|------|
| 10.1 | Объявление класса | поля, конструктор (zero-init), методы, C-output value-type |
| 10.2 | Конструкторы | zero-init по умолчанию, автоконструктор (NOT YET), почему value-type |
| 10.3 | Методы | объявление, вызов, `this` семантика, vtable (когда?) |
| 10.4 | `mut` методы | зачем, отличие от const методов C++, C-output |
| 10.5 | Visibility | public/private, зачем если value-type, C-output |
| 10.6 | Классы с string-полями | ownership, cleanup, _free, C-output |
| 10.7 | Автоматический cleanup | `_free` генерация, RAII, goto cleanup, C-output |
| 10.8 | Наследование | ограничения, почему композиция, отличие от TS |
| 10.9 | Классы на AVR | @embedded.inline, @embedded.pool(N), no heap, стек |
| 10.10 | Классы в async | capture в state machine, ownership через await, _free timing |
| 10.11 | @packed и @align | выравнивание структур, embedded, padding диагностика |
| 10.12 | Extension methods | добавление методов к существующим типам |

### Блок 11: Интерфейсы

| # | Глава | Темы |
|---|-------|------|
| 11.1 | Объявление интерфейса | синтаксис, структурная типизация |
| 11.2 | implements | класс реализует интерфейс, vtable генерация, C-output |
| 11.3 | Interface dispatch | как работает vtable, overhead, когда статический |
| 11.4 | instanceof | проверка типа, C-output, narrowing (NOT YET) |
| 11.5 | Интерфейсы на AVR | vtable overhead, когда избегать, альтернативы |

### Блок 12: Enum

| # | Глава | Темы |
|---|-------|------|
| 12.1 | Числовой enum | объявление, значения, C-output (префиксы) |
| 12.2 | Строковый enum | объявление, C-output, string ownership |
| 12.3 | const enum | inline значения, no runtime overhead, C-output |
| 12.4 | enum в switch/match | exhaustiveness, type narrowing, C-output |
| 12.5 | Утилиты enum | методы, итерация, reverse mapping (?) |

### Блок 13: Дженерики

| # | Глава | Темы |
|---|-------|------|
| 13.1 | Объявление generic функции | `<T>`, вызов, monomorphization, C-output |
| 13.2 | Generic классы | `<T>` в классе, fields, methods, monomorphization |
| 13.3 | Bounds | `T implements Interface`, structural bounds |
| 13.4 | Monomorphization | как работает, code bloat, почему не boxing, consumer-side (PLANNED) |
| 13.5 | Дженерики на AVR | ограничение инстанциаций, code size, стратегии |

### Блок 14: Обработка ошибок

| # | Глава | Темы |
|---|-------|------|
| 14.1 | throw | создание ошибки, Error класс, C-output (Result struct) |
| 14.2 | throws | объявление, вызов, обязателен, почему не inferred |
| 14.3 | try / catch / finally | перехват, type narrowing в catch, union errors |
| 14.4 | Оператор `?` | propagate, как Rust, C-output, chaining |
| 14.5 | Оператор `!` | unwrap или panic, когда безопасно, C-output |
| 14.6 | Ownership при ошибках | cleanup ресурсов, goto cleanup, C-output |
| 14.7 | Error.stack | desktop only, user-defined, C-output |
| 14.8 | Ошибки на AVR | Result struct, стек, ограничения, нет setjmp |
| 14.9 | Ошибки в async | error propagation через state machine, cleanup |

### Блок 15: Модель памяти — Ownership

| # | Глава | Темы |
|---|-------|------|
| 15.1 | Типы владения | T, Ref<T>, Mut<T>, Shared<T>, Weak<T>, Slice<T>, зачем каждый |
| 15.2 | Базовые правила | primitives copy, complex types move, почему так, сравнение с Rust |
| 15.3 | Owner (T) | move при присвоении, move при передаче, use-after-move = ошибка |
| 15.4 | Ref<T> | immutable borrow, правила, lifetime, C-output (pointer) |
| 15.5 | Mut<T> | mutable borrow, exclusivity, quarantine, C-output |
| 15.6 | Shared<T> | ARC reference counting, retain/release, C-output |
| 15.7 | Weak<T> | weak reference, upgrade, разрыв циклов, C-output |
| 15.8 | Borrow checker | правила, алгоритм, ошибки, сравнение с Rust borrow checker |
| 15.9 | Scope constraint | lifetime без аннотаций, conservative union, почему так |
| 15.10 | Автоматический Drop | RAII, _free, когда вызывается, C-output |
| 15.11 | Cleanup и throw | goto cleanup, ресурсы, C-output |
| 15.12 | Interior Mutability | почему нет Cell/RefCell, альтернативы, сравнение с Rust |

### Блок 16: Ownership в деталях — по типам

| # | Глава | Темы |
|---|-------|------|
| 16.1 | Примитивы | copy semantics, Ref/Mut для примитивов, Shared/Weak (ошибка), embedded |
| 16.2 | String | ARC copy, retain/release, heap vs literal, embedded (PROGMEM), async (retain-on-capture) |
| 16.3 | Классы | move, borrow, Shared/Weak, поля после move, string-поля, spread, embedded |
| 16.4 | Массивы | move, borrow, Slice, element access, строки в массивах, spread, embedded |
| 16.5 | Кортежи | move, borrow, element-level, readonly, optional, rest, spread, embedded |
| 16.6 | Замыкания | capture rules, copy-by-value default, явный список захвата, trampoline, Mut-capture |

### Блок 17: Замыкания

| # | Глава | Темы |
|---|-------|------|
| 17.1 | Объявление замыкания | синтаксис, type inference, когда стрелочная, когда full |
| 17.2 | Захват переменных | copy-by-value default, почему не Ref, сравнение с TS/C++/Rust |
| 17.3 | Явный список захвата | зачем, синтаксис, когда нужен |
| 17.4 | Замыкания как аргументы | callback pattern, function types, type loss (баг?) |
| 17.5 | Вложенные замыкания | dangling pointer (баг?), вложенный capture |
| 17.6 | Рекурсивные замыкания | undeclared variable (баг?), как обойти |
| 17.7 | Замыкания на AVR | no heap, стек, trampoline adapter, ограничения |
| 17.8 | Замыкания в async | env потеря (баг?), capture через await, Mut-closure через await запрещено |

### Блок 18: Модули

| # | Глава | Темы |
|---|-------|------|
| 18.1 | Файл = модуль | конвенции, index.tsc, std/ prefix, @tsc/ scope |
| 18.2 | Export | named exports, no default, re-exports |
| 18.3 | Import | named imports, namespace imports, import type |
| 18.4 | @platform | условная компиляция, правила, примеры, несколько платформ |
| 18.5 | Inline C | native {}, callback, closures в native |
| 18.6 | unsafe {} | отключение проверок, когда нужен, опасности |
| 18.7 | .d.tsc файлы | C interop, header bindings, declare syntax |
| 18.8 | Declaration merging | расширение типов без замены |
| 18.9 | Path aliases | конфигурация, wildcard, монорепозиторий |
| 18.10 | Module-level переменные | top-level let/const, C-output, init order (NOT YET) |
| 18.11 | Scalar type | variadic C функции, interop |

### Блок 19: Декораторы

| # | Глава | Темы |
|---|-------|------|
| 19.1 | Философия декораторов | почему language primitive, не framework |
| 19.2 | Синтаксис и применение | @decorator, места применения, порядок |
| 19.3 | Определение декоратора | decorator function, before/after, capture |
| 19.4 | MethodDesc | descriptor API для методов, поля, что реализовано, что нет |
| 19.5 | ClassDesc, PropDesc, ParamDesc | descriptor API, статус реализации |
| 19.6 | Параметризованные декораторы | фабрики, @log("prefix"), примеры |
| 19.7 | Comptime-метаданные | meta API, SelfRef, MetaStore (NOT YET) |
| 19.8 | Декораторы на async-методах | ограничения, timing, C-output |
| 19.9 | Декораторы и платформа | @platform + декораторы, embedded ограничения |
| 19.10 | C-output декораторов | wrapper chain, именование, компиляция ctx.self.field |

### Блок 20: Async/Await

| # | Глава | Темы |
|---|-------|------|
| 20.1 | Модель async | уровни, runtime абстракция (libuv/io_uring/poll), почему так |
| 20.2 | async function | объявление, state machine, C-output, размер SM |
| 20.3 | await | правила, borrows через await запрещено, почему |
| 20.4 | Promise<T> | создание, then/catch/finally, C-output |
| 20.5 | Promise.all / race / any / allSettled | комбинаторы, C-output |
| 20.6 | async main | как компилируется, отличие от sync main |
| 20.7 | State machine | размер, alignment, stack safety, embedded ограничения |
| 20.8 | Async ownership | retain-on-capture string, Ref<T> через await запрещено, cleanup |
| 20.9 | AbortSignal | отмена задач, паттерн, C-output |
| 20.10 | AsyncMutex | координация async-функций |
| 20.11 | Рекурсивные async | @embedded.stack(name, N), ограничения |
| 20.12 | Async на AVR | cooperative scheduler, no heap, singleton SM, ограничения |

### Блок 21: Генераторы

| # | Глава | Темы |
|---|-------|------|
| 21.1 | function* | объявление, yield, next(), C-output |
| 21.2 | for-of по генератору | итерация, ленивость, C-output |
| 21.3 | Async generators | async function*, yield, for await, C-output |
| 21.4 | Generator cleanup | return(), throw(), C-output |
| 21.5 | @embedded.singleton | единственный экземпляр, uint8_t state, embedded |
| 21.6 | Генераторы на AVR | стек, no heap, альтернативы |
| 21.7 | Кооперативная многозадачность | генераторы как корутины, паттерн |

### Блок 22: Threads

| # | Глава | Темы |
|---|-------|------|
| 22.1 | Thread.spawn | создание потока, join, типизированный результат |
| 22.2 | Atomic<T> | создание, load/store, add/sub/and/or/xor, C-output |
| 22.3 | AtomicArray<T> | создание, потоко-безопасный доступ, C-output |
| 22.4 | Channel<T> | создание, send/receive, SPSC, bounded, C-output |
| 22.5 | select | синхронный, sequential tryReceive, C-output |
| 22.6 | Readonly<T> | zero-overhead const, thread-safe read, C-output |
| 22.7 | Mutex<T> | взаимное исключение, отличие от async mutex |
| 22.8 | Thread safety | какие операции безопасны, Channel (баг?), data races |

### Блок 23: Embedded

| # | Глава | Темы |
|---|-------|------|
| 23.1 | Введение в embedded | зачем TSClang на железе, платформы, ограничения |
| 23.2 | @embedded.inline | классы без heap, стек, C-output |
| 23.3 | @embedded.noHeap | проверка отсутствия heap, C-output |
| 23.4 | @embedded.pool(N) | pool allocator, фиксированный размер, C-output |
| 23.5 | @embedded.isr | Interrupt Service Routine, правила, ограничения |
| 23.6 | Volatile<T> | MMIO регистры, pointer semantics, C-output |
| 23.7 | EmbeddedSignal | мост ISR → async, автоматическая битовая упаковка |
| 23.8 | std/sync | критические секции на embedded |
| 23.9 | std/embedded | HashMap<K,V,N>, Tasks<N>, pointer<T>, MMIO регистры |
| 23.10 | Allocator стратегии | none, static, pool, когда какую |
| 23.11 | Scheduler | cooperative, приоритеты, embedded vs desktop |
| 23.12 | Heap-free платформы | что работает: классы, массивы, Map/Set, async, генераторы |

### Блок 24: Stdlib — основы

| # | Глава | Темы |
|---|-------|------|
| 24.1 | console | log, error, warn, time/timeEnd, форматирование, AVR (USART) |
| 24.2 | Math | константы, методы, random (linker error баг?), AVR |
| 24.3 | parseInt / parseFloat | конвертация, глобальные функции, Number.parseInt |
| 24.4 | process | argv, env, exit, stdin/stdout/stderr, платформы |
| 24.5 | JSON | parse, stringify, типы, AVR ограничения |
| 24.6 | Date | legacy (desktop only), создание, методы, форматирование |
| 24.7 | std/temporal | PlainDate, PlainTime, PlainDateTime, Instant, Duration |

### Блок 25: Stdlib — продвинутый

| # | Глава | Темы |
|---|-------|------|
| 25.1 | Buffer | создание, чтение/запись, методы, статус реализации |
| 25.2 | DataView | typed access, endianness, C-output |
| 25.3 | std/string | Unicode methods, graphemes, normalize, encode/decode |
| 25.4 | std/regex | регулярные выражения, синтаксис, ограничения |
| 25.5 | std/url | URL parsing, конвертация |
| 25.6 | std/random | Random, SecureRandom, HardwareRandom |
| 25.7 | std/blob | Binary large objects |
| 25.8 | std/formdata | FormData API |
| 25.9 | std/libc | прямые C биндинги, Memory, Strings, I/O, Variadic |

### Блок 26: Stdlib — IO и сеть

| # | Глава | Темы |
|---|-------|------|
| 26.1 | std/io | Reader/Writer, pipe, readAll/writeAll, readLine, desktop only |
| 26.2 | std/fs | readFile/writeFile, stat, readdir, sync/async, C-output |
| 26.3 | std/net | fetch, HTTP server, TCP/UDP sockets, C-output |
| 26.4 | std/ws | WebSocket client/server, frame format, C-output |

### Блок 27: Stdlib — AVR

| # | Глава | Темы |
|---|-------|------|
| 27.1 | std/avr | GPIO, timing, serial/UART, ADC, PWM, interrupts |
| 27.2 | std/hal | Hardware Abstraction Layer, GPIO, I2C, SPI, UART, platform profile |

### Блок 28: Stdlib — Reactive

| # | Глава | Темы |
|---|-------|------|
| 28.1 | Signal<T> | создание, чтение, запись, C-output |
| 28.2 | effect | побочные эффекты, auto-tracking, async запрещено |
| 28.3 | computed | производные значения, кеширование |

### Блок 29: Система сборки

| # | Глава | Темы |
|---|-------|------|
| 29.1 | tsc.package.json | поля, типы проектов, schema |
| 29.2 | Executable | структура, main.tsc, сборка |
| 29.3 | Library | структура, index.tsc, публикация |
| 29.4 | C-wrapper | обёртка над C библиотекой, .d.tsc, link конфигурация |
| 29.5 | Platform profile | структура, built-in/community/local, подключение |
| 29.6 | Build profiles | debug/release/custom, оптимизация, флаги |
| 29.7 | CLI команды | build, run, init, install, update, lint |
| 29.8 | Зависимости | semver, flat tree, lock file, реестр |
| 29.9 | Таблица платформ | desktop, mobile, web, embedded, retro, consoles |

### Блок 30: Type Aliases и Utility Types

| # | Глава | Темы |
|---|-------|------|
| 30.1 | Type Aliases | `type X = ...`, когда использовать |
| 30.2 | String Literal Union | `"a" \| "b"`, pattern matching, C-output |
| 30.3 | keyof | getting keys from type |
| 30.4 | Partial<T>, Required<T>, Readonly<T> | utility types, C-output |
| 30.5 | NonNullable<T>, Pick<T,K>, Omit<T,K> | utility types |
| 30.6 | Record<K,V>, ReturnType<T>, Parameters<T> | utility types |
| 30.7 | Awaited<T> | unwrap Promise type |
| 30.8 | Generic functions | правило А+Б, inference |

### Блок 31: Миграция с TypeScript

| # | Глава | Темы |
|---|-------|------|
| 31.1 | Что работает как есть | interfaces, functions, classes, arrow functions |
| 31.2 | Автоматические правки | codemod, tsclang migrate (roadmap) |
| 31.3 | Ручные правки | number → конкретные типы, null vs undefined, == vs === |
| 31.4 | Несовместимые паттерны | closures ограничения, no eval, no dynamic |
| 31.5 | Что добавляет TSClang | ownership, mut, Ref<T>, inline C, embedded |

### Блок 32: Архитектура компилятора (глубокий разбор)

| # | Глава | Темы |
|---|-------|------|
| 32.1 | Фазы компиляции | lexer → parser → AST → decorator pass → typecheck → codegen |
| 32.2 | Decorator pass | pre-typecheck AST transformation |
| 32.3 | IR (PLANNED) | SSA basic blocks, зачем, альтернативы |
| 32.4 | Name mangling | полная схема, кодирование, примеры |
| 32.5 | Debug info | #line директивы, source maps, GDB, OpenOCD |
| 32.6 | Optimization levels | что делает tsclang, что делает C compiler |
| 32.7 | Error messages | формат, категории, hint rules |
| 32.8 | Incremental compilation | roadmap |
| 32.9 | Consumer-side monomorphization | PLANNED, зачем, альтернативы |

---

**Итого: ~170 глав** в 33 блоках.
