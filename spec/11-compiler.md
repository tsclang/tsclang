# TSClang — Архитектура компилятора

## Фазы компиляции

```
Parse → AST → Decorator pass → Typecheck → Lower to IR → Ownership Analysis → Codegen
                                                  ↑              ↑
                                             Flatten CFG    Borrow checker / ARC injection
```

## Decorator pass

Выполняется после парсинга, до проверки типов. Подробно описан в [13-decorators.md](13-decorators.md).

**Алгоритм:**

1. Обойти все классы и функции в порядке объявления
2. Для каждого декорированного узла — вычислить декораторы сверху вниз (фабрики вызываются)
3. Применить полученные функции снизу вверх — каждая получает и возвращает дескриптор
4. Модифицированный дескриптор заменяет оригинальный узел в AST
5. После обхода всех узлов — AST модифицирован, переходим к Typecheck

**Ограничения фазы:**

| Операция | Разрешено |
|----------|-----------|
| Читать `cls.name`, `desc.params`, `desc.returnType` | ✓ |
| Вызывать `desc.before()`, `desc.after()` | ✓ |
| Вызывать `cls.addField()`, `cls.addMethod()` | ✓ |
| Читать `meta` других классов | ✗ — порядок обхода не гарантирован |
| Вызывать рантайм-функции | ✗ — рантайма ещё нет |
| Читать типы полей добавленных другим декоратором | ✗ — если тот ещё не выполнился |

Ошибки decorator pass — compile-time ошибки, останавливают компиляцию до Typecheck.

---

## IR (Intermediate Representation)

IR — SSA-подобное представление между AST и C на основе **basic blocks**. Flattens вложенность, делает порядок выполнения явным.

### Basic Block

Единица IR — basic block: линейная последовательность инструкций с одним terminator в конце. Нет ветвлений внутри блока — только на границах.

```
block entry:
    alloc x, i32, 5
    alloc y, i32, 10
    branch (x > y), then_block, else_block

block then_block:
    call print, [x]
    jump end_block

block else_block:
    call print, [y]
    jump end_block

block end_block:
    phi result, [x from then_block, y from else_block]
    return result
```

### Инструкции

| Операция | Описание |
|----------|----------|
| `alloc x, type, value` | Создать переменную, владелец |
| `borrow x, source, imm\|mut` | Заимствовать (`Ref`/`Mut`) |
| `retain x` | Увеличить refcount (`Shared`) |
| `release x` | Уменьшить refcount |
| `call x, fn, args` | Вызов функции, результат в `x` |
| `assign x, value` | Присвоение |
| `drop x` | Конец жизни переменной |
| `return value` | Возврат (terminator) |
| `branch cond, then_label, else_label` | Условный переход (terminator) |
| `jump label` | Безусловный переход (terminator) |
| `phi x, [v1 from b1, v2 from b2, ...]` | Phi-node — значение зависит от предыдущего блока |
| `await x, resume_label` | Suspend coroutine (terminator для async) |
| `yield value` | Отдать управление планировщику (async) |

**Phi nodes** появляются при слиянии путей управления — например, переменная присваивается в обеих ветках `if/else`. Phi не генерирует C-код напрямую — borrow checker и кодоген читают его чтобы знать откуда пришло значение.

### Пример трансформации

TypeScript:
```typescript
let users = [user1, user2, user3]
const first = users[0]
push(users, user4)
```

IR:
```
block entry:
    alloc users, User[], [user1, user2, user3]
    borrow first, users[0], imm       // first = Ref<User>
    call _, push, [users, user4]      // ← ошибка: users заимствован (first жив)
    drop first
    drop users
    return void
```

### Async lowering в IR

`async` функция компилируется в state machine. `await` становится `suspend + resume`:

```typescript
async function fetchUser(id: i32): Promise<User> {
    const resp = await fetch("/api/" + id)
    return resp.json<User>()
}
```

IR (после async lowering):

