# Async/Await и генераторы

## 1. Async/Await — стандартный способ

### Архитектура async runtime

```
TSC код (async/await)
        ↓
  компилятор TSC
        ↓
  state machines в C   ← как Rust генерирует Future
        ↓
  Runtime Interface (абстракция)
        ↓
  ┌─────────────┬──────────────┬──────────────┐
  │   libuv     │   io_uring   │  poll loop   │
  │  (desktop)  │   (Linux)    │  (embedded)  │
  └─────────────┴──────────────┴──────────────┘
```

TSC-код не знает какой runtime под капотом — работает с абстракцией. Runtime задаётся в `tsc.package.json` через поле `"runtime"`. `std/fs`, `std/net`, `std/ws` зависят от этого runtime.

Единственный event loop, один поток исполнения. `Shared<T>` и `Weak<T>` **не атомарны** — никаких накладных расходов. Narrowing через `if (x != null)` безопасен — между проверкой и использованием никакой другой код не выполняется.

```typescript
async function fetchUser(id: i32): User throws NetworkError {
    const conn = await connect("https://api.example.com");
    const data = await conn.get(`/users/${id}`);
    return User.parse(data);
}

async function main(): void {
    const user = await fetchUser(42);
    console.log(user.name);
}
```

На **embedded** `async fn` компилируется в state machine в C — без runtime, без heap:

```c
// async fn → конечный автомат
typedef struct { int32_t _state; /* захваченные переменные */ bool _done; } FetchUserTask;
void FetchUserTask_poll(FetchUserTask* t) { switch (t->_state) { ... } }
```

### State machine size и stack safety на embedded

State machine struct содержит только переменные, **живые через хотя бы один await**. Переменная, использованная до await и больше не нужная, в struct не попадает — компилятор минимизирует размер автоматически:

```typescript
async function op(): Result {
    const tmp = heavyCompute()    // tmp не переживает await → НЕ попадает в struct
    const a = await step1(tmp)    // tmp мёртв здесь
    const b = await step2(a)      // struct: { _state, a, b } — только живые
}
```

**Статический анализ worst-case async stack:**

Компилятор обходит граф async-вызовов и суммирует `sizeof` всех state machine по глубочайшему пути. Если платформа имеет `stack_size` в профиле — превышение является ошибкой компилятора:

```
error: async call stack exceeds platform limit (256 bytes)
  op: 12 bytes
  └─ step2: 8 bytes
       └─ fetchRaw: 244 bytes  ← виновник
hint: reduce live variables across await in fetchRaw
      use --report-stack to see full breakdown
```

Флаг `--report-stack` выводит полную картину без сборки:

```
tsclang build --report-stack

Async stack usage:
  main              4 B
  └─ op            12 B
       └─ step1     8 B
       └─ step2     8 B
            └─ fetchRaw  244 B  ⚠️  near limit
  Total worst-case: 276 B  ❌  exceeds stack_size: 256 B
```

Новый синтаксис не требуется — только диагностика компилятора.

### Размер и alignment state machine

**Формула:**
```
sizeof(StateMachine) = sizeof(_state) + sum(sizeof(V) for V in live_vars_across_any_await) + padding
```

где `live_vars_across_any_await` — переменные, живые хотя бы через одну точку `await` (минимизируются компилятором).

**Поле `_state`:** всегда `int32_t` (4 байта) на всех платформах. Компилятор не использует platform-specific типы для state field.

Максимальное число состояний: количество `await`-точек в функции + 2 (STATE_INIT, STATE_DONE).

**Overhead `async fn throws E`:**

`async` функция с `throws` добавляет к state machine хранение результата ошибки:

```c
// throws генерирует отдельный Result typedef
typedef struct { bool ok; union { ReturnType value; ErrorType error; }; } Result_ReturnType_ErrorType;

// State machine включает Result как поле
typedef struct {
    int32_t _state;
    Result_ReturnType_ErrorType _result;
    bool _done;
    /* живые переменные */
} AsyncThrowsTask;
```

**Пример расчёта (AVR):**

```typescript
async function greet(name: string): void {
    await sleep(10)                     // name: string (8 B) — живёт через await
    console.log(name)
}
// StateMachine: _state(4) + name(8) + _done(1) + _await_0(TscSleepAwaitable) + padding
```

### Borrows через await — запрещено

