# TSClang — Открытые проблемы дизайна

Источники: анализ экспертных логов (log/*.log.md) против актуальной спеки.

Статусы: **открыто** / **решено** / **частично** / **отклонено**

---

## P0 — Критичные (блокируют реализацию)

### P0-1: Array functional methods — ownership-семантика не определена

**Статус:** решено
**Файл:** spec/03-types.md (раздел «Функциональные и поисковые методы»)
**Решение:** Добавлен раздел с полными сигнатурами и ownership-семантикой: `map`, `filter`, `reduce`, `find`, `findIndex`, `some`, `every`, `includes`, `indexOf`, `slice`, `concat`. Callback получает `Ref<T>`. `filter`/`slice`/`concat` требуют `T: Clone`. `find` возвращает `Ref<T>` (borrow). Методы встроенные (не extension).

---

### P0-2: JSON — не определён

**Статус:** решено
**Файл:** spec/10-stdlib.md (раздел «std/json»)
**Решение:** Добавлен раздел `std/json` с `JSON.parse<T>(): T throws ParseError` и `JSON.stringify(val, indent?)`. Входит в stdlib (не реестр). На embedded — compile error при flash < 16KB.

---

### P0-3: utf8proc 300KB на AVR — противоречие

**Статус:** решено
**Файл:** spec/03-types.md, spec/10-stdlib.md
**Решение:** Исправлены оба места: «работает на embedded» → явный запрет. Платформы с `flash < 300KB` получают compile error при импорте `graphemes`, `graphemeAt`, `sliceChars`. Методы без utf8proc (`chars`, `codePointAt`, `indexOf`, байтовый `slice`) доступны везде.

---

## P1 — Важные (нужно закрыть до реализации компонента)

### P1-1: `as` overflow — поведение не определено

**Статус:** решено
**Файл:** spec/03-types.md
**Решение:** Зафиксирована **wrap-truncation**: bit-truncation по размеру целевого типа, two's complement для signed. `1000 as i8` → `-24`, `300 as u8` → `44`. Эквивалент C-cast на gcc/clang/avr-gcc — предсказуемо на всех таргетах TSClang.

---

### P1-2: `Ref<T>` / `Mut<T>` не могут пережить `await` — правило отсутствует

**Статус:** решено
**Файл:** spec/05-memory.md (Правило 4), spec/07-concurrency.md (раздел «Borrows через await»)
**Решение:** Добавлено явное правило в оба файла с примерами запрещённого и правильного кода. Owned значения через await — можно (в struct), borrows — нельзя.

---

### P1-3: Extension methods — конфликт из двух модулей

**Статус:** решено
**Файл:** spec/04-classes.md
**Решение:** Одновременный импорт двух extensions с одинаковым именем для одного типа — ошибка компилятора с подсказкой. Разрешение через `as` при импорте: `import { format as fmtA } from "./module-a"`.

---


### P1-5: `Promise.race` / `Promise.any` — cleanup проигравших не описан

**Статус:** решено
**Файл:** spec/07-concurrency.md:450-478
**Решение:** При обнаружении `signal.aborted` state machine переходит в `STATE_CLEANUP` (не немедленный выход) и проходит все cleanup-состояния. Owned ресурсы освобождаются через unwind — точно так же, как при обычной ошибке. Показано на примере с `FileHandle_free`. Механизм описан явно.

---

### P1-6: `std/reactive` + `async` — не определено

**Статус:** решено
**Файл:** spec/10-stdlib.md (раздел «async внутри effect — запрещено»)
**Решение:** `await` внутри `effect` callback — ошибка компилятора. Добавлен паттерн async-reactive: запускать async-функцию из синхронного `effect`, управлять отменой через AbortController.

---

### P1-7: `Shared<T>` на embedded — нет явной ошибки компилятора

**Статус:** решено
**Файл:** spec/05-memory.md:248, spec/09-build.md:1137
**Решение:** spec/05-memory.md:248 — «На embedded `Shared<T>` нет вообще — нет heap, нет ARC». spec/09-build.md:1137 — platform profile с `heap: false` явно указывает: `Shared<T>`, `Map<K,V>`, `new` на heap → ошибка компилятора. Оба места есть.

---

### P1-8: Async + mutex = deadlock — нет AsyncMutex

**Статус:** решено
**Файл:** spec/07-concurrency.md (раздел «AsyncMutex»)
**Решение:** Добавлен `AsyncMutex` в `std/async` — неблокирующий, FIFO-очередь. API: `await mutex.lock()` / `mutex.unlock()` / `mutex.runExclusive(fn)`. `Mutex` в async-контексте — предупреждение компилятора.

---

### P1-9: Overload resolution с generics — приоритет не определён

**Статус:** решено
**Файл:** spec/02-syntax.md (раздел «Приоритет overload resolution»)
**Решение:** Зафиксированы три уровня приоритета: 1) exact match (non-generic), 2) generic с выведенным типом, 3) implicit widening. Явный `foo<T>()` всегда выбирает generic. Ambiguous overload — ошибка компилятора.

---

### P1-10: `Math.random()` / `Random()` на embedded — поведение не определено

**Статус:** решено
**Файл:** spec/10-stdlib.md:748-749
**Решение:** `new Random()` без seed — «на embedded — ошибка компилятора». `new Random(seed)` работает везде. `HardwareRandom` — отдельный класс. Правило явно задокументировано.

---

## P2 — Документационные пробелы (не блокируют, но нужны)

### P2-1: async state machine layout — частично специфицирован

**Статус:** решено
**Файл:** spec/07-concurrency.md (раздел «Размер и alignment state machine»)
**Решение:** Добавлены формула расчёта размера, таблица alignment по платформам (AVR/ARM/x86-64), overhead `async throws` (bool + union Result), пример расчёта на AVR, ограничение 253 `await` на AVR.

---

### P2-2: IR не описан полностью

**Статус:** решено
**Файл:** spec/11-compiler.md (раздел «IR»)
**Решение:** Добавлены basic blocks с terminators, phi nodes, полная таблица инструкций включая `await`/`yield`, пример async lowering (state_0/state_1/state_cleanup). IR переименован в SSA-подобный.

---

### P2-3: Migration guide TS → TSClang отсутствует

**Статус:** решено
**Файл:** spec/12-migration.md
**Решение:** Создан файл с разделами: автоматические правки (codemod), код работающий без изменений, ручные правки (string indexing, for-of, inheritance, ??), несовместимые паттерны, что добавляет TSClang.

---

## Открытые вопросы (нет решения, нужно обсудить)

1. **Max размер state machine для AVR** — при RAM 2KB, какой лимит приемлем? 256 байт? 512?
2. **Re-borrow после await** — запретить полностью или разрешить автоматический re-borrow?
3. **Regex implementation** — NFA (~5KB, для embedded) или PCRE (~50KB, desktop only)?
4. **Error recovery в парсере** — нужен для LSP (partial AST при синтаксических ошибках)

---

## Отклонено — эксперты ошиблись

| Замечание | Эксперт | Причина отклонения |
|-----------|---------|-------------------|
| `==` vs `===` идентичны — ломает TS-код | TS-expert | Осознанное решение, задокументировано |
| Нет `undefined` | TS-expert | Осознанное, `null` — явный выбор |
| `export default` запрещён | TS-expert | Осознанное |
| `import X from` = namespace ломает TS | TS-expert | Задокументировано, TS muscle memory — trade-off принят |
| Нет наследования классов | TS-expert | Осознанное, composition-only |
| Borrow checker может отвергнуть валидный код | compiler-eng, rust | Известный trade-off, описан с обоснованием |
| Interior mutability отсутствует | rust-expert | Обоснование есть, actor-паттерн покрывает кейсы |
| `Shared<T>` только desktop (недокументировано) | embedded | Написано в спеке — "только desktop/server" |
| Typed catch без vtable — не работает | c-expert | Работает через discriminated union с `_kind` tag — описано в C-output секции spec/06-errors.md |
| ISR ограничения не описаны | embedded | Подробный раздел `@embedded.isr` существует |
| `implements` vs `extends` — выбрать один | lang-designer | Оба приняты — совместимость с TS-привычками |
| `Readonly<T>` путает с `const` | lang-designer | Разные концепции, оба задокументированы |
| `string[i]` возвращает `u8` — тихий баг | TS-expert | Явно описано в спеке, осознанное решение |
| Нет LSP / VS Code extension | TS-expert | Tooling, не дизайн языка |
| Нет optional lifetime аннотаций | rust-expert | Осознанное ограничение для простоты |