```
// State machine struct: { _state: u8, id: i32, resp: Response }

block state_0:         // initial state
    alloc url, string, "/api/" + id
    call resp_future, fetch, [url]
    await resp_future, state_1     // suspend → сохранить id в struct, выйти
    drop url

block state_1:         // resume after await
    assign resp, resp_future.result
    call result, resp.json<User>, []
    return result

block state_cleanup:   // при отмене или ошибке
    drop resp          // if alive
    return error
```

**Почему IR:**

- Явный порядок операций (не как в AST)
- Простые проверки для borrow checker (линейный проход по блокам)
- Phi nodes делают merge явным — borrow checker видит все пути
- Async lowering — чёткое отображение `await` → state transitions
- Почти 1:1 с C — кодоген тривиальный

## Name mangling

Формальная схема описана в [spec/02-syntax.md](spec/02-syntax.md) (раздел «Name mangling — формальная схема»). Здесь — замечания для реализации компилятора.

**Что реализует компилятор:**
- Проверка PascalCase для пользовательских типов на этапе парсинга (до typechecking)
- Проверка зарезервированных префиксов (`ref_`, `mut_`, `arc_`, `opt_`, `arr_`) — ошибка компилятора
- Вычисление module slug из package name (`tsc.package.json` → поле `name`) + relative file path
- Формирование mangled name для каждой функции/метода при кодогенерации
- Флаг `--short-symbols`: опускает module slug для executable-проектов (не библиотек)

**Деманглинг:** грамматика самодостаточна — внешние метаданные не нужны. Деманглер реализуется как отдельный инструмент (или встраивается в debugger-интеграцию).

## Debug Info

### Механизм: `#line` директивы

TSClang компилирует `.tsc` → `.c`, затем C-компилятор (gcc/clang/avr-gcc) генерирует бинарь с DWARF. Чтобы DWARF ссылался на исходные `.tsc` файлы, компилятор вставляет `#line` директивы в debug-билде:

```c
/* сгенерированный C — debug профиль */
#line 42 "src/main.tsc"
int32_t result = myapp_src_main_foo_i32(x);

#line 43 "src/main.tsc"
myapp_src_main_bar_string(msg);
```

C-компилятор видит `#line` → записывает в DWARF `src/main.tsc:42` вместо `main.c:17`. GDB, LLDB, OpenOCD читают DWARF и показывают `.tsc` строки. Работает на всех таргетах включая avr-gcc — отдельной настройки не требует.

**`#line` эмитируется только в debug профиле.** В release — не эмитируется:

```json
{ "profile": "debug" }    // #line включены
{ "profile": "release" }  // #line отсутствуют, -O2/-O3
```

### Конфигурация путей

`#line` содержит путь к `.tsc` файлу. Debugger должен его найти. Конфигурируется в `tsc.package.json`:

```json
{ "debugSourceRoot": "relative" }        // по умолчанию — относительно project root
{ "debugSourceRoot": "absolute" }        // абсолютный путь — для remote debugging
{ "debugSourceRoot": "/custom/path" }    // явный базовый путь
```

По умолчанию `relative` — пути портабельны при передаче проекта. `absolute` нужен для embedded, где GDB-сервер (OpenOCD) запущен на другой машине.

### Что видит разработчик в debugger

Файл и строка — `.tsc`. Имена переменных и типы — C (DWARF описывает сгенерированный C, не TSClang):

```
(gdb) backtrace
#0  myapp_src_user_loadUsers () at src/user.tsc:15   ← .tsc строка ✅
#1  myapp_src_main_main ()       at src/main.tsc:8

(gdb) info locals
users = 0x20001234                                   ← C pointer
first = {name = {data = 0x20001250, len = 5}, age = 30}  ← C struct layout
```

**Closure** — видна как struct с captures:
```
_Closure_42 = {ctx = {id = 1, name = ...}}
```

**Async state machine** — видна как struct, `_state` показывает текущую точку:
```
_FetchUser_state = {_state = 1, id = 42, resp = ...}
// _state = 1 означает «после первого await»
```

**Mangled names** — функции видны с C-именами (деманглер встроен в `tsclang debug --dap`).

### Embedded (OpenOCD / SWD)

OpenOCD использует GDB-протокол → читает DWARF → `#line` работает без дополнительной настройки. Конфигурация GDB-сервера стандартная, специфики для TSClang нет. Рекомендуется `"debugSourceRoot": "absolute"` для embedded проектов.

