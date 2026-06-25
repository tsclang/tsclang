# Детальное оглавление книги TSClang

Каждая тема = отдельный файл. Формат пути: `book/<блок>/<глава>/<тема>.md`

Детальное оглавление: [TOC.md](TOC.md)

---

## Блок 0: Введение (00-intro)

### 00.1 Что такое TSClang и зачем он нужен
- 00.1.1-why-tsclang.md — Проблемы TypeScript (runtime overhead, no native, GC pauses)
- 00.1.2-why-not-cpp.md — Проблемы C/C++ (UB, manual memory, complexity)
- 00.1.3-why-not-rust.md — Проблемы Rust (lifetimes, borrow checker complexity, learning curve)
- 00.1.4-tsclang-philosophy.md — Что TSClang делает иначе: TS syntax + native + memory safety + embedded
- 00.1.5-design-principles.md — П1 (cross-platform), П2 (TS compat), П3 (better than competitors)
- 00.1.6-use-cases.md — Серверы, desktop, embedded, игры, retro-платформы, CLI-утилиты
- 00.1.7-ts-vs-tsclang-comparison.md — Боковое сравнение TS и TSClang

### 00.2 Установка и первый запуск
- 00.2.1-requirements.md — Node.js 18+, GCC/Clang, опционально AVR-GCC
- 00.2.2-installation.md — npm install -g tsclang, проверка установки
- 00.2.3-cli-overview.md — Команды build, run, init, lint, lsp
- 00.2.4-project-structure.md — Структура проекта: tsc.package.json, src/, main.tsc

### 00.3 Архитектура компилятора
- 00.3.1-compilation-pipeline.md — Фазы: lexer → parser → AST → decorator pass → typecheck → codegen
- 00.3.2-lexer-overview.md — Как лексер разбивает текст на токены
- 00.3.3-parser-overview.md — Как парсер строит AST из токенов
- 00.3.4-typecheck-overview.md — Как typecheck проверяет типы и ownership
- 00.3.5-codegen-overview.md — Как codegen превращает AST в C-код
- 00.3.6-targets.md — Desktop (libuv), AVR (no runtime), WASM — как меняется codegen
- 00.3.7-spec-file-intro.md — Как устроены файлы спецификации

### 00.4 Hello World — desktop
- 00.4.1-first-file.md — Создание hello.tsc, console.log("Hello, World!")
- 00.4.2-compilation.md — tsclang build hello.tsc --outDir dist
- 00.4.3-c-output.md — Разбор hello.c: #include "runtime.h", main, TSC_INIT(), printf
- 00.4.4-cmakelists.md — Разбор CMakeLists.txt
- 00.4.5-running.md — Сборка через CMake, запуск бинарника
- 00.4.6-tsclang-run.md — tsclang run — компиляция и запуск в одну команду
- 00.4.7-top-level-code.md — Top-level выражения, не нужен function main()

### 00.5 Hello World — AVR
- 00.5.1-avr-target.md — tsclang build --target avr
- 00.5.2-avr-c-output.md — Разбор hello.c для AVR: USART_Transmit вместо printf
- 00.5.3-avr-runtime.md — Runtime для AVR: no heap, no stdio, no OS
- 00.5.4-avr-no-printf.md — Почему printf недоступен на AVR
- 00.5.5-avr-flashing.md — Прошивка через avrdude

### 00.6 Hello World — async
- 00.6.1-async-main.md — async function main()
- 00.6.2-async-c-output.md — Разбор C: state machine, _state, _poll
- 00.6.3-async-vs-sync.md — Разница sync и async main
- 00.6.4-async-on-avr.md — Async на AVR: cooperative scheduler, singleton SM

---

## Блок 1: Лексика и форматирование (01-lexing)

### 01.1 Токены и лексер
- 01.1.1-what-are-tokens.md — Что такое токен, зачем нужен лексер
- 01.1.2-token-types.md — Типы токенов: identifier, keyword, number, string, char, operator, punctuation
- 01.1.3-how-lexer-works.md — Как лексер обрабатывает исходный код: позиция, lookahead, ошибки
- 01.1.4-lexer-errors.md — Ошибки лексера: незаконные символы, незакрытые строки
- 01.1.5-whitespace.md — Пробелы, табы, переносы строк — что значимо, что нет
- 01.1.6-unicode-in-source.md — Unicode в исходном коде: идентификаторы, строки, комментарии

### 01.2 Комментарии
- 01.2.1-line-comments.md — Однострочные `//`
- 01.2.2-block-comments.md — Многострочные `/* */`, вложенность
- 01.2.3-doc-comments.md — Doc-комментарии для документации API
- 01.2.4-comments-in-c-output.md — Комментарии в сгенерированном C
- 01.2.5-comments-best-practices.md — Когда писать комментарии, когда код самодокументирующий

### 01.3 Форматирование
- 01.3.1-semicolon-optional.md — Точка с запятой: опциональна, но не ASI
- 01.3.2-why-not-asi.md — Почему не ASI как в JS: проблемы ASI, примеры ошибок
- 01.3.3-lint-fix.md — tsclang lint --fix: auto-correct правил (let→const), не форматтер
- 01.3.4-braces.md — K&R braces, обязательные фигурные скобки
- 01.3.5-indentation.md — Отступы: conventions
- 01.3.6-formatting-alternatives.md — Альтернативы: почему не prettier, почему не gofmt-style

### 01.4 Идентификаторы и ключевые слова
- 01.4.1-identifier-rules.md — Правила имён: [a-zA-Z_][a-zA-Z0-9_]*
- 01.4.2-keywords.md — Ключевые слова: полный список
- 01.4.3-reserved-type-prefixes.md — Зарезервированные префиксы типов: tsc_, _tsc, __
- 01.4.4-naming-conventions.md — Конвенции: camelCase, PascalCase, UPPER_CASE
- 01.4.5-contextual-keywords.md — Контекстно-зависимые ключевые слова: mut, throws, async, native
- 01.4.6-identifier-errors.md — Ошибки: зарезервированные имена, конфликт с runtime

### 01.5 Литералы
- 01.5.1-decimal-literals.md — Десятичные: 42, 3.14, тип по умолчанию
- 01.5.2-hex-literals.md — Шестнадцатеричные: 0xFF
- 01.5.3-binary-literals.md — Двоичные: 0b1010
- 01.5.4-octal-literals.md — Восьмеричные: 0o77
- 01.5.5-number-separators.md — Разделители цифр: 1_000_000
- 01.5.6-string-literals.md — Строковые литералы: "hello", escape-последовательности
- 01.5.7-char-literals.md — Символьные литералы: 'a' = u8, отличие от TS
- 01.5.8-boolean-literals.md — true и false
- 01.5.9-null-literal.md — null
- 01.5.10-undefined-literal.md — undefined, синоним null?
- 01.5.11-literal-overflow.md — Literal overflow: 256 в u8, NOT YET IMPLEMENTED

---

## Блок 2: Переменные и базовые типы (02-variables)

### 02.1 let и const
- 02.1.1-let-declaration.md — let x = 5, type inference, изменяемость
- 02.1.2-const-declaration.md — const x = 5, неизменяемость
- 02.1.3-var-synonym.md — var как синоним let
- 02.1.4-type-annotation.md — let x: i32 = 5, когда аннотация обязательна
- 02.1.5-uninitialized.md — Объявление без инициализации: let x: i32
- 02.1.6-reassignment.md — Переприсвоение let, запрещено для const
- 02.1.7-scope.md — Block scope, function scope, module scope
- 02.1.8-shadowing.md — Перекрытие имён
- 02.1.9-c-output-variables.md — C-output: как let/const компилируются
- 02.1.10-avr-variables.md — На AVR: стек, static, ограничения
- 02.1.11-async-variables.md — В async: переменные в state machine
- 02.1.12-ts-differences.md — Отличия от TS: нет hoisting, block scope всегда

### 02.2 Type inference
- 02.2.1-how-inference-works.md — Как компилятор выводит тип
- 02.2.2-literal-inference.md — Вывод из литерала: 42 → i32, "hello" → string
- 02.2.3-expression-inference.md — Вывод из выражения: a + b
- 02.2.4-contextual-inference.md — Контекстуальный вывод: параметры, return
- 02.2.5-when-annotation-needed.md — Когда аннотация обязательна
- 02.2.6-widening.md — Widening: number literal widening
- 02.2.7-inference-errors.md — Ошибки inference
- 02.2.8-inference-alternatives.md — Альтернативы: почему не full inference, почему не explicit-only

### 02.3 Числовые типы
- 02.3.1-signed-integers.md — i8, i16, i32, i64: диапазоны, размер, C-типы
- 02.3.2-unsigned-integers.md — u8, u16, u32, u64: диапазоны, размер, C-типы
- 02.3.3-floats.md — f32, f64: точность, IEEE 754
- 02.3.4-usize.md — usize: платформенный размер
- 02.3.5-isize.md — isize: ptrdiff_t
- 02.3.6-default-number-type.md — Тип по умолчанию для числового литерала
- 02.3.7-number-c-output.md — C-output: int8_t, int32_t, float, double, size_t
- 02.3.8-number-on-avr.md — На AVR: размер типов, software float
- 02.3.9-number-in-async.md — В async: числовые типы в state machine
- 02.3.10-why-these-types.md — Почему не number как в TS: П2 vs П3

### 02.4 Числовые литералы
- 02.4.1-decimal.md — 42, 3.14, 0, -5
- 02.4.2-hex.md — 0xFF, 0xABCD
- 02.4.3-binary.md — 0b1010, 0b11111111
- 02.4.4-octal.md — 0o77, 0o377
- 02.4.5-separators.md — 1_000_000, 0xFF_FF, где нельзя
- 02.4.6-suffixes.md — Суффиксы типов: 42i8, 3.14f32
- 02.4.7-literal-type-rules.md — Правила определения типа литерала
- 02.4.8-literal-overflow.md — Переполнение литерала: 256 в u8

### 02.5 Числовая конвертация
- 02.5.1-widening-auto.md — Автоматическое widening: i8 → i16 → i32 → i64
- 02.5.2-narrowing-explicit.md — Явное narrowing: i32 → i8 через as
- 02.5.3-overflow-behavior.md — Переполнение: wrap-around, undefined, checked
- 02.5.4-float-to-int.md — f64 → i32: truncation, потеря дробной части
- 02.5.5-int-to-float.md — i32 → f64: безопасно, i64 → f64: потеря точности
- 02.5.6-number-to-string.md — String(x), x.toString(), шаблонные строки
- 02.5.7-string-to-number.md — parseInt, parseFloat, i32.parse
- 02.5.8-js-compat-functions.md — JS-совместимые глобальные: parseInt, parseFloat, isNaN
- 02.5.9-conversion-on-avr.md — На AVR: нет snprintf для float
- 02.5.10-why-these-rules.md — Сравнение с TS (number only), C (implicit casts), Rust (no implicit)

### 02.6 Boolean
- 02.6.1-bool-type.md — Тип bool, true/false, C: _Bool
- 02.6.2-truthy-falsy.md — Truthy/falsy правила
- 02.6.3-truthy-values.md — Truthy: non-zero, non-null
- 02.6.4-falsy-values.md — Falsy: 0, "", null, false
- 02.6.5-implicit-coercion.md — Неявное приведение в if/while
- 02.6.6-comparison-with-ts.md — Отличие от TS
- 02.6.7-bool-c-output.md — C-output: _Bool
- 02.6.8-bool-on-avr.md — На AVR: _Bool = 1 byte, bitfields

### 02.7 null и undefined
- 02.7.1-null-type.md — null как значение, тип null, T | null
- 02.7.2-undefined-synonym.md — undefined: синоним null или отдельный тип?
- 02.7.3-nullable-types.md — T | null: C-output (opt_T struct с has_value)
- 02.7.4-why-not-undefined-separate.md — Почему не отдельный undefined: П2 vs П3
- 02.7.5-null-in-expressions.md — null в выражениях
- 02.7.6-null-c-output.md — C-output: opt_i32 { has_value; value; }
- 02.7.7-null-on-avr.md — На AVR: overhead opt_T, embedded patterns
- 02.7.8-null-in-async.md — В async: nullable в state machine
- 02.7.9-ts-differences.md — Отличие от TS