`Ref<T>` и `Mut<T>` не могут пережить точку `await`. Borrow checker отвергает такой код — это следствие того, что owned переменные попадают в state machine struct, а borrows нет (они не могут быть сохранены без гарантии что источник жив):

```typescript
// ❌ Ошибка: borrow жив через await
async function bad(data: Buffer): Promise<void> {
    const header = data.readHeader()  // Ref<Header> — borrow из data
    await fetchMore()                 // ← header жив через await — ошибка компилятора
    process(header)
}

// ✅ Клонировать нужные данные до await
async function ok(data: Buffer): Promise<void> {
    const header = data.readHeader().clone()  // owned копия
    await fetchMore()
    process(header)
}

// ✅ Или завершить использование borrow до await
async function ok2(data: Buffer): Promise<void> {
    const size = data.readHeader().size   // использовали и отпустили
    await fetchMore()
    data.resize(size)
}
```

Owned значения (`T`) через `await` переживать могут — захватываются в state machine struct. Только borrows запрещены.

### Promise<T>

Тип возвращаемого значения `async` функции — `Promise<T>`. Обе записи эквивалентны:

```typescript
async function fetchUser(id: i32): User { ... }           // компилятор выводит Promise<User>
async function fetchUser(id: i32): Promise<User> { ... }  // то же самое явно
```

Создать `Promise<T>` вручную (для оборачивания callback-based API):

```typescript
function delay(ms: i32): Promise<void> {
    return new Promise((resolve, reject) => {
        setTimeout(() => resolve(), ms);
    });
}

function readFile(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!fileExists(path)) reject(new IOError("not found"));
        else resolve(fs.readSync(path));
    });
}
```

- `resolve(value)` — завершает Promise успехом, передаёт значение
- `reject(error)` — завершает Promise ошибкой; тип ошибки должен совпадать с `throws`
- Вызов `resolve` или `reject` после первого вызова — no-op

### Promise.then / .catch / .finally

Методы для inline-трансформации и обработки ошибок без `await`. Полезны для коротких преобразований результата.

```typescript
// .then<U>(fn: (value: T) => U): Promise<U>
// преобразует результат успешного Promise
const upper = fetchName().then(name => name.toUpperCase())   // Promise<string>

// .catch<E>(fn: (err: E) => T): Promise<T>
// перехватывает ошибку, возвращает fallback
const safe = readFile(path).catch((e: IOError) => "")       // Promise<string>

// .finally(fn: () => void): Promise<T>
// выполняется при любом исходе, результат не меняет
const result = fetchData(url).finally(() => closeConnection())

// цепочки
const data = fetchRaw(url)
    .then(raw => parse(raw))
    .catch((e: ParseError) => defaultData)
    .finally(() => log("done"))
```

Правила:
- `.then(fn)` — `fn` вызывается только при успехе; возвращает новый `Promise<U>`. Если `fn` бросает — Promise переходит в ошибку.
- `.catch(fn)` — `fn` вызывается только при ошибке совпадающего типа; возвращает `Promise<T>` с fallback-значением. Неперехваченные ошибки пробрасываются дальше.
- `.finally(fn)` — `fn` вызывается всегда (и при успехе, и при ошибке); не меняет тип и значение Promise. `await` внутри `fn` — ошибка компилятора.

Все три метода — синтаксический сахар над `async/await`. Компилятор разворачивает их в эквивалентный `async` код:
```typescript
p.then(fn)  →  async () => fn(await p)
p.catch(fn) →  async () => { try { return await p } catch (e: E) { return fn(e) } }
```

С error handling:

```typescript
async function fetch(url: string): string throws NetworkError {
    return new Promise((resolve, reject) => {
        httpGet(url, (err, data) => {
            if (err) reject(new NetworkError(err));
            else resolve(data);
        });
    });
}
```

### Promise.all

Запуск нескольких async задач параллельно:

```typescript
const [users, posts] = await Promise.all([
    fetchUsers(),   // Promise<User[]>
    fetchPosts(),   // Promise<Post[]>
]);

// с error handling — если любая задача бросает, вся группа бросает
const [a, b, c] = await Promise.all([taskA(), taskB(), taskC()]);
```

- Все задачи запускаются одновременно, ждём завершения всех
- Fail-fast: первая ошибка побеждает, остальные задачи отменяются через AbortSignal
- Типы элементов выводятся компилятором из переданных Promise

**Throws-union:** если промисы бросают разные типы ошибок — компилятор выводит их union. Throws-union допустим только в позиции `throws` (не как тип значения), все члены обязаны наследовать `Error`:

```typescript
async function a(): void throws IOError { ... }
async function b(): void throws NetworkError { ... }

// компилятор выводит: throws IOError | NetworkError
await Promise.all([a(), b()])

try {
    await Promise.all([a(), b()])
} catch (e: IOError) {
    console.log("io error:", e.message);
} catch (e: NetworkError) {
    console.log("network error:", e.message);
}
```

Если все промисы бросают одно и то же — union схлопывается в один тип.

**Порядок при "одновременном" падении:** на однопоточном event loop истинной одновременности нет — порядок обработки детерминирован. Если несколько промисов упали в одном тике, первым обрабатывается тот, чей индекс в массиве меньше. Остальные ошибки теряются. Для сбора всех ошибок используй `Promise.allSettled`.

### Promise.any

Ждёт **первого успешного**. Если все задачи завершились ошибкой — бросает ошибку последней:

```typescript
// возвращает первый успешно загруженный ресурс
const data = await Promise.any([
    fetchFromMirror1(url),
    fetchFromMirror2(url),
    fetchFromMirror3(url),
])
```

- Тип результата: `T` (общий тип всех Promise)
- Если хотя бы одна задача успешна — остальные отменяются
- Если все задачи бросают — `Promise.any` бросает ошибку последней завершившейся

### Promise.race

Ждёт **первого завершившегося** — успех или ошибка:

```typescript
// таймаут через Promise.race
async function withTimeout(ms: i32): never throws TimeoutError {
    await sleep(ms)
    throw new TimeoutError()
}

const result = await Promise.race([
    fetchData(url),
    withTimeout(5000),
])
```

- Возвращает результат первой завершившейся задачи (или бросает её ошибку)
- Остальные задачи отменяются
- Тип результата: общий тип всех Promise в массиве

### Promise.allSettled

Ждёт **всех**, собирает результаты включая ошибки — никогда не бросает:

```typescript
type SettledResult<T, E extends Error> =
    | { status: "fulfilled"; value: T }
    | { status: "rejected";  error: E }
```

Возвращает **кортеж** — каждый элемент типизирован по своему промису:

```typescript
async function fetchUser(id: i32): User throws NetworkError { ... }
async function validateForm(data: FormData): void throws ValidationError { ... }

const [r1, r2] = await Promise.allSettled([fetchUser(1), validateForm(data)])
// r1: SettledResult<User, NetworkError>
// r2: SettledResult<void, ValidationError>

match (r1) {
    { status: "fulfilled", value } => console.log(value.name)
    { status: "rejected",  error } => console.log(error.message)  // error: NetworkError
}
```

- Никогда не бросает — все ошибки в результате
- Порядок результатов соответствует порядку задач в массиве
- Используй когда нужно знать результат каждой задачи независимо от других

**Сравнительная таблица:**

| Метод | Ждёт | При ошибке | Результат |
|-------|------|------------|-----------|
| `Promise.all` | всех | бросает сразу | `T[]` (или кортеж) |
| `Promise.any` | первого успешного | бросает если все упали | `T` |
| `Promise.race` | первого (любого) | бросает если первый упал | `T` |
| `Promise.allSettled` | всех | не бросает | `SettledResult<T>[]` |

### Правила await

- `await` только внутри `async` функции — иначе ошибка компилятора
- `await` только на `Promise<T>` — `await` на обычном значении ошибка компилятора

```typescript
// ✅ ok
async function foo(): i32 {
    return await bar();   // bar(): Promise<i32>
}

// ❌ await вне async функции
function bad(): void {
    await foo();   // error: await outside async function
}

// ❌ await на не-Promise
async function bad2(): void {
    const x: i32 = 42;
    await x;   // error: cannot await i32, expected Promise<T>
}
```

### switch внутри async

`switch` внутри `async`-функции компилируется в `if / else if / else` — **не** в C `switch`. Причина: внешний `switch(self->_state)` уже используется для state machine, и вложенный C `switch` конфликтует с `break`/`continue` внешних циклов.

```typescript
async function handle(code: i32): i32 {
    const x = await fetchValue();
    switch (x) {
        case 1:
            return 10;
        case 2:
            return 20;
        default:
            return 0;
    }
}
```

Генерируемый C-код:

```c
// внутри poll-функции:
// ... await fetchValue() ...
if (x == 1) {
    self->_result = 10;
    self->_done = true;
    return;
} else if (x == 2) {
    self->_result = 20;
    self->_done = true;
    return;
} else {
    self->_result = 0;
    self->_done = true;
    return;
}
```

Правила:

- `break` внутри `switch` в async — просто конец ветки (не генерирует C `break`)
- `break label` / `continue` из `switch` внутри async `while` — `goto` к метке внешнего цикла
- Implicit fallthrough запрещён — проверяется общим хелпером `_validateSwitchFallthrough`
- `case`-тело обрабатывается через async-path (`_emitAsyncStmt`) — `await` внутри `case` корректно генерирует state transitions
- Пустые case (группировка `case 1: case 2:`) поддерживаются — условие `==` комбинируется через `||`

### async main

Entry point может быть `async` — компилятор запускает event loop автоматически:

```typescript
async function main(): void {
    const user = await fetchUser(42);
    console.log(user.name);
}
```

На desktop/server — стандартный event loop (libuv или аналог).
На embedded — poll loop, скомпилированный в state machine без heap.

### Рекурсивные async функции

Обычная async функция компилируется в state machine фиксированного размера — размер известен на этапе компиляции, память на стеке. Рекурсивная async функция требует state machine неизвестного размера → компилятор обнаруживает рекурсию и автоматически размещает state machine на **heap**:

```typescript
// прямая рекурсия — компилятор обнаруживает, выдаёт предупреждение
async function traverse(node: TreeNode): void {
    const left = node.left       // owned copy до await
    const right = node.right     // owned copy до await
    await process(node)
    if (left)  await traverse(left)    // ← рекурсия
    if (right) await traverse(right)
}
// warning: async function `traverse` is recursive — state machine heap-allocated
```

```typescript
// взаимная рекурсия — тоже обнаруживается
async function ping(): void { await pong() }
async function pong(): void { await ping() }
// warning: mutual recursion detected (ping ↔ pong) — state machines heap-allocated
```

Поведение по платформам:

| Платформа | Рекурсивная async | Поведение |
|-----------|-------------------|-----------|
| Desktop/server | ✅ | heap allocation, предупреждение компилятора |
| Embedded | ❌ | ошибка компилятора: no heap available |

На **embedded** рекурсивная async функция — ошибка компилятора с подсказкой переписать через явный стек (`u8[]` или `i32[]`) или итеративно.

#### `@stack(name, N)` — явный стек для async-рекурсии

Встроенный декоратор. Создаёт статический стек размером N в BSS. `@stack` — компаньон для случаев когда рекурсия необходима: обход деревьев, парсинг, DFS:

```typescript
import { push, pop, empty } from "std/stack";

@stack("nodes", 64)
async function traverse(root: Node): Promise<void> {
    push("nodes", root)
    while (!empty("nodes")) {
        const n: Node = pop<Node>("nodes")
        await process(n)
        if (n.left)  push("nodes", n.left)
        if (n.right) push("nodes", n.right)
    }
}
```

```c
// C-output — стек в статической памяти
static Node nodes_stack[64];
static uint8_t nodes_stack_top = 0;

void traverse_poll(Traverse_SM* sm) {
    switch (sm->_state) {
        case 0:
            nodes_stack[nodes_stack_top++] = sm->root;
            sm->_state = 1; break;
        case 1:
            if (nodes_stack_top == 0) { sm->_done = true; return; }
            sm->n = nodes_stack[--nodes_stack_top];
            process_poll(&sm->n_state);
            sm->_state = 2; break;
        // ...
    }
}
```

Размер N — compile-time константа. Переполнение → паника в runtime.

#### Дополнительные ограничения async на embedded

| Конструкция | Desktop | Embedded |
|-------------|---------|----------|
| Рекурсивная async | ✅ heap | ❌ ошибка → используй `@stack` |
| `Ref<T>` через `await` | ❌ всегда | ❌ всегда |
| `Promise.all` / `Promise.race` | ✅ | ❌ требует heap |
| `@static async function` | работает | обязателен при `allocator: "static"` |

### Отмена задач — AbortSignal

Кооперативная отмена async операций. Компилятор вставляет проверку флага автоматически — разработчик пишет только бизнес-логику.

```typescript
const controller = new AbortController()
const signal = controller.signal

// отменяем через 5 секунд
setTimeout(() => controller.abort(new TimeoutError()), 5000)

try {
    const data = await fetch(url, { signal })
} catch (e: AbortError) {
    console.log("отменено:", e.cause);
} catch (e: NetworkError) {
    console.log("сетевая ошибка:", e.message);
}
```