### `tsclang debug --dap` — улучшенный debugging

Базовый debugging через `#line` показывает `.tsc` строки, но имена переменных и типы остаются C-шными. `tsclang debug --dap` запускает DAP-сервер (Debug Adapter Protocol), который сидит между IDE и GDB/OpenOCD и улучшает картину:

```
IDE (VS Code / любая DAP-совместимая)
    ↕  DAP protocol
tsclang debug --dap          ← TSClang DAP server
    ↕  GDB MI protocol
GDB / LLDB / OpenOCD
```

DAP-сервер трансформирует ответы до отправки в IDE:

| Без DAP-сервера | С `tsclang debug --dap` |
|-----------------|------------------------|
| `myapp_src_user_User_getName` | `User.getName()` |
| `_Closure_42 = {ctx = ...}` | `[ctx](x) => ... = {ctx = ...}` |
| `_FetchUser_state._state = 1` | `fetchUser — после первого await` |
| C struct layout | TSClang типы с оригинальными именами полей |

Запуск:
```bash
tsclang debug --dap --port 4711         # desktop: GDB под капотом
tsclang debug --dap --openocd --port 4711   # embedded: OpenOCD под капотом
```

VS Code подключается к порту 4711 через стандартный DAP. Отдельного расширения не нужно — DAP поддерживается встроенно.

### Ограничения

| Что | Статус |
|-----|--------|
| Файл и строка в debugger | ✅ через `#line` |
| TSClang имена с DAP-сервером | ✅ через `tsclang debug --dap` |
| Колонки | ❌ `#line` не поддерживает |
| TSClang типы без DAP-сервера | ❌ видны C-типы |
| Embedded (avr-gcc + OpenOCD) | ✅ работает |

## Методология тестов

Каждый компонент реализуется по одному циклу:

```
1. Тесты    — написать test corpus (формат Этап 0):
               входной .tsc → ожидаемый C output / ошибка компилятора
2. Реализация — реализовать компонент до полного прохождения тестов
3. Лог      — вести log/<компонент>.md: решения, проблемы, изменения дизайна
```

Структура файлов проекта:
```
test/cases/   — test corpus (Этап 0)
log/          — логи компонентов
src/          — исходный код компилятора
```

## Consumer-side monomorphization

Дженерики инстанцируются у потребителя, а не в библиотеке.

**Библиотека компилируется один раз** в IR с «дырами» для типов:

```typescript
// @myco/collections/index.tsc
export function identity<T>(x: T): T {
    return x
}

export class Box<T> {
    constructor(public value: T) {}
}
```

**Кеш библиотеки** содержит IR, не конкретные типы:
```
~/.tsclang/cache/@myco/collections@1.0.0/
  source/
    index.tsc
  build/
    desktop/
      include/
        collections.h      // IR с type holes
      lib/
        libcollections.a   // скомпилированный IR
```

**При компиляции потребителя** — компилятор инстанцирует конкретные варианты:

```typescript
import { identity, Box } from "@myco/collections"

const a = identity(42)           // identity<i32>
const b = identity("hello")      // identity<string>
const box = new Box<User>({...}) // Box<User>
```

**При компиляции проекта:**

1. Загрузить IR библиотеки с type holes
2. Найти использования: `identity<i32>`, `identity<string>`, `Box<User>`
3. Инстанцировать код для каждого типа

Генерируемый C:
```c
// identity<i32>
int32_t  identity_i32(int32_t x)   { return x; }

// identity<string>
String*  identity_string(String* x) { return x; }

// Box<User>
typedef struct { User* value; } Box_User;
```

Плюсы:
- Библиотека компилируется один раз (не для каждого набора типов)
- Оптимальная производительность — inlining и специализация под конкретный тип
- В бинарь попадает только используемое

### Формат скомпилированной библиотеки

Скомпилированная TSClang-библиотека в кеше:

```
@myco/mylib@1.0.0/
  source/
    index.tsc
    src/
      utils.tsc
  build/
    desktop/
      include/
        mylib.h
      lib/
        libmylib.a
  metadata.json
```