### 02.8 void и never
- 02.8.1-void-type.md — void: тип возврата функций
- 02.8.2-never-type.md — never: функции которые никогда не возвращаются
- 02.8.3-never-in-unions.md — never в union: T | never = T
- 02.8.4-never-in-match.md — never в match: exhaustive check
- 02.8.5-void-c-output.md — C-output: void function
- 02.8.6-never-c-output.md — C-output: abort(), __builtin_unreachable
- 02.8.7-void-never-on-avr.md — На AVR: abort() недоступен
- 02.8.8-ts-differences.md — Отличие от TS

### 02.9 unknown
- 02.9.1-what-is-unknown.md — unknown: type-safe top-type
- 02.9.2-unknown-vs-any.md — unknown vs any
- 02.9.3-typeof-narrowing.md — typeof narrowing
- 02.9.4-unknown-c-layout.md — C-layout: tsc_unknown struct, type_id, data, vtable
- 02.9.5-unknown-packer-getter.md — Packer/Getter: упаковка и извлечение
- 02.9.6-unknown-auto-wrap.md — Auto-wrap: автоматическая упаковка
- 02.9.7-unknown-string-vtable.md — String vtable: строковое представление
- 02.9.8-unknown-restrictions.md — Ограничения текущей реализации
- 02.9.9-unknown-c-output.md — C-output: tsc_unknown struct
- 02.9.10-unknown-on-avr.md — На AVR: overhead, альтернативы
- 02.9.11-unknown-in-async.md — В async: unknown в state machine
- 02.9.12-ts-differences.md — Отличие от TS

### 02.10 any
- 02.10.1-what-is-any.md — any: escape hatch
- 02.10.2-any-vs-unknown.md — any vs unknown: когда каждый
- 02.10.3-any-operations.md — Операции с any: нет type checking
- 02.10.4-any-c-output.md — C-output: как any компилируется
- 02.10.5-any-on-avr.md — На AVR: overhead
- 02.10.6-ts-differences.md — Отличие от TS
- 02.10.7-any-alternatives.md — Альтернативы: unknown, generics, union types

---

## Блок 3: Операторы (03-operators)

### 03.1 Арифметические операторы
- 03.1.1-addition.md — + для чисел, конкатенация строк
- 03.1.2-subtraction.md — - унарный и бинарный
- 03.1.3-multiplication.md — *, overflow
- 03.1.4-division.md — / целочисленное vs float, division by zero
- 03.1.5-modulo.md — % остаток, поведение с отрицательными
- 03.1.6-power.md — ** возведение в степень
- 03.1.7-unary-minus.md — Унарный минус, переполнение
- 03.1.8-integer-overflow.md — Переполнение: checked vs unchecked
- 03.1.9-arithmetic-c-output.md — C-output: прямые операторы C
- 03.1.10-arithmetic-on-avr.md — На AVR: software division
- 03.1.11-arithmetic-in-async.md — В async: без overhead

### 03.2 Операторы сравнения
- 03.2.1-equality.md — == для примитивов, string comparison (struct UB?)
- 03.2.2-inequality.md — !=
- 03.2.3-relational.md — <, >, <=, >= для чисел
- 03.2.4-string-comparison.md — Сравнение строк: struct UB, C-output
- 03.2.5-strict-equality.md — === в TSClang: есть или нет
- 03.2.6-comparing-null.md — Сравнение с null
- 03.2.7-comparison-c-output.md — C-output: ==, strcmp
- 03.2.8-comparison-on-avr.md — На AVR: strcmp overhead

### 03.3 Логические операторы
- 03.3.1-and.md — &&, short-circuit
- 03.3.2-or.md — ||, short-circuit, default values pattern
- 03.3.3-not.md — !, унарное отрицание
- 03.3.4-short-circuit.md — Short-circuit semantics
- 03.3.5-logical-vs-bitwise.md — && vs &, || vs |
- 03.3.6-logical-c-output.md — C-output
- 03.3.7-logical-in-conditions.md — В условиях: вложенные, сложные выражения

### 03.4 Битовые операторы
- 03.4.1-bitwise-and.md — &, маски, флаги
- 03.4.2-bitwise-or.md — |, установка флагов
- 03.4.3-bitwise-xor.md — ^, toggle
- 03.4.4-bitwise-not.md — ~, инверсия
- 03.4.5-left-shift.md — <<, умножение на степень 2
- 03.4.6-right-shift.md — >>, арифметический vs логический
- 03.4.7-bitwise-on-avr.md — На AVR: critical для MMIO регистров
- 03.4.8-bitmask-patterns.md — Паттерны: флаги, маски, битовое поле
- 03.4.9-bitwise-c-output.md — C-output

### 03.5 Операторы присваивания
- 03.5.1-simple-assign.md — = copy для примитивов, move для complex
- 03.5.2-compound-assign.md — +=, -=, *=, /=, %=, &=, |=, ^=, <<=, >>=
- 03.5.3-string-concat-assign.md — += для строк: leak?
- 03.5.4-assign-after-declaration.md — Присвоение после объявления
- 03.5.5-assign-ownership.md — Ownership при присвоении
- 03.5.6-assign-c-output.md — C-output

### 03.6 Тернарный оператор
- 03.6.1-ternary-syntax.md — condition ? a : b
- 03.6.2-ternary-type.md — Тип результата: совместимость веток
- 03.6.3-nested-ternary.md — Вложенные: читаемость
- 03.6.4-ternary-vs-match.md — Тернарный vs match
- 03.6.5-ternary-c-output.md — C-output
- 03.6.6-ts-differences.md — Отличие от TS

### 03.7 Nullish coalescing — ??
- 03.7.1-nullish-coalescing-syntax.md — ?? syntax: x ?? default
- 03.7.2-nullish-semantics.md — Семантика: null → right, non-null → left
- 03.7.3-nullish-vs-or.md — ?? vs ||: разница
- 03.7.4-nullish-ownership.md — Ownership: move? borrow?
- 03.7.5-nullish-with-complex-types.md — ?? с complex типами: struct с has_value
- 03.7.6-nullish-c-output.md — C-output: has_value ? value : default
- 03.7.7-nullish-on-avr.md — На AVR: overhead opt_T
- 03.7.8-nullish-in-async.md — В async: ?? в state machine

### 03.7b Optional chaining — ?.
- 03.7b.1-optional-chaining-syntax.md — ?. syntax: x?.field, x?.method()
- 03.7b.2-optional-chaining-semantics.md — Семантика: null → null, non-null → access
- 03.7b.3-optional-chaining-where.md — Где можно: field, method, arr?.[i]?, fn?.()?
- 03.7b.4-optional-chaining-c-output.md — C-output: has_value check
- 03.7b.5-optional-chaining-chains.md — Цепочки: a?.b?.c?.d
- 03.7b.6-optional-chaining-on-avr.md — На AVR: overhead

### 03.8 Приоритет операторов
- 03.8.1-precedence-table.md — Полная таблица приоритетов
- 03.8.2-precedence-examples.md — Примеры: a + b * c, a && b || c
- 03.8.3-associativity.md — Ассоциативность: левая vs правая
- 03.8.4-precedence-vs-ts.md — Отличие от TS
- 03.8.5-parentheses.md — Скобки: когда обязательны

### 03.9 Оператор as
- 03.9.1-as-syntax.md — x as Type
- 03.9.2-as-for-casting.md — Type casting: i32 → i8, f64 → i32
- 03.9.3-as-for-narrowing.md — Type narrowing: any → string
- 03.9.4-as-const.md — const assertion: x as const
- 03.9.5-as-safety.md — Безопасность: runtime check или нет
- 03.9.6-as-vs-ts-as.md — Отличие от TS
- 03.9.7-as-c-output.md — C-output: (int8_t), (int32_t)

---

## Блок 4: Функции (04-functions)

### 04.1 Объявление функций
- 04.1.1-function-syntax.md — function name(params): returnType { body }
- 04.1.2-return-type.md — Явный и inferred return type
- 04.1.3-return-statement.md — return, void return, multiple returns
- 04.1.4-function-body.md — Тело функции: выражения, statements
- 04.1.5-function-as-statement.md — Declaration vs expression: hoisting
- 04.1.6-function-c-output.md — C-output: static returnType name_mangled(params)
- 04.1.7-function-on-avr.md — На AVR: static, стек, ограничение рекурсии
- 04.1.8-function-in-async.md — В async: вызов sync из async

### 04.2 Параметры по умолчанию
- 04.2.1-default-params-syntax.md — function f(x: i32 = 10)
- 04.2.2-default-params-evaluation.md — Когда вычисляется default
- 04.2.3-default-params-ordering.md — Порядок: defaults после required
- 04.2.4-default-params-c-output.md — C-output: if (!has_x) x = 10;
- 04.2.5-default-params-on-avr.md — На AVR: overhead проверки

### 04.3 Rest-параметры
- 04.3.1-rest-params-syntax.md — function f(...args: i32[])
- 04.3.2-rest-params-type.md — Тип rest: массив
- 04.3.3-rest-params-with-normal.md — Mixing: function f(x: i32, ...rest: i32[])
- 04.3.4-rest-params-c-output.md — C-output
- 04.3.5-rest-params-restrictions.md — Ограничения

### 04.4 Перегрузка функций
- 04.4.1-overload-syntax.md — Синтаксис перегрузки
- 04.4.2-overload-resolution.md — Resolution: как компилятор выбирает
- 04.4.3-overload-priority.md — Приоритет: exact > widening > implicit
- 04.4.4-overload-ambiguity.md — Неоднозначность
- 04.4.5-overload-c-output.md — C-output: разные C-функции
- 04.4.6-overload-vs-generics.md — Overload vs generics
- 04.4.7-overload-extern-c.md — extern "C" запрещает перегрузку

### 04.5 Name mangling
- 04.5.1-mangling-why.md — Зачем mangling
- 04.5.2-mangling-scheme.md — Формальная схема
- 04.5.3-mangling-types.md — Кодирование типов
- 04.5.4-mangling-methods.md — Манглинг методов
- 04.5.5-mangling-module-slug.md — Module slug: коллизии
- 04.5.6-mangling-ebnf.md — Формальная грамматика EBNF
- 04.5.7-mangling-examples.md — Примеры
- 04.5.8-mangling-c-output.md — C-output

### 04.6 Стрелочные функции
- 04.6.1-arrow-syntax.md — (x) => x + 1
- 04.6.2-arrow-short.md — Сокращения: x => x + 1
- 04.6.3-arrow-vs-function.md — Arrow vs function: this binding
- 04.6.4-arrow-as-closure.md — Arrow как замыкание
- 04.6.5-async-arrow.md — async arrow: проблемы парсинга (баг?)
- 04.6.6-arrow-c-output.md — C-output: env struct
- 04.6.7-arrow-on-avr.md — На AVR: trampoline adapter

### 04.7 Функции как значения
- 04.7.1-assign-function.md — let f = myFunction
- 04.7.2-function-type.md — Тип функции: (i32) => i32
- 04.7.3-pass-as-argument.md — Передача функции как аргумента
- 04.7.4-return-function.md — Возврат функции из функции
- 04.7.5-type-loss-bug.md — Type loss при присвоении (баг?)
- 04.7.6-function-values-c-output.md — C-output: function pointer
- 04.7.7-function-values-on-avr.md — На AVR: ограничения

### 04.8 Семантика передачи значений
- 04.8.1-copy-semantics.md — Примитивы: copy при передаче
- 04.8.2-move-semantics.md — Complex types: move при передаче
- 04.8.3-borrow-semantics.md — Ref<T>: borrow при передаче
- 04.8.4-implicit-borrow.md — Неявный borrow: когда компилятор автоматически создаёт Ref
- 04.8.5-transfer-why.md — Почему так: сравнение с C (pointer), TS (reference), Rust (move)