**`AbortController`:**
```typescript
class AbortController {
    readonly signal: AbortSignal
    abort(reason?: Error): void   // idempotent — повторный вызов no-op
}
```

**`AbortSignal`:**
```typescript
class AbortSignal {
    readonly aborted: boolean      // true после abort()
    readonly reason:  Error | null // reason переданный в abort(), или null

    onAbort(callback: () => void): void  // низкоуровневая очистка (close fd, cancel io_uring)

    static timeout(ms: i32): AbortSignal // хелпер — сигнал который отменяется через N мс
}
```

`AbortSignal.timeout(ms)` — удобный хелпер, не нужен лишний `AbortController`:
```typescript
const data = await fetch(url, { signal: AbortSignal.timeout(5000) })
```

**Автоматические проверки компилятора:**

Если функция принимает `signal?: AbortSignal` — компилятор вставляет проверку в начале каждого state в сгенерированной state machine (каждая `await`-точка):

```typescript
// TSC — пишем только логику
async function loadConfig(path: string, signal?: AbortSignal): Config {
    const raw  = await readFile(path)    // ← автопроверка
    const json = await parseJson(raw)   // ← автопроверка
    return validate(json)
}
```

C-output (каждый state начинается с проверки):
```c
case STATE_READ_FILE:
    if (signal && atomic_load(&signal->aborted)) {
        ctx->state = STATE_ERROR;
        ctx->error = signal->reason ? signal->reason : &AbortError_default;
        break;
    }
    // ... логика чтения ...
```

Компилятор также добавляет проверку в начало длинных циклов `for`/`while`, если внутри есть хотя бы одна `await`.

**`signal.onAbort(callback)`** — для очистки ресурсов которые не управляются через `await`:

```typescript
async function readSocket(fd: i32, signal?: AbortSignal): Buffer {
    signal?.onAbort(() => close(fd))   // закрываем fd при отмене
    const data = await recv(fd)
    return data
}
```

Callbacks вызываются **синхронно** в том потоке который вызвал `abort()`. Никакого `await` внутри callback — ошибка компилятора.

**`AbortError`** — ошибка которую бросает state machine при обнаружении отменённого сигнала:

```typescript
class AbortError extends Error {
    cause: Error | null   // reason из controller.abort(reason)
}
```

**Правила `AbortError` и `throws`:**

- `AbortError` **не объявляется в `throws`** — наличие `signal?: AbortSignal` в параметрах уже является декларацией что функция отменяема. Дублировать в `throws` избыточно.
- Функции **без** `AbortSignal` в параметрах не могут бросить `AbortError` — компилятор это гарантирует.
- `AbortError` ловится через обычный `catch (e: AbortError)` — когда нужно вернуть default-значение или залогировать отмену.
- Для cleanup при отмене — `signal.onAbort(callback)`, не `catch`.

```typescript
// ✅ — AbortError не в throws, signal? уже декларирует отменяемость
async function loadConfig(path: string, signal?: AbortSignal): Config throws IOError {
    return await readFile(path)
}

// поймать отмену — через catch:
try {
    const cfg = await loadConfig(path, signal)
} catch (e: AbortError) {
    return defaultConfig   // graceful fallback при отмене
} catch (e: IOError) {
    throw e
}

// cleanup при отмене — через onAbort, не catch:
async function readSocket(fd: i32, signal?: AbortSignal): Buffer {
    signal?.onAbort(() => close(fd))
    return await recv(fd)
}
```

**Ownership при отмене — cleanup всегда выполняется:**

Когда state machine обнаруживает `signal.aborted`, она не прерывается немедленно — она переходит в режим **unwind**: проходит все cleanup-состояния для живых ресурсов точно так же, как при обычном завершении или ошибке. Owned ресурсы всегда освобождаются:

```typescript
async function process(name: string, signal?: AbortSignal): void {
    const line = await readLine()            // line: owned string (→ String in C)
    // ← если signal.aborted здесь → unwind: tsc_string_release(line)
    await sleep(100)
    // ← если signal.aborted здесь → unwind: tsc_string_release(line)
    console.log(line)
}
```