**`metadata.json`** — описывает публичный API библиотеки для consumer-side monomorphization:

```json
{
  "exports": {
    "foo": { "layout_hash": "abc123" },
    "Bar": { "layout_hash": "def456", "size": 16 }
  },
  "generics": {
    "identity": { "params": ["T"] },
    "Map": { "params": ["K", "V"] }
  }
}
```

- `exports` — конкретные (не generic) экспорты с хешом layout (для инвалидации кеша при изменении структуры)
- `generics` — generic-экспорты с именами параметров — компилятор потребителя инстанцирует их под конкретные типы

## Incremental compilation *(roadmap)*

Без incremental compilation каждый ребилд повторяет все generic инстанциации проекта. Для больших проектов с множеством `Map<K,V>`, `Box<T>` и пользовательских generic-типов это критично для DX.

**Планируется три уровня кеширования:**

**1. Кеш generic инстанциаций**

Результат инстанциации `Map<string, User>` → C-код сохраняется с ключом `(generic_ir_hash, type_args)`. При ребилде — если IR библиотеки и типы не изменились, C-код берётся из кеша без повторной инстанциации.

**2. File-level dependency tracking**

Каждый `.tsc` файл компилируется независимо если его зависимости не изменились. Граф зависимостей строится из `import` деклараций. Изменение `utils.tsc` перекомпилирует только файлы импортирующие `utils.tsc`, не весь проект.

**3. IR caching**

Скомпилированный IR каждого модуля кешируется по хешу исходника. `tsclang build` проверяет хеши и пропускает неизменённые модули.

**Инвалидация кеша** — автоматическая при:
- изменении исходного `.tsc` файла
- изменении версии зависимости (через `layout_hash` в `metadata.json`)
- изменении версии компилятора

Явная очистка: `tsclang build --clean`.

## Optimization levels

TSClang генерирует читаемый C и делегирует машинные оптимизации C-компилятору (gcc/clang/avr-gcc). Дублировать десятилетия работы C-компиляторов нет смысла.

### Что делает tsclang на IR-уровне (независимо от уровня оптимизации)

- **Dead code elimination** — функции, типы и импорты недостижимые из entry point не эмитируются в C. Проверяется статически по графу вызовов.
- **Monomorphization deduplication** — одна generic инстанциация (`Map<string, i32>`) используется в N местах → одна C-функция, не N копий.

Других IR-уровневых оптимизаций tsclang не делает — constant folding, inlining, loop unrolling — всё это задача C-компилятора.

### Что означает `optimize` — флаги C-компилятору

| Уровень | Флаг C-компилятора | Когда использовать |
|---------|-------------------|-------------------|
| `O0` | `-O0` | debug — читаемый C, быстрая компиляция, нет оптимизаций |
| `O1` | `-O1` | базовые оптимизации без увеличения размера бинаря |
| `O2` | `-O2` | стандартный release — скорость без агрессивного увеличения размера |
| `O3` | `-O3` | максимальная скорость — больший бинарь, возможен loop unroll/vectorize |
| `Os` | `-Os` | минимальный размер — для embedded с ограниченным flash |

Дефолт: `O0` в debug профиле, `O2` в release. Для AVR рекомендуется `Os`.

```json
// tsc.package.json
{
  "profiles": {
    "debug":   { "optimize": "O0" },
    "release": { "optimize": "O2" },
    "avr":     { "optimize": "Os" }
  }
}
```

Уровень оптимизации не влияет на корректность генерируемого C — только на флаги переданные C-компилятору.

## Error messages

### Формат

```
error[TSC-EXXX]: <краткое описание>
  --> <file>:<line>:<col>
   |
<line-1> | <исходный код>
         | ^^^ <метка что именно не так>
<line-2> | <исходный код>
         | --- <метка связанного места>
   |
   = hint: <что сделать>
   = note: <дополнительный контекст> (опционально)
```