### 04.9 throws
- 04.9.1-throws-syntax.md — function f(): i32 throws Error
- 04.9.2-throws-required.md — Почему throws обязательный, а не inferred
- 04.9.3-throws-vs-ts-exceptions.md — Сравнение с TS exceptions
- 04.9.4-throws-c-output.md — C-output: Result struct
- 04.9.5-throws-on-avr.md — На AVR: Result struct, стек

### 04.10 Функции на AVR
- 04.10.1-static-dispatch.md — Static dispatch всегда
- 04.10.2-no-recursion.md — Рекурсия: ограничение стека
- 04.10.3-stack-usage.md — Стек: сколько занимает вызов функции
- 04.10.4-inlining.md — Когда компилятор инлайнит: @embedded.inline

---

## Блок 5: Строки (05-strings)

### 05.1 Тип string
- 05.1.1-string-immutable.md — Immutable строки: почему, сравнение с TS (immutable), C (mutable)
- 05.1.2-string-arc.md — ARC: retain/release, когда вызывается
- 05.1.3-string-c-layout.md — C-layout: struct { char* data; size_t length; _Bool owned; }
- 05.1.4-why-not-pointer.md — Почему не char*: ownership, safety, embedded
- 05.1.5-string-vs-ts-string.md — Отличие от TS: immutable, ARC, no GC

### 05.2 Строковые литералы
- 05.2.1-string-literal-syntax.md — "hello", escape: \n, \t, \\, \"
- 05.2.2-str-lit-in-c.md — STR_LIT макрос в C: что делает
- 05.2.3-multiline-strings.md — Многострочные строки: есть ли?
- 05.2.4-template-literals.md — Шаблонные строки: `Hello ${name}`

### 05.3 Символьные литералы
- 05.3.1-char-literal-syntax.md — 'a' = u8, синтаксис
- 05.3.2-char-vs-string.md — Отличие: 'a' (u8) vs "a" (string)
- 05.3.3-why-char-u8.md — Почему char = u8, а не codepoint или grapheme
- 05.3.4-char-in-expressions.md — char в выражениях: 'a' + 1, сравнение

### 05.4 Конкатенация
- 05.4.1-concat-plus.md — + для строк: "a" + "b"
- 05.4.2-concat-assign.md — += для строк: s += "more"
- 05.4.3-concat-temp-values.md — Временные значения: leak? (баг?)
- 05.4.4-concat-c-output.md — C-output: tsc_string_concat
- 05.4.5-concat-on-avr.md — На AVR: PROGMEM, ограничения

### 05.5 Индексация и длина
- 05.5.1-string-index.md — s[i] возвращает u8, не string
- 05.5.2-string-length.md — s.length: количество байт, не символов/графем
- 05.5.3-why-bytes-not-graphemes.md — Почему байты: П1 (embedded), П3 (performance)
- 05.5.4-string-index-on-avr.md — На AVR: PROGMEM access

### 05.6 Итерация по строке
- 05.6.1-for-of-string.md — for-of = итерация по байтам (u8)
- 05.6.2-why-bytes-iteration.md — Почему не codepoints/graphemes
- 05.6.3-iteration-on-avr.md — На AVR: итерация без heap
- 05.6.4-iteration-in-async.md — В async: string retain в state machine

### 05.7 Срезы строк
- 05.7.1-slice-syntax.md — Slice<string>: zero-copy view
- 05.7.2-slice-borrowing.md — Borrowing: slice заимствует строку
- 05.7.3-slice-c-output.md — C-output: pointer + length
- 05.7.4-slice-on-avr.md — На AVR: PROGMEM slice

### 05.8 Встроенные методы строк
- 05.8.1-toUpperCase-toLowerCase.md — toUpperCase, toLowerCase
- 05.8.2-indexOf-includes.md — indexOf, includes, lastIndexOf
- 05.8.3-slice-substring.md — slice, substring
- 05.8.4-split-join.md — split, join
- 05.8.5-trim.md — trim, trimStart, trimEnd
- 05.8.6-startsWith-endsWith.md — startsWith, endsWith
- 05.8.7-replace.md — replace, replaceAll
- 05.8.8-repeat-padStart.md — repeat, padStart, padEnd
- 05.8.9-string-methods-c-output.md — C-output: runtime functions
- 05.8.10-string-methods-on-avr.md — На AVR: какие доступны

### 05.9 Unicode extension methods
- 05.9.1-std-string-overview.md — std/string: Unicode extension methods
- 05.9.2-graphemes.md — graphemes(): итерация по графемам
- 05.9.3-normalize.md — normalize(): NFC, NFD, NFKC, NFKD
- 05.9.4-unicode-platforms.md — Доступность по платформам: desktop vs AVR
- 05.9.5-unicode-overhead.md — Overhead: почему не встроено

### 05.10 String на AVR
- 05.10.1-progmem.md — PROGMEM: статические строки во flash
- 05.10.2-no-heap-strings.md — No heap: строковые операции на стеке
- 05.10.3-string-limits-avr.md — Ограничения: длина, конкатенация, методы

### 05.11 String в async
- 05.11.1-retain-on-capture.md — Retain-on-capture: строка retain при входе в async
- 05.11.2-string-in-sm.md — String locals в state machine struct
- 05.11.3-string-cleanup.md — Cleanup: goto _cleanup для строк
- 05.11.4-string-async-why.md — Почему так: П1 (embedded), П3 (safety)

---

## Блок 6: Управление потоком (06-control-flow)

### 06.1 if / else
- 06.1.1-if-syntax.md — if (condition) { }, тип условия
- 06.1.2-if-else.md — else, else if, цепочки
- 06.1.3-if-type-narrowing.md — Type narrowing в ветках
- 06.1.4-if-expression.md — if как выражение: есть ли?
- 06.1.5-if-c-output.md — C-output: if → if
- 06.1.6-if-on-avr.md — На AVR: без изменений
- 06.1.7-if-in-async.md — В async: условие в state machine

### 06.2 Вложенные условия
- 06.2.1-complex-conditions.md — &&, || в условиях: if (a && b || c)
- 06.2.2-early-return.md — Early return: guard clauses, уменьшение вложенности
- 06.2.3-nested-if-else.md — Вложенные if/else: когда рефакторить в match
- 06.2.4-dangling-else.md — Dangling else: какая ветка к какому if
- 06.2.5-complex-conditions-c-output.md — C-output: вложенные if

### 06.3 switch / case
- 06.3.1-switch-syntax.md — switch (x) { case 1: ... break; default: ... }
- 06.3.2-switch-break.md — break: нужен или нет (fallthrough?)
- 06.3.3-switch-types.md — Типы в case: числа, строки, enum
- 06.3.4-switch-vs-match.md — switch vs match: когда что
- 06.3.5-switch-c-output.md — C-output: switch → switch или if-chain
- 06.3.6-switch-on-avr.md — На AVR: jump table vs if-chain

### 06.4 match
- 06.4.1-match-syntax.md — match (x) { pattern => expr, ... }
- 06.4.2-match-literals.md — Литералы: 1, "hello", true
- 06.4.3-match-ranges.md — Диапазоны: 1..10 (exclusive end)
- 06.4.4-match-wildcard.md — Wildcard: _ => default
- 06.4.5-match-exhaustiveness.md — Exhaustiveness: все случаи покрыты?
- 06.4.6-match-expression.md — match как выражение: const x = match ...
- 06.4.7-match-return.md — match и return: как взаимодействуют
- 06.4.8-match-c-output.md — C-output: if-chain или switch
- 06.4.9-match-on-avr.md — На AVR: overhead
- 06.4.10-match-in-async.md — В async: match в state machine

### 06.5 match с enum
- 06.5.1-match-enum-exhaustive.md — Enum + match: exhaustiveness check
- 06.5.2-match-enum-c-output.md — C-output: switch на enum values
- 06.5.3-match-enum-patterns.md — Паттерны: одиночные, множественные
- 06.5.4-match-enum-best-practices.md — Best practices: всегда exhaustive

### 06.6 match с type narrowing
- 06.6.1-instanceof-in-match.md — instanceof в match: NOT YET IMPLEMENTED
- 06.6.2-alternatives-to-instanceof.md — Альтернативы: as cast, discriminators
- 06.6.3-why-not-yet.md — Почему NOT YET: сложности реализации

### 06.7 for цикл
- 06.7.1-for-syntax.md — for (let i = 0; i < n; i++) { }
- 06.7.2-for-usize.md — usize для индексов: почему
- 06.7.3-for-off-by-one.md — Off-by-one: <= vs <, 0-indexed
- 06.7.4-for-break-continue.md — break, continue, labeled breaks
- 06.7.5-for-c-output.md — C-output: for → for
- 06.7.6-for-on-avr.md — На AVR: ограничение итераций
- 06.7.7-for-in-async.md — В async: for в state machine

### 06.8 for-of
- 06.8.1-for-of-syntax.md — for (const item of array) { }
- 06.8.2-for-of-arrays.md — Итерация по массивам
- 06.8.3-for-of-strings.md — Итерация по строкам: bytes
- 06.8.4-for-of-map-set.md — Итерация по Map, Set
- 06.8.5-for-of-no-reassign.md — Переприсвоение item запрещено: почему
- 06.8.6-for-of-c-output.md — C-output: index-based loop
- 06.8.7-for-of-on-avr.md — На AVR: ограничения
- 06.8.8-for-of-in-async.md — В async: for-of в state machine (баг?)

### 06.9 for-of с деструктуризацией
- 06.9.1-for-of-map-entries.md — Map.entries(): [key, value]
- 06.9.2-for-of-tuples.md — Итерация по массиву кортежей
- 06.9.3-for-of-nested-patterns.md — Вложенные паттерны
- 06.9.4-for-of-object-pattern.md — Object destructuring в for-of (поддерживается?)

### 06.10 while / do-while
- 06.10.1-while-syntax.md — while (condition) { }
- 06.10.2-do-while-syntax.md — do { } while (condition)
- 06.10.3-infinite-loops.md — while (true), for (;;) — разрешено?
- 06.10.4-break-continue.md — break, continue в циклах
- 06.10.5-labeled-loops.md — Labeled: outer: while, break outer
- 06.10.6-while-c-output.md — C-output: while → while
- 06.10.7-while-on-avr.md — На AVR: watchdog, infinite loops

### 06.11 Циклы на AVR
- 06.11.1-for-vs-while-avr.md — for vs while: какой компактнее
- 06.11.2-no-dynamic-bounds.md — Динамические границы: ограничения
- 06.11.3-loop-unrolling.md — Loop unrolling: компилятор делает?

### 06.12 Циклы в async
- 06.12.1-async-await-in-loops.md — await внутри for/while
- 06.12.2-for-await.md — for await: итерация по async generator
- 06.12.3-loops-in-sm.md — Как циклы компилируются в state machine
- 06.12.4-loop-state-machine-c-output.md — C-output: цикл + SM

---

## Блок 7: Массивы (07-arrays)

### 07.1 Объявление и создание
- 07.1.1-array-literal.md — [1, 2, 3], type inference
- 07.1.2-array-type.md — T[], Array<T>, type annotation
- 07.1.3-array-empty.md — Пустой массив: [], type annotation required
- 07.1.4-array-new.md — new Array<N>(), new Array<T>(size)
- 07.1.5-array-c-output.md — C-output: struct { T* data; size_t length; size_t capacity; }
- 07.1.6-array-on-avr.md — На AVR: стек, BSS, no heap

### 07.2 Индексация
- 07.2.1-array-index.md — arr[i], usize, что возвращает
- 07.2.2-bounds-checking.md — Bounds checking: есть или нет
- 07.2.3-array-index-mut.md — arr[i] = value: мутация элемента
- 07.2.4-array-index-c-output.md — C-output: data[index]
- 07.2.5-array-index-on-avr.md — На AVR: no bounds checking