C-output — при отмене state machine переходит в `STATE_CLEANUP`, не в немедленный выход:
```c
case STATE_SLEEP:
    if (signal && atomic_load(&signal->aborted)) {
        ctx->error = signal->reason ? ... : &AbortError_default;
        ctx->state = STATE_CLEANUP;   // → cleanup, не abort
        break;
    }
    // ...

case STATE_CLEANUP:
    tsc_string_release(ctx->line);    // owned ресурсы освобождаются
    ctx->state = STATE_ERROR;
    break;
```

C-output — зависит от платформы. `AbortSignal` может быть отправлен в `Thread.spawn` (он `Readonly<>`), поэтому `abort()` может прийти из worker thread — отсюда `atomic_bool` на desktop:

```c
/* desktop — abort() может быть вызван из worker thread */
struct AbortSignal {
    atomic_bool    aborted;
    Error*         reason;       // null если нет причины
    AbortCallback* callbacks;    // linked list onAbort-обработчиков
};

/* embedded — нет threads, plain bool достаточно */
struct AbortSignal {
    bool           aborted;
    AbortCallback* callbacks;
    /* reason убран — на embedded нет heap для Error* */
};
```

**`abort()` никогда не выполняет callbacks синхронно** — независимо от того, откуда вызван (event loop или worker thread). Он только атомарно ставит флаг и планирует callbacks на event loop:

```
Worker thread:   abort() → atomic set aborted=true → schedule callbacks на event loop
Event loop:      следующий тик → выполняет onAbort callbacks в своём контексте
```

Это гарантирует отсутствие гонки: callbacks всегда выполняются в event loop, даже если `abort()` вызван из другого потока.

**Взаимодействие с `Promise.race`:**
```typescript
// AbortController позволяет остановить проигравшие задачи
const ctrl = new AbortController()

const result = await Promise.race([
    fetchFromA(url, { signal: ctrl.signal }),
    fetchFromB(url, { signal: ctrl.signal }),
])

ctrl.abort()   // победитель уже вернул результат, проигравший прекратит работу при следующей await
```

**`AbortSignal.any`** — объединяет несколько сигналов в один: срабатывает когда хотя бы один из них отменён:

```typescript
const deadline = AbortSignal.timeout(5000)
const userCancel = controller.signal

const combined = AbortSignal.any([deadline, userCancel])
await fetch(url, { signal: combined })
```

**`signal.addEventListener("abort", cb)`** — альтернатива `signal.onAbort(cb)`, JS-совместимый синтаксис. Принимает только `"abort"` как тип события, остальные — ошибка компилятора:

```typescript
signal.addEventListener("abort", () => cleanup())  // OK
signal.addEventListener("load", () => ...)         // compile error: unknown event type
```

---

### AsyncMutex — координация async-функций

Обычный `Mutex` (из `std/sync`) нельзя использовать между async-функциями на одном event loop: `await mutex.lock()` заблокирует event loop навсегда, если другая async-функция уже держит лок — она никогда не получит управление чтобы освободить.

```typescript
// ❌ Deadlock на event loop:
import { Mutex } from "std/sync"
const mutex = new Mutex()
async function a(): Promise<void> { mutex.lock(); await b(); mutex.unlock() }
async function b(): Promise<void> { mutex.lock(); ... }  // никогда не выполнится
```

Для координации async-функций — `AsyncMutex` из `std/async`:

```typescript
import { AsyncMutex } from "std/async"

const mutex = new AsyncMutex()

async function critical(): Promise<void> {
    await mutex.lock()   // неблокирующий: сохраняет callback в очередь, отдаёт event loop
    try {
        // критическая секция
        await doWork()
    } finally {
        mutex.unlock()
    }
}

// Или через runExclusive — автоматический unlock, включая ошибки:
await mutex.runExclusive(async () => {
    await doWork()
})  // unlock гарантирован даже при throw
```

`AsyncMutex` — честная очередь (FIFO): ждущие корутины пробуждаются по порядку. При `unlock()` следующий ожидающий получает лок на следующей итерации event loop.

**Правило:** `Mutex` (std/sync) — только для синхронного кода и `Thread.spawn`. `AsyncMutex` — для async-функций на event loop. Использование `Mutex.lock()` (блокирующего) в async-контексте — **предупреждение компилятора**.

---
## 5. Async generators — streaming

### AsyncIterator\<T\>

```typescript
interface AsyncIterator<T> {
    next(): Promise<T | null>   // null = exhausted (done)
    close(): Promise<void>      // signal early termination, runs finally blocks
}
```