- **Код ошибки** `TSC-EXXX` — стабильный идентификатор, не меняется между версиями компилятора. Можно искать в документации.
- **Сниппет** — показывает несколько строк вокруг ошибки с `^^^` под проблемным местом и `---` под связанными местами.
- **hint** — конкретное действие: что изменить. Всегда присутствует для ошибок borrow checker и ownership.
- **note** — дополнительный контекст когда причина неочевидна (опционально).

Предупреждения используют тот же формат с `warning[TSC-WXXX]`.

---

### Категории ошибок

#### Borrow checker

```
error[TSC-E042]: cannot borrow `buf` as mutable — already borrowed as immutable
  --> src/parser.tsc:12:5
   |
 9 |     let r: Ref<Buffer> = buf
   |                          --- immutable borrow starts here
12 |     buf.append(data)
   |     ^^^ mutable borrow attempted here
13 |     console.log(r)
   |                 - immutable borrow still used here
   |
   = hint: move last use of `r` before line 12, or restructure to avoid overlapping borrows
```

```
error[TSC-E043]: use of moved value `user`
  --> src/main.tsc:8:20
   |
 5 |     let user = new User("Alice")
 6 |     register(user)
   |              ---- value moved here
 8 |     console.log(user.name)
   |                 ^^^^ value used after move
   |
   = hint: clone before moving: `register(user.clone())`, or pass as `Ref<User>` if ownership not needed
```

```
error[TSC-E044]: `Ref<T>` cannot be stored in a field — lifetime cannot be tracked
  --> src/parser.tsc:3:5
   |
 3 |     data: Ref<Buffer>
   |     ^^^^^^^^^^^^^^^^^ field cannot hold a borrow
   |
   = hint: pass `Ref<Buffer>` as a method parameter instead (see ownership patterns)
   = note: borrows in fields require lifetime annotations which TSClang does not support
```

#### Ownership / await

```
error[TSC-E051]: borrow does not live long enough — `Ref<T>` cannot cross `await`
  --> src/handler.tsc:9:5
   |
 7 |     let r: Ref<User> = getUser()
 8 |     await fetchData()
   |     ^^^^^ borrow cannot cross await point
 9 |     console.log(r.name)
   |
   = hint: clone the value before await: `let name = r.name` or `let u = r.clone()`
```

#### Типы

```
error[TSC-E011]: type mismatch — expected `i32`, got `f64`
  --> src/calc.tsc:5:18
   |
 5 |     let x: i32 = 3.14
   |                  ^^^^ expected i32
   |
   = hint: use explicit cast `3.14 as i32` (truncates) or change type to `f64`
```

```
error[TSC-E021]: property `nmae` does not exist on type `User`
  --> src/main.tsc:7:15
   |
 7 |     console.log(user.nmae)
   |                      ^^^^ unknown property
   |
   = hint: did you mean `name`?
```

#### Embedded / платформа

```
error[TSC-E071]: `Shared<T>` is not available on heap:false platforms
  --> src/sensor.tsc:4:18
   |
 4 |     let shared = new Shared(sensor)
   |                  ^^^^^^^^^^^^^^^ requires heap allocation
   |
   = hint: use owned value or pass as `Ref<T>` parameter
   = note: current platform profile has `heap: false`
```

```
warning[TSC-W081]: i64 on 8-bit target is expensive (8 bytes, up to 8 instructions per operation)
  --> src/main.tsc:3:5
   |
 3 |     let counter: i64 = 0
   |                  ^^^ expensive type on AVR
   |
   = hint: use i32 if range allows (max i32: 2_147_483_647)
```

#### Exhaustiveness

```
error[TSC-E031]: non-exhaustive switch — missing case `Direction.Up`
  --> src/move.tsc:6:5
   |
 6 |     switch (dir) {
   |     ^^^^^^^^^^^^^ not all variants covered
   |
   = hint: add `case Direction.Up: ...` or `default: assertNever(dir)`
```

---

### Правила оформления hint

- **Конкретно:** `use r.clone()`, не «исправьте ошибку заимствования»
- **Один вариант:** если решений несколько — показать наиболее вероятное, остальные в `note`
- **Без жаргона:** не «lifetime constraint violated», а «borrow still used here»
- **Указывать строку** когда fix в другом месте: `= hint: move line 13 before line 9`