### 07.3 Мутация
- 07.3.1-push.md — push, pop, shift, unshift
- 07.3.2-splice.md — splice: insert, remove
- 07.3.3-array-realloc.md — Realloc: как растёт массив, C-output
- 07.3.4-mutation-on-avr.md — На AVR: статический размер, no realloc

### 07.4 Функциональные методы
- 07.4.1-map.md — map<T, U>: преобразование, type inference
- 07.4.2-filter.md — filter<T>: фильтрация
- 07.4.3-reduce.md — reduce<T, U>: агрегация
- 07.4.4-forEach.md — forEach<T>: итерация с побочным эффектом
- 07.4.5-find.md — find, findIndex, findLast, findLastIndex
- 07.4.6-some-every.md — some, every: проверка условия
- 07.4.7-functional-c-output.md — C-output: loop + callback
- 07.4.8-functional-on-avr.md — На AVR: overhead, ограничения

### 07.5 Поиск и сортировка
- 07.5.1-indexOf-includes.md — indexOf, lastIndexOf, includes
- 07.5.2-sort.md — sort, comparator, in-place
- 07.5.3-toSorted.md — toSorted: immutable sort
- 07.5.4-sort-on-avr.md — На AVR: PROGMEM strings (баг?)
- 07.5.5-sort-c-output.md — C-output: qsort

### 07.6 Spread и конкатенация
- 07.6.1-spread-syntax.md — [...arr1, ...arr2]
- 07.6.2-spread-temp-arrays.md — Временные массивы: overhead
- 07.6.3-concat.md — arr1.concat(arr2)
- 07.6.4-spread-c-output.md — C-output: memcpy

### 07.7 Slice<T>
- 07.7.1-slice-syntax.md — Slice<T>: zero-copy view
- 07.7.2-slice-borrowing.md — Borrowing: slice заимствует массив
- 07.7.3-slice-vs-array.md — Slice vs Array: когда что
- 07.7.4-slice-c-output.md — C-output: pointer + length
- 07.7.5-slice-on-avr.md — На AVR: PROGMEM slice

### 07.8 Массивы строк
- 07.8.1-string-arrays-ownership.md — Ownership: retain/release строк в массиве
- 07.8.2-string-arrays-c-output.md — C-output: Array_string struct
- 07.8.3-string-arrays-cleanup.md — Cleanup: _free для массива строк

### 07.9 Массивы optional
- 07.9.1-optional-in-arrays.md — [1, null, 3]: struct с has_value
- 07.9.2-optional-array-bug.md — Баг: values в has_value вместо .value
- 07.9.3-optional-array-c-output.md — C-output: Array_opt_i32

### 07.10 Массивы на AVR
- 07.10.1-static-arrays.md — Статические массивы: compile-time size
- 07.10.2-stack-arrays.md — Стековые массивы: VLA или fixed
- 07.10.3-bss-arrays.md — BSS: глобальные массивы
- 07.10.4-no-heap-limitations.md — No heap: нельзя push, нельзя realloc

### 07.11 Массивы в async
- 07.11.1-array-capture-sm.md — Capture массива в state machine
- 07.11.2-array-ownership-await.md — Ownership через await
- 07.11.3-array-async-c-output.md — C-output: массив в SM struct

### 07.12 Метод chaining
- 07.12.1-chaining-syntax.md — .map().filter().reduce()
- 07.12.2-type-loss-bug.md — Type loss: fallback i32 (баг?)
- 07.12.3-chaining-c-output.md — C-output: nested loops
- 07.12.4-chaining-alternatives.md — Альтернативы: manual loops, for-of

---

## Блок 8: Кортежи (08-tuples)

### 08.1 Объявление и создание
- 08.1.1-tuple-syntax.md — [T, U], type annotation, inference
- 08.1.2-tuple-literal.md — [1, "hello"], mixed types
- 08.1.3-tuple-type-annotation.md — let x: [i32, string], when needed
- 08.1.4-tuple-c-output.md — C-output: struct { i32 _0; String _1; }
- 08.1.5-tuple-on-avr.md — На AVR: fixed size struct

### 08.2 Доступ к элементам
- 08.2.1-tuple-index.md — t[0], t[1], zero-indexed
- 08.2.2-tuple-destructuring.md — const [a, b] = tuple
- 08.2.3-tuple-rest-elements.md — const [a, ...rest] = tuple
- 08.2.4-tuple-access-c-output.md — C-output: ._0, ._1

### 08.3 Labeled tuples
- 08.3.1-labeled-syntax.md — type Point = [x: i32, y: i32]
- 08.3.2-labeled-why.md — Зачем: self-documenting code
- 08.3.3-labeled-vs-class.md — Labeled tuple vs class: когда что

### 08.4 Readonly, Optional, Rest
- 08.4.1-readonly-tuples.md — readonly [i32, string]
- 08.4.2-optional-elements.md — [i32, string?], optional elements
- 08.4.3-rest-elements.md — [...i32[]], variadic tuples
- 08.4.4-tuple-variations-c-output.md — C-output для вариаций

### 08.5 Ownership кортежей
- 08.5.1-tuple-move.md — Move: tuple целиком
- 08.5.2-tuple-borrow.md — Borrow: Ref<[i32, string]>
- 08.5.3-tuple-element-level.md — Element-level: каждый элемент независимо
- 08.5.4-tuple-ownership-c-output.md — C-output

### 08.6 Tuple vs Array
- 08.6.1-semantic-difference.md — Семантическая разница
- 08.6.2-c-output-difference.md — C-output: struct vs array struct
- 08.6.3-when-tuple-when-array.md — Когда tuple, когда array

### 08.7 Tuple destructuring с type annotation
- 08.7.1-type-annotation-bug.md — Баг: [a, b]: [i32, string] игнорируется
- 08.7.2-workaround.md — Обход: annotate individual variables
- 08.7.3-why-bug.md — Почему: implementation detail

---

## Блок 9: Map и Set (09-map-set)

### 09.1 Map<K,V>
- 09.1.1-map-creation.md — new Map<K,V>(), литерал
- 09.1.2-map-set-get.md — map.set(key, value), map.get(key)
- 09.1.3-map-delete-has.md — map.delete(key), map.has(key)
- 09.1.4-map-size.md — map.size: i32 or usize
- 09.1.5-map-iteration.md — for (const [k, v] of map), map.forEach
- 09.1.6-map-keys-values.md — map.keys(), map.values(), map.entries()
- 09.1.7-map-c-output.md — C-output: tsc_map struct
- 09.1.8-map-on-avr.md — На AVR: статическая хеш-таблица

### 09.2 Map string keys
- 09.2.1-string-keys-retain.md — Retain при set, release при delete
- 09.2.2-use-after-free-bug.md — Баг: use-after-free + leak
- 09.2.3-string-keys-c-output.md — C-output: retain/release calls
- 09.2.4-string-keys-fix.md — Исправление: что нужно сделать

### 09.3 Map на AVR
- 09.3.1-static-hash-map.md — HashMap<K,V,N>: фиксированный размер
- 09.3.2-map-size-limit.md — Ограничение размера N
- 09.3.3-map-avr-c-output.md — C-output: static array + hash

### 09.4 Set<T>
- 09.4.1-set-creation.md — new Set<T>(), литерал
- 09.4.2-set-add-delete-has.md — set.add, set.delete, set.has
- 09.4.3-set-delete-return-type.md — delete return type: bool or T | null
- 09.4.4-set-iteration.md — for (const item of set)
- 09.4.5-set-c-output.md — C-output: tsc_set struct
- 09.4.6-set-on-avr.md — На AVR: статический набор

### 09.5 Set на AVR
- 09.5.1-set-avr-implementation.md — Реализация: static array + linear search
- 09.5.2-set-avr-limitations.md — Ограничения

### 09.6 Object.fromEntries
- 09.6.1-fromEntries-syntax.md — Object.fromEntries<Map>(map)
- 09.6.2-map-to-array-tuples.md — Map ↔ Array of tuples
- 09.6.3-fromEntries-c-output.md — C-output

---

## Блок 10: Классы (10-classes)

### 10.1 Объявление класса
- 10.1.1-class-syntax.md — class Name { fields; methods }
- 10.1.2-class-fields.md — Поля: x: i32, y: string
- 10.1.3-class-zero-init.md — Zero-init: {0} в C
- 10.1.4-class-value-type.md — Value-type: не pointer, struct
- 10.1.5-class-c-output.md — C-output: typedef struct { ... } Name

### 10.2 Конструкторы
- 10.2.1-zero-init-default.md — Zero-init по умолчанию
- 10.2.2-auto-constructor.md — Автоконструктор: NOT YET IMPLEMENTED
- 10.2.3-why-value-type.md — Почему value-type: П1, П3
- 10.2.4-constructor-on-avr.md — На AVR: static allocation

### 10.3 Методы
- 10.3.1-method-syntax.md — method(self): returnType { }
- 10.3.2-method-call.md — obj.method(), C-output
- 10.3.3-this-semantics.md — this семантика: self parameter
- 10.3.4-vtable.md — Vtable: когда генерируется
- 10.3.5-method-overloading.md — Method overloading: mangling

### 10.4 mut методы
- 10.4.1-mut-method-syntax.md — mut method(self): returnType { }
- 10.4.2-mut-vs-const.md — Отличие от const методов C++
- 10.4.3-mut-method-c-output.md — C-output: Name* vs const Name*
- 10.4.4-mut-method-why.md — Почему: borrow checker integration

### 10.5 Visibility
- 10.5.1-public-private.md — public, private
- 10.5.2-visibility-c-output.md — C-output: compile-time only
- 10.5.3-visibility-why.md — Почему: encapsulation

### 10.6 Классы с string-полями
- 10.6.1-string-field-ownership.md — Ownership: retain/release
- 10.6.2-string-field-cleanup.md — Cleanup: _free метод
- 10.6.3-string-field-c-output.md — C-output

### 10.7 Автоматический cleanup
- 10.7.1-free-generation.md — _free генерация
- 10.7.2-raii.md — RAII: auto-drop
- 10.7.3-goto-cleanup.md — goto cleanup pattern
- 10.7.4-cleanup-c-output.md — C-output: Name_free(&obj)

### 10.8 Наследование
- 10.8.1-inheritance-restrictions.md — Ограничения: нет extends
- 10.8.2-composition-over-inheritance.md — Композиция
- 10.8.3-inheritance-vs-ts.md — Отличие от TS

### 10.9 Классы на AVR
- 10.9.1-embedded-inline.md — @embedded.inline
- 10.9.2-embedded-pool.md — @embedded.pool(N)
- 10.9.3-class-stack-avr.md — На стеке: фиксированный размер
- 10.9.4-class-avr-c-output.md — C-output: static struct

### 10.10 Классы в async
- 10.10.1-class-capture-sm.md — Capture в state machine
- 10.10.2-class-ownership-await.md — Ownership через await
- 10.10.3-class-free-timing.md — _free timing

### 10.11 @packed и @align
- 10.11.1-packed-syntax.md — @packed: убрать padding
- 10.11.2-align-syntax.md — @align(N)
- 10.11.3-packed-embedded.md — Embedded: MMIO, протоколы
- 10.11.4-packed-safety.md — Safety: unaligned access
- 10.11.5-padding-diagnostics.md — Diagnostics: NOT YET
- 10.11.6-packed-c-output.md — C-output: __attribute__((packed))

### 10.12 Extension methods
- 10.12.1-extension-syntax.md — extension Type { method() {} }
- 10.12.2-extension-why.md — Зачем
- 10.12.3-extension-c-output.md — C-output: static function

---

## Блок 11: Интерфейсы (11-interfaces)

### 11.1 Объявление интерфейса
- 11.1.1-interface-syntax.md — interface Drawable { draw(self): void }
- 11.1.2-structural-typing.md — Структурная типизация
- 11.1.3-interface-c-output.md — C-output: vtable struct