`null` означает конец потока. Следствие: генератор не может `yield null` как данные — compile error.

### async function\*

```typescript
function* greet(prefix: string): Generator<string> {
    let name: string = prefix
    yield name   // move semantics — передаёт ownership caller'у
}
```

`yield expr` — move semantics. Значение перемещается в state machine struct, затем забирается caller'ом через `next()`. Генератор не может использовать значение после `yield`.

**`throws` в async генераторах** — ошибка пробрасывается через `next()`:

```typescript
async function* gen(): AsyncIterator<string> throws IOError {
    yield "ok"
    throw new IOError("fail")   // next() вернёт rejected Promise<string | null>
}
```

### for await

```typescript
const g = greet("hello")
for (const v of g) {
    if (v == "stop") break   // → вызывает cleanup генератора
    process(v)
}
// cleanup вызывается автоматически при: break, нормальном завершении
```

`for-of` — sugar над `Generator<T>`:

```typescript
// десахаривается в:
const _gen = greet("hello")
while (true) {
    const result = _gen.next()
    if (result.done) break
    const v = result.value
    // body
    if (shouldBreak) break
}
```

### close() семантика

`close()` не прерывает pending `await` — устанавливает флаг. Генератор проверяет флаг после текущего `await`, пропускает следующий `yield`, выполняет `finally`.

```typescript
// генератор приостановлен на yield
// → вызван break в for-of
// → генератор видит что больше не нужен
// → выполняет cleanup (tsc_string_release и т.д.)
```

Параллельный вызов `next()` (пока предыдущий не завершён) — runtime panic. `for await` гарантирует последовательность автоматически.

### return(value) и throw(error)

`AsyncIterator<T>` поддерживает принудительное завершение и инъекцию ошибки:

```typescript
interface AsyncIterator<T> {
    next():                Promise<T | null>
    close():              Promise<void>         // graceful stop, выполняет finally
    return(value: T):     Promise<T | null>     // завершить, отдав последнее значение
    throw(error: Error):  Promise<T | null>     // инъекция ошибки в точке yield
}
```

`return(value)` — завершает генератор, устанавливает флаг `close`, возвращает `value` как последнее yielded значение. Все `finally`-блоки выполняются.

`throw(error)` — инъектирует ошибку: генератор получит её в точке ожидания следующего `next()` как брошенное исключение. Если генератор не поймает — пробрасывается наружу.

```typescript
const gen = greet("hello")
gen.throw(new Error("injected"))   // генератор увидит ошибку при следующем yield
```

Синхронный `Generator<T>` (без `async`) имеет аналогичный интерфейс без `Promise`:

```typescript
interface Generator<T> {
    next():               T | null
    return(value: T):     T | null
    throw(error: Error):  T | null
}
```

### AsyncChannel как AsyncIterator

`AsyncChannel<T>` реализует `AsyncIterator<T>` — можно использовать в `for await`:

```typescript
const ch = new AsyncChannel<Buffer>(16)

// producer:
async function producer(): void {
    for (const chunk of data) await ch.send(chunk)
    ch.close()
}

// consumer:
for await (const chunk of ch) {
    process(chunk)
}
```

### C output

Async generator компилируется в state machine с двумя типами suspension points:

```c
typedef struct { int32_t _state; String name; bool _done; String _value; } greet_state;
typedef struct { String value; bool done; } greet_result;

// next() возвращает struct { value, done }
greet_result greet_next(greet_state *self, String prefix) {
    switch (self->_state) {
        case 0:
            self->name = prefix;
            tsc_string_retain(self->name);
            self->_state = 1;
            return (greet_result){self->name, false};
        case 1:
            goto _cleanup;
        _cleanup:
            tsc_string_release(self->name);
            self->_done = true;
            return (greet_result){(String){0}, true};
    }
    return (greet_result){(String){0}, true};
}
```

State machine аллоцируется на heap по умолчанию. На `allocator: "static"` — используй `@static`, тогда struct генератора идёт в BSS:

```typescript
// Работает на Arduino, AVR, bare-metal ARM — без heap!
@static function* adcSampler(channel: u8): Generator<u16> {
    while (true) {
        yield ADC.read(channel)
    }
}

// Использование — struct на BSS, не на heap
const sampler = adcSampler(0)   // _AdcSamplerGen размещается @static
for (const sample of sampler) {
    uart.write(sample as u8)
    if (sample > 900) break
}
```