### 11.2 implements
- 11.2.1-implements-syntax.md — class Circle implements Drawable
- 11.2.2-vtable-generation.md — Vtable генерация
- 11.2.3-implements-c-output.md — C-output: vtable init
- 11.2.4-multiple-interfaces.md — Множественные интерфейсы

### 11.3 Interface dispatch
- 11.3.1-vtable-overhead.md — Overhead: pointer lookup
- 11.3.2-static-dispatch.md — Когда статический
- 11.3.3-devirtualization.md — Девиртуализация
- 11.3.4-dispatch-c-output.md — C-output: vtable call

### 11.4 instanceof
- 11.4.1-instanceof-syntax.md — x instanceof ClassName
- 11.4.2-instanceof-c-output.md — C-output: vtable comparison
- 11.4.3-instanceof-narrowing.md — Type narrowing: NOT YET
- 11.4.4-instanceof-alternatives.md — Альтернативы

### 11.5 Интерфейсы на AVR
- 11.5.1-vtable-overhead-avr.md — Overhead на AVR
- 11.5.2-when-to-avoid.md — Когда избегать
- 11.5.3-alternatives-avr.md — Альтернативы: enums, fn pointers

---

## Блок 12: Enum (12-enum)

### 12.1 Числовой enum
- 12.1.1-enum-syntax.md — enum Direction { North, South, East, West }
- 12.1.2-enum-values.md — Значения: auto, explicit
- 12.1.3-enum-c-output.md — C-output: typedef int + #define

### 12.2 Строковый enum
- 12.2.1-string-enum-syntax.md — enum Color { Red = "red" }
- 12.2.2-string-enum-c-output.md — C-output: string constants
- 12.2.3-string-enum-ownership.md — String ownership

### 12.3 const enum
- 12.3.1-const-enum-syntax.md — const enum Pin { PA0, PA1 }
- 12.3.2-const-enum-inline.md — Inline: значения подставляются
- 12.3.3-const-enum-vs-enum.md — const enum vs regular
- 12.3.4-const-enum-c-output.md — C-output

### 12.4 enum в switch/match
- 12.4.1-enum-switch.md — switch на enum
- 12.4.2-enum-match.md — match на enum: exhaustiveness
- 12.4.3-enum-match-c-output.md — C-output
- 12.4.4-exhaustiveness-check.md — Exhaustiveness check

### 12.5 Утилиты enum
- 12.5.1-enum-methods.md — Методы: values(), name()
- 12.5.2-enum-iteration.md — Итерация по values
- 12.5.3-reverse-mapping.md — Reverse mapping: value → name

---

## Блок 13: Дженерики (13-generics)

### 13.1 Generic функции
- 13.1.1-generic-function-syntax.md — function identity<T>(x: T): T
- 13.1.2-generic-function-call.md — identity<i32>(5), type inference
- 13.1.3-generic-function-c-output.md — C-output: identity_i32, identity_string

### 13.2 Generic классы
- 13.2.1-generic-class-syntax.md — class Container<T> { value: T }
- 13.2.2-generic-class-fields.md — Fields: T, Array<T>
- 13.2.3-generic-class-methods.md — Methods: method(self): T
- 13.2.4-generic-class-c-output.md — C-output: Container_i32, Container_string

### 13.3 Bounds
- 13.3.1-type-bounds.md — T implements Interface
- 13.3.2-structural-bounds.md — Structural bounds
- 13.3.3-bounds-checking.md — Bounds checking: compile-time

### 13.4 Monomorphization
- 13.4.1-how-monomorphization-works.md — Как работает
- 13.4.2-code-bloat.md — Code bloat: N типов = N копий
- 13.4.3-why-not-boxing.md — Почему не boxing: П3
- 13.4.4-consumer-side.md — Consumer-side: PLANNED

### 13.5 Дженерики на AVR
- 13.5.1-limiting-instantiations.md — Ограничение инстанциаций
- 13.5.2-code-size.md — Code size
- 13.5.3-strategies.md — Стратегии

---

## Блок 14: Обработка ошибок (14-errors)

### 14.1 throw
- 14.1.1-throw-syntax.md — throw new Error("message")
- 14.1.2-error-class.md — Error { message: string }
- 14.1.3-custom-error.md — Custom error class
- 14.1.4-throw-c-output.md — C-output: Result struct

### 14.2 throws
- 14.2.1-throws-syntax.md — function f(): i32 throws Error
- 14.2.2-throws-required.md — Обязателен
- 14.2.3-why-not-inferred.md — Почему не inferred
- 14.2.4-throws-c-output.md — C-output: Result_i32

### 14.3 try / catch / finally
- 14.3.1-try-catch-syntax.md — try { } catch (e: Error) { }
- 14.3.2-catch-type-narrowing.md — Type narrowing в catch
- 14.3.3-union-errors.md — Union errors: throws A | B
- 14.3.4-finally.md — finally: cleanup
- 14.3.5-try-catch-c-output.md — C-output: Result check + goto

### 14.4 Оператор ?
- 14.4.1-propagate-syntax.md — ? operator: propagate error
- 14.4.2-propagate-chaining.md — Chaining
- 14.4.3-propagate-vs-rust.md — Сравнение с Rust
- 14.4.4-propagate-c-output.md — C-output: if error goto cleanup

### 14.5 Оператор !
- 14.5.1-unwrap-syntax.md — ! operator: unwrap или panic
- 14.5.2-unwrap-safety.md — Safety
- 14.5.3-unwrap-c-output.md — C-output: tsc_panic

### 14.6 Ownership при ошибках
- 14.6.1-cleanup-on-throw.md — Cleanup при throw
- 14.6.2-goto-cleanup.md — goto cleanup pattern
- 14.6.3-ownership-errors-c-output.md — C-output: _free calls

### 14.7 Error.stack
- 14.7.1-stack-desktop.md — Desktop only
- 14.7.2-stack-user-defined.md — User-defined field
- 14.7.3-stack-avr.md — На AVR: нет stack trace

### 14.8 Ошибки на AVR
- 14.8.1-result-struct.md — Result struct без setjmp
- 14.8.2-stack-limitation.md — Стек: Result на стеке
- 14.8.3-no-exceptions.md — Нет exceptions

### 14.9 Ошибки в async
- 14.9.1-error-propagation-sm.md — Error propagation через SM
- 14.9.2-error-cleanup-async.md — Cleanup: goto _cleanup
- 14.9.3-error-async-c-output.md — C-output

---

## Блок 15: Модель памяти — Ownership (15-ownership)

### 15.1 Типы владения
- 15.1.1-ownership-types-overview.md — T, Ref<T>, Mut<T>, Shared<T>, Weak<T>, Slice<T>
- 15.1.2-why-each-type.md — Зачем каждый
- 15.1.3-ownership-vs-ts.md — Сравнение с TS
- 15.1.4-ownership-vs-c.md — Сравнение с C
- 15.1.5-ownership-vs-rust.md — Сравнение с Rust

### 15.2 Базовые правила
- 15.2.1-primitives-copy.md — Primitives: всегда copy
- 15.2.2-complex-move.md — Complex types: move
- 15.2.3-why-copy-move.md — Почему: П1, П3
- 15.2.4-comparison-with-rust.md — Сравнение с Rust

### 15.3 Owner (T)
- 15.3.1-move-assignment.md — Move при присвоении
- 15.3.2-move-function-call.md — Move при передаче
- 15.3.3-use-after-move.md — Use-after-move: ошибка
- 15.3.4-move-c-output.md — C-output
- 15.3.5-move-on-avr.md — На AVR
- 15.3.6-move-in-async.md — В async

### 15.4 Ref<T>
- 15.4.1-ref-what-and-why.md — Что такое Ref, зачем
- 15.4.2-ref-syntax.md — const r: Ref<T> = value
- 15.4.3-ref-from-variable.md — Ref из переменной
- 15.4.4-ref-from-object-field.md — Ref из поля: запрещено
- 15.4.5-ref-from-array-element.md — Ref из элемента массива
- 15.4.6-ref-as-function-param.md — Ref как параметр
- 15.4.7-ref-as-return-value.md — Ref как return: scope constraint
- 15.4.8-ref-in-class-fields.md — Ref в полях: запрещено
- 15.4.9-ref-across-await.md — Ref через await: запрещено
- 15.4.10-ref-lifetime.md — Время жизни
- 15.4.11-multiple-ref.md — Несколько Ref: разрешено
- 15.4.12-ref-with-mut.md — Ref + Mut: запрещено
- 15.4.13-ref-c-output.md — C-output: const pointer
- 15.4.14-ref-on-desktop.md — На desktop
- 15.4.15-ref-on-avr.md — На AVR
- 15.4.16-ref-in-async.md — В async
- 15.4.17-ref-good-examples.md — Примеры хорошего кода
- 15.4.18-ref-bad-examples.md — Примеры плохого кода
- 15.4.19-ref-compiler-errors.md — Ошибки компилятора
- 15.4.20-ref-alternatives.md — Альтернативы

### 15.5 Mut<T>
- 15.5.1-mut-what-and-why.md — Что такое Mut, зачем
- 15.5.2-mut-syntax.md — const m: Mut<T> = value
- 15.5.3-mut-exclusivity.md — Эксклюзивность
- 15.5.4-mut-quarantine.md — Quarantine
- 15.5.5-mut-as-function-param.md — Mut как параметр
- 15.5.6-mut-as-return-value.md — Mut как return
- 15.5.7-mut-tracking.md — Borrow tracking
- 15.5.8-mut-c-output.md — C-output: pointer
- 15.5.9-mut-on-avr.md — На AVR
- 15.5.10-mut-in-async.md — В async
- 15.5.11-mut-good-examples.md — Примеры хорошего кода
- 15.5.12-mut-bad-examples.md — Примеры плохого кода
- 15.5.13-mut-compiler-errors.md — Ошибки компилятора
- 15.5.14-mut-alternatives.md — Альтернативы

### 15.6 Shared<T>
- 15.6.1-shared-what-and-why.md — Shared: ARC
- 15.6.2-shared-syntax.md — const s: Shared<T> = value
- 15.6.3-shared-retain-release.md — Retain/release
- 15.6.4-shared-c-output.md — C-output: refcount
- 15.6.5-shared-on-avr.md — На AVR
- 15.6.6-shared-in-async.md — В async

### 15.7 Weak<T>
- 15.7.1-weak-what-and-why.md — Weak: weak reference
- 15.7.2-weak-syntax.md — const w: Weak<T> = shared
- 15.7.3-weak-upgrade.md — Upgrade: Weak → Shared
- 15.7.4-weak-break-cycles.md — Разрыв циклов
- 15.7.5-weak-c-output.md — C-output
- 15.7.6-weak-on-avr.md — На AVR

### 15.8 Borrow checker
- 15.8.1-borrow-rules-overview.md — Правила: обзор
- 15.8.2-borrow-tracking.md — Tracking
- 15.8.3-borrow-conflicts.md — Конфликты
- 15.8.4-borrow-errors.md — Ошибки
- 15.8.5-borrow-vs-rust.md — Сравнение с Rust
- 15.8.6-borrow-why-simpler.md — Почему проще

### 15.9 Scope constraint
- 15.9.1-scope-constraint-what.md — Что: lifetime без аннотаций
- 15.9.2-conservative-union.md — Conservative union
- 15.9.3-why-conservative.md — Почему консервативно
- 15.9.4-scope-constraint-examples.md — Примеры

### 15.10 Автоматический Drop
- 15.10.1-raii.md — RAII: auto-drop
- 15.10.2-drop-when.md — Когда вызывается
- 15.10.3-drop-order.md — Порядок
- 15.10.4-drop-c-output.md — C-output: _free calls

### 15.11 Cleanup и throw
- 15.11.1-goto-cleanup.md — goto cleanup pattern
- 15.11.2-resources-on-error.md — Ресурсы при ошибке
- 15.11.3-cleanup-c-output.md — C-output

### 15.12 Interior Mutability
- 15.12.1-why-no-cell-refcell.md — Почему нет Cell/RefCell
- 15.12.2-alternatives.md — Альтернативы
- 15.12.3-comparison-with-rust.md — Сравнение с Rust

---

## Блок 16: Ownership по типам (16-ownership-types)

### 16.1 Примитивы
- 16.1.1-primitive-copy.md — Copy semantics
- 16.1.2-primitive-ref-mut.md — Ref/Mut для примитивов
- 16.1.3-primitive-shared-weak.md — Shared/Weak: ошибка
- 16.1.4-primitive-cleanup.md — Cleanup: нет
- 16.1.5-primitive-desktop-avr.md — Desktop vs AVR
- 16.1.6-primitive-why.md — Почему

### 16.2 String
- 16.2.1-string-arc-copy.md — ARC copy
- 16.2.2-string-heap-vs-literal.md — Heap vs literal
- 16.2.3-string-ref-mut.md — Ref/Mut<string>
- 16.2.4-string-concat-ownership.md — Конкатенация ownership
- 16.2.5-string-function-params.md — Параметры функций
- 16.2.6-string-cleanup.md — Cleanup
- 16.2.7-string-progmem.md — На AVR: PROGMEM
- 16.2.8-string-async-retain.md — В async: retain-on-capture
- 16.2.9-string-why.md — Почему

### 16.3 Классы
- 16.3.1-class-move.md — Move
- 16.3.2-class-borrow.md — Borrow
- 16.3.3-class-shared-weak.md — Shared/Weak
- 16.3.4-class-after-move.md — После move
- 16.3.5-class-string-fields.md — String-поля
- 16.3.6-class-spread.md — Spread
- 16.3.7-class-destructuring.md — Деструктуризация
- 16.3.8-class-desktop-avr.md — Desktop vs AVR
- 16.3.9-class-why.md — Почему

### 16.4 Массивы
- 16.4.1-array-move.md — Move
- 16.4.2-array-borrow.md — Borrow, Slice
- 16.4.3-array-element-access.md — Element access
- 16.4.4-array-string-elements.md — String элементы
- 16.4.5-array-spread.md — Spread
- 16.4.6-array-destructuring.md — Деструктуризация
- 16.4.7-array-capacity.md — Capacity: owning vs non-owning
- 16.4.8-array-desktop-avr.md — Desktop vs AVR
- 16.4.9-array-why.md — Почему

### 16.5 Кортежи
- 16.5.1-tuple-move.md — Move
- 16.5.2-tuple-borrow.md — Borrow: element-level
- 16.5.3-tuple-readonly-optional.md — Readonly, Optional
- 16.5.4-tuple-spread.md — Spread
- 16.5.5-tuple-desktop-avr.md — Desktop vs AVR
- 16.5.6-tuple-why.md — Почему

### 16.6 Замыкания
- 16.6.1-closure-capture-rules.md — Capture rules
- 16.6.2-closure-explicit-capture.md — Явный захват
- 16.6.3-closure-trampoline.md — Trampoline adapter
- 16.6.4-closure-mut-capture.md — Mut-capture
- 16.6.5-closure-mut-await.md — Mut-closure через await: запрещено
- 16.6.6-closure-why.md — Почему copy-by-value

---

## Блок 17: Замыкания (17-closures)

### 17.1 Объявление замыкания
- 17.1.1-closure-syntax.md — let f = (x) => x + 1
- 17.1.2-closure-type-inference.md — Type inference
- 17.1.3-closure-vs-function.md — Closure vs function
- 17.1.4-closure-c-output.md — C-output: env struct

### 17.2 Захват переменных
- 17.2.1-capture-default.md — Copy-by-value default
- 17.2.2-capture-why-not-ref.md — Почему не Ref
- 17.2.3-capture-primitives.md — Primitives: copy
- 17.2.4-capture-strings.md — Strings: ARC copy
- 17.2.5-capture-classes.md — Classes: move
- 17.2.6-capture-comparison.md — Сравнение с TS, C++, Rust

### 17.3 Явный список захвата
- 17.3.1-capture-list-syntax.md — Синтаксис
- 17.3.2-capture-list-when.md — Когда нужен
- 17.3.3-capture-list-c-output.md — C-output

### 17.4 Замыкания как аргументы
- 17.4.1-callback-pattern.md — Callback pattern
- 17.4.2-function-types.md — Function types
- 17.4.3-type-loss-bug.md — Type loss (баг?)
- 17.4.4-closure-as-argument-c-output.md — C-output

### 17.5 Вложенные замыкания
- 17.5.1-nested-capture.md — Вложенный capture
- 17.5.2-dangling-pointer-bug.md — Dangling pointer (баг?)
- 17.5.3-nested-closure-workaround.md — Обход

### 17.6 Рекурсивные замыкания
- 17.6.1-recursive-syntax.md — Рекурсивное замыкание
- 17.6.2-undeclared-bug.md — Undeclared variable (баг?)
- 17.6.3-recursive-workaround.md — Обход

### 17.7 Замыкания на AVR
- 17.7.1-no-heap-closures.md — No heap: стек
- 17.7.2-trampoline-adapter.md — Trampoline adapter
- 17.7.3-closures-avr-limitations.md — Ограничения

### 17.8 Замыкания в async
- 17.8.1-env-lost-bug.md — Env lost (баг?)
- 17.8.2-capture-through-await.md — Capture через await
- 17.8.3-mut-closure-await-forbidden.md — Mut-closure через await запрещено

---

## Блок 18: Модули (18-modules)

### 18.1 Файл = модуль
- 18.1.1-file-is-module.md — Конвенции
- 18.1.2-index-tsc.md — index.tsc
- 18.1.3-std-prefix.md — std/ prefix, @tsc/ scope

### 18.2 Export
- 18.2.1-named-exports.md — export function, export class
- 18.2.2-no-default-export.md — export default запрещён
- 18.2.3-re-exports.md — export { X } from "./module"

### 18.3 Import
- 18.3.1-named-imports.md — import { X } from "./module"
- 18.3.2-namespace-imports.md — import * as M from "./module"
- 18.3.3-import-type.md — import type { X }

### 18.4 @platform
- 18.4.1-platform-syntax.md — @platform("avr")
- 18.4.2-platform-rules.md — Правила условной компиляции
- 18.4.3-platform-examples.md — Примеры
- 18.4.4-platform-multiple.md — Несколько платформ

### 18.5 Inline C
- 18.5.1-native-syntax.md — native { } блоки
- 18.5.2-native-callbacks.md — Callbacks в native
- 18.5.3-native-closures.md — Closures в native

### 18.6 unsafe {}
- 18.6.1-unsafe-syntax.md — unsafe { } синтаксис
- 18.6.2-unsafe-when.md — Когда нужен
- 18.6.3-unsafe-dangers.md — Опасности

### 18.7 .d.tsc файлы
- 18.7.1-d-tsc-syntax.md — Синтаксис declare
- 18.7.2-c-interop.md — C interop bindings
- 18.7.3-d-tsc-examples.md — Примеры

### 18.8 Declaration merging
- 18.8.1-merging-syntax.md — Расширение типов
- 18.8.2-merging-examples.md — Примеры

### 18.9 Path aliases
- 18.9.1-alias-config.md — Конфигурация в tsc.package.json
- 18.9.2-alias-wildcard.md — Wildcard *
- 18.9.3-alias-monorepo.md — Монорепозиторий

### 18.10 Module-level переменные
- 18.10.1-top-level-let-const.md — Top-level let/const
- 18.10.2-module-init-order.md — Init order: NOT YET
- 18.10.3-module-init-c-output.md — C-output

### 18.11 Scalar type
- 18.11.1-scalar-why.md — Variadic C функции
- 18.11.2-scalar-syntax.md — declare function printf(fmt: string, ...args: Scalar)
- 18.11.3-scalar-examples.md — Примеры

---

## Блок 19: Декораторы (19-decorators)

### 19.1 Философия декораторов
- 19.1.1-why-language-primitive.md — Почему language primitive
- 19.1.2-decorator-vs-ts.md — Отличие от TS decorators

### 19.2 Синтаксис и применение
- 19.2.1-decorator-syntax.md — @decorator синтаксис
- 19.2.2-decorator-places.md — Места применения
- 19.2.3-decorator-order.md — Порядок применения

### 19.3 Определение декоратора
- 19.3.1-decorator-function.md — decorator function
- 19.3.2-before-after.md — before() / after()
- 19.3.3-decorator-capture.md — Захват переменных

### 19.4 MethodDesc
- 19.4.1-method-desc-api.md — Descriptor API для методов
- 19.4.2-method-desc-fields.md — Поля: что реализовано, что нет
- 19.4.3-method-desc-examples.md — Примеры

### 19.5 ClassDesc, PropDesc, ParamDesc
- 19.5.1-class-desc.md — ClassDesc
- 19.5.2-prop-desc.md — PropDesc: NOT YET
- 19.5.3-param-desc.md — ParamDesc: NOT YET

### 19.6 Параметризованные декораторы
- 19.6.1-factory-syntax.md — Фабрики: @log("prefix")
- 19.6.2-factory-examples.md — Примеры

### 19.7 Comptime-метаданные
- 19.7.1-meta-api.md — meta API
- 19.7.2-selfref.md — SelfRef: NOT YET
- 19.7.3-metastore.md — MetaStore: NOT YET

### 19.8 Декораторы на async-методах
- 19.8.1-async-decorator-limitations.md — Ограничения
- 19.8.2-async-decorator-timing.md — Timing
- 19.8.3-async-decorator-c-output.md — C-output

### 19.9 Декораторы и платформа
- 19.9.1-platform-decorators.md — @platform + decorators
- 19.9.2-embedded-decorator-limits.md — Embedded ограничения

### 19.10 C-output декораторов
- 19.10.1-wrapper-chain.md — Wrapper chain
- 19.10.2-naming.md — Именование функций
- 19.10.3-ctx-self-field.md — ctx.self.field<T>(name)

---

## Блок 20: Async/Await (20-async)

### 20.1 Модель async
- 20.1.1-async-levels.md — Уровни модели
- 20.1.2-runtime-abstraction.md — Runtime: libuv, io_uring, poll
- 20.1.3-async-why.md — Почему так

### 20.2 async function
- 20.2.1-async-function-syntax.md — async function f(): Promise<T>
- 20.2.2-state-machine.md — State machine: C-output
- 20.2.3-sm-size.md — Размер SM: alignment, stack safety
- 20.2.4-async-function-c-output.md — C-output

### 20.3 await
- 20.3.1-await-syntax.md — await expression
- 20.3.2-await-rules.md — Правила
- 20.3.3-borrows-across-await.md — Borrows через await: запрещено
- 20.3.4-why-no-borrow-await.md — Почему: П1 (embedded)

### 20.4 Promise<T>
- 20.4.1-promise-creation.md — Создание Promise
- 20.4.2-promise-then-catch-finally.md — .then/.catch/.finally
- 20.4.3-promise-c-output.md — C-output

### 20.5 Promise combinators
- 20.5.1-promise-all.md — Promise.all
- 20.5.2-promise-race.md — Promise.race
- 20.5.3-promise-any.md — Promise.any
- 20.5.4-promise-allSettled.md — Promise.allSettled
- 20.5.5-combinators-c-output.md — C-output

### 20.6 async main
- 20.6.1-async-main-syntax.md — async main
- 20.6.2-async-main-vs-sync.md — Разница с sync main
- 20.6.3-async-main-c-output.md — C-output

### 20.7 State machine details
- 20.7.1-sm-structure.md — Структура SM struct
- 20.7.2-sm-alignment.md — Alignment
- 20.7.3-sm-stack-safety.md — Stack safety
- 20.7.4-sm-embedded.md — Embedded ограничения

### 20.8 Async ownership
- 20.8.1-retain-on-capture-string.md — String retain-on-capture
- 20.8.2-ref-across-await-forbidden.md — Ref<T> через await: запрещено
- 20.8.3-async-cleanup.md — Cleanup: goto _cleanup