```c
/* C-output — same struct/result convention as regular generators */
typedef struct { int32_t _state; uint8_t channel; bool _done; uint16_t _value; } _AdcSampler_state;
typedef struct { uint16_t value; bool done; } _AdcSampler_result;
static _AdcSampler_state _adcSampler_instance;   /* BSS, не heap */

static _AdcSampler_result adcSampler_next(_AdcSampler_state *self) {
    switch (self->_state) {
    case 0: self->_state = 1; /* fall through */
    case 1:
        self->_value = ADC_read(self->channel);
        return (_AdcSampler_result){self->_value, false};
    }
    return (_AdcSampler_result){0, true};
}
```

На `allocator: "none"` — `async function*` с heap-аллокацией → ошибка компилятора. Без `@static` и без `allocator: "none"` также ошибка. `@static` обязателен при `allocator: "static"`.

Обычные (синхронные) генераторы (`function*` без `async`) всегда работают на стеке — heap не требуется ни на каких платформах.

#### `@static function*` — единственный экземпляр генератора

`@static` на генераторе создаёт один экземпляр state machine на всю программу, живёт в BSS.

```typescript
@static
function* scanline(): Generator<u8[256]> {
    while (true) {
        yield renderLine()
    }
}
```

```c
// C-output — статическая state machine
typedef struct { int32_t _state; int32_t n; bool _done; int32_t _value; } counter_state;
typedef struct { int32_t value; bool done; } counter_result;

static counter_result counter_next(counter_state *self) {
    switch (self->_state) {
        case 0:
            self->n = 0;
            self->_state = 1;
            /* fall through */
        case 1:
            if (self->n < 10) {
                self->_value = self->n;
                self->n++;
                return (counter_result){self->_value, false};
            }
            goto _cleanup;
        _cleanup:
            self->_done = true;
            return (counter_result){0, true};
    }
    return (counter_result){0, true};
}

static counter_state _counter_instance;
```

### Embedded: альтернативы async generators

На `heap: false` (AVR, bare-metal ARM) async generators недоступны. Streaming реализуется синхронными паттернами:

**Паттерн 1: polling loop** — для медленной периферии:

```typescript
import { uart } from "std/hal"

while (true) {
    while (uart.available()) {
        const byte = uart.read()
        process(byte)
    }
    doOtherWork()
}
```

**Паттерн 2: ISR + ring buffer** — для interrupt-driven периферии (UART RX, SPI):

```typescript
import { Volatile } from "std/embedded"
import { interruptDisable, interruptEnable } from "std/avr"

// статическая память — не heap, не стек, живёт всё время
const rxBuf: u8[64] = [0, 0, 0, 0, 0, 0, 0, 0,
                        0, 0, 0, 0, 0, 0, 0, 0,
                        0, 0, 0, 0, 0, 0, 0, 0,
                        0, 0, 0, 0, 0, 0, 0, 0,
                        0, 0, 0, 0, 0, 0, 0, 0,
                        0, 0, 0, 0, 0, 0, 0, 0,
                        0, 0, 0, 0, 0, 0, 0, 0,
                        0, 0, 0, 0, 0, 0, 0, 0]
const rxHead = new Volatile<u8>(0)   // пишет ISR
const rxTail = new Volatile<u8>(0)   // читает main loop

@isr("USART_RX")
function onUartRx(): void {
    const next = (rxHead.read() + 1) as u8
    if (next != rxTail.read()) {   // не переполнен
        rxBuf[rxHead.read()] = UART.readByte()
        rxHead.write(next)
    }
}

// main loop:
while (true) {
    interruptDisable()
    const head = rxHead.read()
    interruptEnable()

    while (rxTail.read() != head) {
        const byte = rxBuf[rxTail.read()]
        rxTail.write((rxTail.read() + 1) as u8)
        process(byte)
    }
}
```

`Volatile<T>` гарантирует что компилятор не закэширует чтение в регистре — критично для переменных разделяемых ISR и main loop.

**Паттерн 3: DMA + callback** — для bulk transfers (SPI flash, ADC burst):

```typescript
const dmaBuf: u8[256] = [0, ...]

dma.read(dmaBuf, 256, (buf: Ref<u8[256]>) => {
    process(buf)
    // callback вызывается из ISR завершения DMA
})
```


---

Threads, ISR, embedded annotations — см. [11-concurrency/](../11-concurrency/)