### 20.9 AbortSignal
- 20.9.1-abort-syntax.md — AbortSignal
- 20.9.2-abort-pattern.md — Паттерн отмены
- 20.9.3-abort-c-output.md — C-output

### 20.10 AsyncMutex
- 20.10.1-async-mutex-syntax.md — AsyncMutex
- 20.10.2-async-mutex-vs-mutex.md — Отличие от Mutex<T>

### 20.11 Рекурсивные async
- 20.11.1-recursive-async.md — Рекурсивные async функции
- 20.11.2-embedded-stack.md — @embedded.stack(name, N)
- 20.11.3-recursive-async-limitations.md — Ограничения

### 20.12 Async на AVR
- 20.12.1-cooperative-scheduler.md — Cooperative scheduler
- 20.12.2-singleton-sm.md — Singleton SM
- 20.12.3-async-avr-limitations.md — Ограничения

---

## Блок 21: Генераторы (21-generators)

### 21.1 function*
- 21.1.1-generator-syntax.md — function* name() { yield value }
- 21.1.2-generator-next.md — gen.next(), return value
- 21.1.3-generator-c-output.md — C-output: SM struct

### 21.2 for-of по генератору
- 21.2.1-for-of-generator.md — for (const x of generator)
- 21.2.2-generator-lazy.md — Ленивость
- 21.2.3-generator-iteration-c-output.md — C-output

### 21.3 Async generators
- 21.3.1-async-generator-syntax.md — async function* name()
- 21.3.2-for-await.md — for await (const x of asyncGenerator)
- 21.3.3-async-generator-c-output.md — C-output
- 21.3.4-async-generator-vs-sync.md — Async vs sync generator

### 21.4 Generator cleanup
- 21.4.1-generator-return.md — gen.return(value)
- 21.4.2-generator-throw.md — gen.throw(error)
- 21.4.3-generator-cleanup-c-output.md — C-output

### 21.5 @embedded.singleton
- 21.5.1-singleton-syntax.md — @embedded.singleton
- 21.5.2-singleton-sm.md — uint8_t state, single instance
- 21.5.3-singleton-c-output.md — C-output

### 21.6 Генераторы на AVR
- 21.6.1-generator-stack.md — Стек: SM на стеке
- 21.6.2-generator-no-heap.md — No heap
- 21.6.3-generator-alternatives.md — Альтернативы

### 21.7 Кооперативная многозадачность
- 21.7.1-generators-as-coroutines.md — Генераторы как корутины
- 21.7.2-cooperative-pattern.md — Паттерн
- 21.7.3-cooperative-examples.md — Примеры

---

## Блок 22: Threads (22-threads)

### 22.1 Thread.spawn
- 22.1.1-spawn-syntax.md — Thread.spawn(() => { })
- 22.1.2-thread-join.md — join(), типизированный результат
- 22.1.3-thread-c-output.md — C-output

### 22.2 Atomic<T>
- 22.2.1-atomic-syntax.md — Atomic<i32>, load/store
- 22.2.2-atomic-operations.md — add/sub/and/or/xor
- 22.2.3-atomic-c-output.md — C-output: _Atomic

### 22.3 AtomicArray<T>
- 22.3.1-atomic-array-syntax.md — AtomicArray<i32>
- 22.3.2-atomic-array-thread-safe.md — Thread-safe доступ
- 22.3.3-atomic-array-c-output.md — C-output

### 22.4 Channel<T>
- 22.4.1-channel-syntax.md — channel<T>(capacity)
- 22.4.2-channel-send-receive.md — send/receive
- 22.4.3-channel-spsc.md — SPSC: single producer, single consumer
- 22.4.4-channel-bounded.md — Bounded: capacity limit
- 22.4.5-channel-thread-safety-bug.md — Thread safety (баг?)
- 22.4.6-channel-c-output.md — C-output

### 22.5 select
- 22.5.1-select-syntax.md — select { ... }
- 22.5.2-select-sync.md — Синхронный, не async
- 22.5.3-select-order.md — Sequential tryReceive order
- 22.5.4-select-c-output.md — C-output

### 22.6 Readonly<T>
- 22.6.1-readonly-syntax.md — Readonly<T>
- 22.6.2-readonly-zero-overhead.md — Zero-overhead const
- 22.6.3-readonly-c-output.md — C-output

### 22.7 Mutex<T>
- 22.7.1-mutex-syntax.md — Mutex<T>
- 22.7.2-mutex-vs-async-mutex.md — Отличие от AsyncMutex

### 22.8 Thread safety
- 22.8.1-thread-safe-operations.md — Какие операции безопасны
- 22.8.2-data-races.md — Data races: что и почему
- 22.8.3-thread-safety-best-practices.md — Best practices

---

## Блок 23: Embedded (23-embedded)

### 23.1 Введение в embedded
- 23.1.1-why-tsclang-embedded.md — Зачем TSClang на железе
- 23.1.2-supported-platforms.md — Платформы: AVR, ARM, ESP32, retro
- 23.1.3-embedded-limitations.md — Ограничения: no heap, no OS, no stdio

### 23.2 @embedded.inline
- 23.2.1-inline-syntax.md — @embedded.inline на классах
- 23.2.2-inline-how.md — Как работает: стек вместо heap
- 23.2.3-inline-c-output.md — C-output: static struct

### 23.3 @embedded.noHeap
- 23.3.1-noheap-syntax.md — @embedded.noHeap
- 23.3.2-noheap-check.md — Проверка: компилятор ошибается при heap usage
- 23.3.3-noheap-c-output.md — C-output

### 23.4 @embedded.pool(N)
- 23.4.1-pool-syntax.md — @embedded.pool(N) на классах
- 23.4.2-pool-how.md — Как работает: fixed-size pool allocator
- 23.4.3-pool-c-output.md — C-output

### 23.5 @embedded.isr
- 23.5.1-isr-syntax.md — @embedded.isr(VECTOR)
- 23.5.2-isr-rules.md — Правила: no heap, no async, no channels
- 23.5.3-isr-limitations.md — Ограничения
- 23.5.4-isr-c-output.md — C-output: ISR vector

### 23.6 Volatile<T>
- 23.6.1-volatile-syntax.md — Volatile<T> для MMIO
- 23.6.2-volatile-semantics.md — Pointer semantics: каждый доступ = memory access
- 23.6.3-volatile-c-output.md — C-output: volatile T*

### 23.7 EmbeddedSignal
- 23.7.1-signal-bridge.md — Мост ISR → async
- 23.7.2-signal-bit-packing.md — Автоматическая битовая упаковка
- 23.7.3-signal-c-output.md — C-output

### 23.8 std/sync
- 23.8.1-critical-sections.md — Критические секции на embedded
- 23.8.2-sync-api.md — API: lock/unlock
- 23.8.3-sync-c-output.md — C-output: cli/sei

### 23.9 std/embedded
- 23.9.1-hashmap.md — HashMap<K,V,N>
- 23.9.2-tasks.md — Tasks<N>
- 23.9.3-pointer.md — pointer<T>
- 23.9.4-mmio-registers.md — MMIO регистры через declare const

### 23.10 Allocator стратегии
- 23.10.1-allocator-none.md — none: полный no-heap
- 23.10.2-allocator-static.md — static: фиксированный блок
- 23.10.3-allocator-pool.md — pool: пул объектов
- 23.10.4-when-to-use-which.md — Когда какую

### 23.11 Scheduler
- 23.11.1-cooperative-scheduler.md — Cooperative scheduler
- 23.11.2-priorities.md — Приоритеты задач
- 23.11.3-scheduler-vs-desktop.md — Embedded vs desktop runtime

### 23.12 Heap-free платформы
- 23.12.1-classes-no-heap.md — Классы: @embedded.inline
- 23.12.2-arrays-no-heap.md — Массивы: стек, BSS
- 23.12.3-map-set-no-heap.md — Map/Set: static hashmap
- 23.12.4-async-no-heap.md — Async: singleton SM
- 23.12.5-generators-no-heap.md — Генераторы: stack SM

---

## Блок 24: Stdlib — основы (24-stdlib-basics)

### 24.1 console
- 24.1.1-console-log.md — console.log(), несколько аргументов
- 24.1.2-console-error-warn.md — console.error(), console.warn()
- 24.1.3-console-time.md — console.time(), console.timeEnd()
- 24.1.4-console-formatting.md — Форматирование: числа, строки, objects
- 24.1.5-console-avr.md — На AVR: USART
- 24.1.6-console-c-output.md — C-output: printf, tsc_console_log

### 24.2 Math
- 24.2.1-math-constants.md — PI, E, MAX_SAFE_INTEGER и т.д.
- 24.2.2-math-methods.md — abs, min, max, floor, ceil, round, sqrt, pow
- 24.2.3-math-random.md — Math.random(): linker error (баг?)
- 24.2.4-math-c-output.md — C-output: macro или function
- 24.2.5-math-avr.md — На AVR: software implementation

### 24.3 parseInt / parseFloat
- 24.3.1-parseInt.md — parseInt(string, radix)
- 24.3.2-parseFloat.md — parseFloat(string)
- 24.3.3-number-parse.md — i32.parse, i64.parse, f64.parse
- 24.3.4-parse-c-output.md — C-output: strtol, strtod
- 24.3.5-parse-avr.md — На AVR: ограничения

### 24.4 process
- 24.4.1-process-argv.md — process.argv: аргументы CLI
- 24.4.2-process-env.md — process.env: Map vs specialized API
- 24.4.3-process-exit.md — process.exit(code)
- 24.4.4-process-stdin-stdout.md — process.stdin, stdout, stderr
- 24.4.5-process-platforms.md — На разных платформах

### 24.5 JSON
- 24.5.1-json-parse.md — JSON.parse(string): unknown
- 24.5.2-json-stringify.md — JSON.stringify(value): string
- 24.5.3-json-types.md — Типы: какие поддерживаются
- 24.5.4-json-c-output.md — C-output: runtime parser
- 24.5.5-json-avr.md — На AVR: ограничения

### 24.6 Date
- 24.6.1-date-creation.md — new Date(), Date.now()
- 24.6.2-date-methods.md — getFullYear, getMonth, getDate и т.д.
- 24.6.3-date-formatting.md — toISOString, toDateString
- 24.6.4-date-desktop-only.md — Desktop only: почему
- 24.6.5-date-c-output.md — C-output

### 24.7 std/temporal
- 24.7.1-temporal-overview.md — Обзор: PlainDate, PlainTime, PlainDateTime
- 24.7.2-plain-date.md — PlainDate
- 24.7.3-plain-time.md — PlainTime
- 24.7.4-plain-datetime.md — PlainDateTime
- 24.7.5-instant.md — Instant
- 24.7.6-duration.md — Duration
- 24.7.7-zoned-datetime.md — ZonedDateTime: desktop only
- 24.7.8-temporal-now.md — Now: current date/time

---

## Блок 25: Stdlib — продвинутый (25-stdlib-advanced)

### 25.1 Buffer
- 25.1.1-buffer-creation.md — new Buffer(size), from array
- 25.1.2-buffer-read-write.md — readUInt8, writeUInt8 и т.д.
- 25.1.3-buffer-methods.md — Методы: статус реализации
- 25.1.4-buffer-c-output.md — C-output
- 25.1.5-buffer-avr.md — На AVR

### 25.2 DataView
- 25.2.1-dataview-creation.md — new DataView(buffer)
- 25.2.2-dataview-typed-access.md — getUint8, setInt32 и т.д.
- 25.2.3-dataview-endianness.md — Endianness: big/little endian
- 25.2.4-dataview-c-output.md — C-output

### 25.3 std/string
- 25.3.1-unicode-methods.md — graphemes(), normalize()
- 25.3.2-string-encoding.md — encode/decode: UTF-8, ASCII
- 25.3.3-string-format.md — Форматирование

### 25.4 std/regex
- 25.4.1-regex-syntax.md — Синтаксис регулярных выражений
- 25.4.2-regex-methods.md — match, test, replace
- 25.4.3-regex-limitations.md — Ограничения
- 25.4.4-regex-c-output.md — C-output

### 25.5 std/url
- 25.5.1-url-parsing.md — URL parsing
- 25.5.2-url-conversion.md — Конвертация

### 25.6 std/random
- 25.6.1-random.md — Math.random() на всех платформах
- 25.6.2-secure-random.md — SecureRandom: desktop/server
- 25.6.3-hardware-random.md — HardwareRandom: embedded

### 25.7 std/blob
- 25.7.1-blob-syntax.md — Blob API
- 25.7.2-blob-c-output.md — C-output

### 25.8 std/formdata
- 25.8.1-formdata-syntax.md — FormData API
- 25.8.2-formdata-c-output.md — C-output

### 25.9 std/libc
- 25.9.1-libc-memory.md — Memory: malloc, free, memcpy
- 25.9.2-libc-strings.md — Strings: strlen, strcmp
- 25.9.3-libc-io.md — I/O: printf, scanf
- 25.9.4-libc-variadic.md — Variadic: Scalar type
- 25.9.5-libc-platform-subset.md — Platform-specific subset

---

## Блок 26: Stdlib — IO и сеть (26-stdlib-io-net)

### 26.1 std/io
- 26.1.1-reader-writer.md — Reader/Writer типы
- 26.1.2-pipe.md — pipe(), readAll(), writeAll()
- 26.1.3-readline.md — readLine()
- 26.1.4-io-desktop-only.md — Desktop only
- 26.1.5-io-c-output.md — C-output

### 26.2 std/fs
- 26.2.1-read-write-file.md — readFile, writeFile
- 26.2.2-append-stat.md — appendFile, stat
- 26.2.3-readdir.md — readdir
- 26.2.4-sync-async.md — Sync vs async версии
- 26.2.5-fs-method-names.md — Имена методов: deleteFile vs remove
- 26.2.6-fs-c-output.md — C-output

### 26.3 std/net
- 26.3.1-fetch.md — fetch(): HTTP client
- 26.3.2-http-server.md — HTTP server
- 26.3.3-tcp-sockets.md — TCP сокеты
- 26.3.4-udp-sockets.md — UDP сокеты
- 26.3.5-net-c-output.md — C-output: libuv

### 26.4 std/ws
- 26.4.1-websocket-client.md — WebSocket client
- 26.4.2-websocket-server.md — WebSocket server
- 26.4.3-frame-format.md — RFC 6455 frame format
- 26.4.4-ws-c-output.md — C-output

---

## Блок 27: Stdlib — AVR (27-stdlib-avr)

### 27.1 std/avr
- 27.1.1-gpio.md — GPIO: pinMode, digitalWrite, digitalRead
- 27.1.2-timing.md — delay, millis
- 27.1.3-serial-uart.md — Serial/UART
- 27.1.4-adc-pwm.md — ADC.read, PWM.setDuty
- 27.1.5-interrupts.md — Interrupts
- 27.1.6-avr-examples.md — Примеры

### 27.2 std/hal
- 27.2.1-hal-overview.md — HAL: Hardware Abstraction Layer
- 27.2.2-gpio-hal.md — GPIO: mode, read, write
- 27.2.3-i2c.md — I2C: begin, read, write
- 27.2.4-spi.md — SPI: begin, transfer
- 27.2.5-uart-hal.md — UART
- 27.2.6-platform-profile.md — Platform profile mapping
- 27.2.7-hal-examples.md — Примеры

---

## Блок 28: Stdlib — Reactive (28-stdlib-reactive)

### 28.1 Signal<T>
- 28.1.1-signal-syntax.md — Signal<T>: создание, чтение, запись
- 28.1.2-signal-c-output.md — C-output
- 28.1.3-signal-examples.md — Примеры

### 28.2 effect
- 28.2.1-effect-syntax.md — effect(() => { })
- 28.2.2-effect-auto-tracking.md — Auto-tracking: какие зависимости
- 28.2.3-effect-async-forbidden.md — Async внутри effect: запрещено
- 28.2.4-effect-c-output.md — C-output

### 28.3 computed
- 28.3.1-computed-syntax.md — computed(() => expr)
- 28.3.2-computed-caching.md — Кеширование
- 28.3.3-computed-c-output.md — C-output

---

## Блок 29: Система сборки (29-build)

### 29.1 tsc.package.json
- 29.1.1-package-json-fields.md — Поля: name, version, type, main
- 29.1.2-package-json-schema.md — Полная schema
- 29.1.3-package-json-examples.md — Примеры

### 29.2 Executable
- 29.2.1-executable-structure.md — Структура: src/main.tsc
- 29.2.2-executable-build.md — Сборка: tsclang build

### 29.3 Library
- 29.3.1-library-structure.md — Структура: src/index.tsc
- 29.3.2-library-publish.md — Публикация

### 29.4 C-wrapper
- 29.4.1-c-wrapper-structure.md — Структура: index.d.tsc
- 29.4.2-c-wrapper-link.md — Link конфигурация: system/bundled/fetch/build
- 29.4.3-c-wrapper-publish.md — Публикация
- 29.4.4-c-wrapper-examples.md — Примеры

### 29.5 Platform profile
- 29.5.1-profile-structure.md — Структура профиля
- 29.5.2-profile-sources.md — Источники: built-in, community, local
- 29.5.3-profile-connect.md — Подключение к проекту
- 29.5.4-profile-declare.md — declare platform: allocator, scheduler

### 29.6 Build profiles
- 29.6.1-debug-release.md — Debug, release, custom
- 29.6.2-optimization.md — Оптимизация: O0, O1, O2, Os
- 29.6.3-compiler-flags.md — Флаги C-компилятора

### 29.7 CLI команды
- 29.7.1-cli-build.md — tsclang build
- 29.7.2-cli-run.md — tsclang run
- 29.7.3-cli-init.md — tsclang init
- 29.7.4-cli-install.md — tsclang install, update
- 29.7.5-cli-lint.md — tsclang lint

### 29.8 Зависимости
- 29.8.1-semver.md — Semver: версионирование
- 29.8.2-flat-tree.md — Flat dependency tree
- 29.8.3-lock-file.md — Lock file
- 29.8.4-registry.md — Реестр пакетов

### 29.9 Таблица платформ
- 29.9.1-desktop-mobile.md — Desktop, mobile
- 29.9.2-web-runtime.md — Web, WASM
- 29.9.3-embedded-iot.md — Embedded, IoT
- 29.9.4-retro-consoles.md — Retro, consoles

---

## Блок 30: Type Aliases и Utility Types (30-type-aliases)

### 30.1 Type Aliases
- 30.1.1-type-alias-syntax.md — type X = ...
- 30.1.2-type-alias-when.md — Когда использовать

### 30.2 String Literal Union
- 30.2.1-string-literal-union.md — "a" | "b"
- 30.2.2-pattern-matching.md — Pattern matching с string literals
- 30.2.3-string-literal-c-output.md — C-output

### 30.3 keyof
- 30.3.1-keyof-syntax.md — keyof Type
- 30.3.2-keyof-examples.md — Примеры

### 30.4 Partial, Required, Readonly
- 30.4.1-partial.md — Partial<T>
- 30.4.2-required.md — Required<T>
- 30.4.3-readonly-type.md — Readonly<T>
- 30.4.4-utility-c-output.md — C-output

### 30.5 NonNullable, Pick, Omit
- 30.5.1-nonnullable.md — NonNullable<T>
- 30.5.2-pick.md — Pick<T, K>
- 30.5.3-omit.md — Omit<T, K>

### 30.6 Record, ReturnType, Parameters
- 30.6.1-record.md — Record<K, V>
- 30.6.2-return-type.md — ReturnType<T>
- 30.6.3-parameters.md — Parameters<T>

### 30.7 Awaited
- 30.7.1-awaited.md — Awaited<T>: unwrap Promise

### 30.8 Generic functions — правило А+Б
- 30.8.1-rule-ab.md — Правило А+Б для generic inference
- 30.8.2-rule-ab-examples.md — Примеры

---

## Блок 31: Миграция с TypeScript (31-migration)

### 31.1 Что работает как есть
- 31.1.1-interfaces.md — Interfaces
- 31.1.2-functions.md — Functions
- 31.1.3-classes.md — Classes
- 31.1.4-arrow-functions.md — Arrow functions
- 31.1.5-works-as-is-examples.md — Примеры

### 31.2 Автоматические правки
- 31.2.1-codemod.md — tsclang migrate: roadmap
- 31.2.2-auto-fixes.md — Механические трансформации

### 31.3 Ручные правки
- 31.3.1-number-to-int.md — number → конкретные типы
- 31.3.2-null-undefined.md — null vs undefined
- 31.3.3-equality.md — == vs ===
- 31.3.4-string-indexing.md — s[i] возвращает u8
- 31.3.5-for-of-let.md — for-of let semantics
- 31.3.6-class-inheritance.md — Наследование → композиция

### 31.4 Несовместимые паттерны
- 31.4.1-closures.md — Closures ограничения
- 31.4.2-no-eval.md — No eval, no dynamic
- 31.4.3-no-runtime-type.md — No runtime type information
- 31.4.4-other-incompatibilities.md — Другие

### 31.5 Что добавляет TSClang
- 31.5.1-ownership.md — Ownership, mut, Ref<T>
- 31.5.2-inline-c.md — Inline C, native
- 31.5.3-embedded.md — Embedded target
- 31.5.4-new-features.md — Новые возможности

---

## Блок 32: Архитектура компилятора (32-compiler)

### 32.1 Фазы компиляции
- 32.1.1-phases-overview.md — Полный обзор: lexer → codegen
- 32.1.2-lexer-phase.md — Lexer: токенизация
- 32.1.3-parser-phase.md — Parser: AST construction
- 32.1.4-decorator-pass.md — Decorator pass: pre-typecheck
- 32.1.5-typecheck-phase.md — Typecheck: type validation
- 32.1.6-codegen-phase.md — Codegen: C generation

### 32.2 Decorator pass
- 32.2.1-decorator-pass-detail.md — Pre-typecheck AST transformation
- 32.2.2-decorator-pass-order.md — Порядок выполнения

### 32.3 IR (PLANNED)
- 32.3.1-ir-why.md — Зачем IR: SSA basic blocks
- 32.3.2-ir-alternatives.md — Альтернативы: direct codegen, LLVM IR
- 32.3.3-ir-trade-offs.md — Trade-offs: complexity vs optimization

### 32.4 Name mangling
- 32.4.1-mangling-full-scheme.md — Полная схема
- 32.4.2-mangling-encoding.md — Кодирование всех типов
- 32.4.3-mangling-examples.md — Примеры

### 32.5 Debug info
- 32.5.1-line-directives.md — #line директивы
- 32.5.2-source-maps.md — Source maps
- 32.5.3-gdb.md — GDB: что видит разработчик
- 32.5.4-openocd.md — OpenOCD/SWD для embedded
- 32.5.5-debug-limitations.md — Ограничения

### 32.6 Optimization levels
- 32.6.1-optimizer-what.md — Что делает tsclang
- 32.6.2-c-compiler-what.md — Что делает C compiler
- 32.6.3-optimization-trade-offs.md — Trade-offs

### 32.7 Error messages
- 32.7.1-error-format.md — Формат: file:line:col: message
- 32.7.2-error-categories.md — Категории: borrow, ownership, types, embedded
- 32.7.3-hint-rules.md — Hint rules: предложения по исправлению

### 32.8 Incremental compilation
- 32.8.1-incremental-roadmap.md — Roadmap
- 32.8.2-incremental-challenges.md — Challenges

### 32.9 Consumer-side monomorphization
- 32.9.1-consumer-why.md — Зачем: library code size
- 32.9.2-consumer-how.md — Как: PLANNED
- 32.9.3-consumer-alternatives.md — Альтернативы: boxing, fat pointers
