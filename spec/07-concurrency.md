# TSClang — Конкурентность

## Уровни модели

TSC разделяет конкурентность на три независимых механизма:

| Механизм | Платформа | Уровень |
|----------|-----------|---------|
| `async/await` | все | стандартный |
| `std/threads` | OS (desktop/server) | продвинутый |
| `@embedded.isr` | embedded (AVR/Cortex) | системный |

---

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
typedef struct { int _state; /* захваченные переменные */ } FetchUserTask;
bool FetchUserTask_poll(FetchUserTask* t) { switch (t->_state) { ... } }
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

**Размер поля `_state` по платформам:**

| Платформа      | Тип `_state` | Размер | Alignment |
|----------------|-------------|--------|-----------|
| AVR            | `uint8_t`   | 1 B    | 1 B       |
| ARM Cortex-M   | `uint32_t`  | 4 B    | 4 B       |
| x86-64         | `int32_t`   | 4 B    | 8 B       |

Максимальное число состояний (255 для AVR): количество `await`-точек в функции + 2 (STATE_INIT, STATE_DONE). Если функция содержит больше 253 `await` точек — ошибка компилятора на AVR.

**Overhead `async fn throws E`:**

`async` функция с `throws` добавляет к state machine хранение результата ошибки:

```c
typedef struct {
    uint8_t        _state;
    /* живые переменные */
    bool           _ok;           // результат: успех или ошибка
    union {
        ReturnType _value;        // при успехе
        ErrorType  _error;        // при ошибке
    };
} AsyncThrowsTask;

// sizeof = sizeof(_state) + sizeof(live vars) + sizeof(bool) + max(sizeof(T), sizeof(E)) + padding
```

**Пример расчёта (AVR):**

```typescript
async function readConfig(): string throws IOError {
    const fd = await openFile("cfg")    // fd: FileHandle (4 B) — живёт через await
    const s  = await readAll(fd)        // s: string (8 B) — живёт через return
    return s
}
// StateMachine: _state(1) + fd(4) + s(8) + _ok(1) + max(string,IOError)(8) + padding = ~24 B
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
async function traverse(node: Ref<TreeNode>): void {
    await process(node)
    if (node.left)  await traverse(node.left)   // ← рекурсия
    if (node.right) await traverse(node.right)
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

#### `@embedded.stack(name, N)` — явный стек для async-рекурсии

Встроенный декоратор. Создаёт статический стек размером N в BSS. `@embedded.stack` — компаньон для случаев когда рекурсия необходима: обход деревьев, парсинг, DFS:

```typescript
@embedded.stack("nodes", 64)
async function traverse(root: Ref<Node>): Promise<void> {
    while (!@embedded.stack_empty("nodes")) {
        const n = @embedded.stack_pop<Ref<Node>>("nodes")
        await process(n)
        if (n.left)  @embedded.stack_push("nodes", n.left)
        if (n.right) @embedded.stack_push("nodes", n.right)
    }
}
```

```c
// C-output — стек в статической памяти
static Node* nodes_stack[64];
static uint8_t nodes_stack_top = 0;

void traverse_poll(Traverse_SM* sm) {
    switch (sm->_state) {
        case 0:
            nodes_stack[nodes_stack_top++] = sm->root;
            sm->_state = 1; break;
        case 1:
            if (nodes_stack_top == 0) { sm->_state = 0xFF; return; }
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
| Рекурсивная async | ✅ heap | ❌ ошибка → используй `@embedded.stack` |
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
async function processFile(path: string, signal?: AbortSignal): Buffer {
    const file = await openFile(path)       // file: owned FileHandle
    // ← если signal.aborted здесь → unwind: file._free() вызывается автоматически
    const data = await readAll(file)
    // ← если signal.aborted здесь → unwind: data._free() + file._free()
    return data
}
```

C-output — при отмене state machine переходит в `STATE_CLEANUP`, не в немедленный выход:
```c
case STATE_READ_ALL:
    if (signal && atomic_load(&signal->aborted)) {
        ctx->error = signal->reason ? ... : &AbortError_default;
        ctx->state = STATE_CLEANUP;   // → cleanup, не abort
        break;
    }
    // ...

case STATE_CLEANUP:
    if (ctx->file) FileHandle_free(ctx->file);   // owned ресурсы освобождаются
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

## 2. Threads (std/threads) — продвинутый уровень

Только там где есть OS. Потоки работают как **изоляты** — без общей памяти. Связь через каналы (передача владения) или через `Atomic<T>` / `AtomicArray<T>`.

### Atomic<T>

Единственный способ разделить значение между потоками без канала. Heap-allocated, встроенный атомарный ref count. Compiler делает escape analysis: если `Atomic<T>` не уходит в `Thread.spawn` — размещается на стеке без ref count.

```typescript
import { Atomic, AtomicArray, LoadOrdering, StoreOrdering, RmwOrdering } from "std/threads"

const counter = new Atomic<i32>(0)

Thread.spawn(() => {
    // компилятор: counter._retain() перед spawn
    // компилятор: counter._release() в конце потока
    counter.fetchAdd(1, RmwOrdering.AcqRel)
})

counter.load(LoadOrdering.Acquire)          // i32
counter.store(0, StoreOrdering.Release)     // void
counter.fetchAdd(1, RmwOrdering.AcqRel)     // i32 — старое значение
counter.fetchSub(1, RmwOrdering.AcqRel)     // i32
counter.fetchAnd(0xFF, RmwOrdering.AcqRel)  // i32
counter.fetchOr(0x01,  RmwOrdering.AcqRel)  // i32
counter.fetchXor(0x01, RmwOrdering.AcqRel)  // i32
counter.swap(42, RmwOrdering.AcqRel)        // i32 — старое значение
counter.compareExchange(
    expected, desired,
    RmwOrdering.AcqRel,   // success ordering
    LoadOrdering.Acquire  // failure ordering — провал только читает
): { success: boolean, value: i32 }
```

Memory ordering типы — компилятор запрещает неверные комбинации:

```typescript
enum LoadOrdering  { Relaxed, Acquire, SeqCst }           // только для load / failure
enum StoreOrdering { Relaxed, Release, SeqCst }           // только для store
enum RmwOrdering   { Relaxed, Acquire, Release, AcqRel, SeqCst }  // read-modify-write
```

C-output — два варианта в зависимости от escape analysis:

```c
// Heap layout — если Atomic<T> уходит в Thread.spawn (компилятор вставляет retain/release):
struct Atomic_i32 {
    _Atomic int32_t value;
    atomic_size_t ref_count;
};

// Stack layout — если Atomic<T> не выходит за пределы текущего стека (нет ref_count):
struct Atomic_i32_stack {
    _Atomic int32_t value;
};
```

Escape analysis: компилятор обходит все передачи `Atomic<T>` — если ни одна не попадает в `Thread.spawn` и не возвращается наружу, используется stack layout без ref count.

### AtomicArray<T>

Массив атомарных значений — одна аллокация, все элементы атомарны. Использует C99 Flexible Array Member.

```typescript
// инициализация
const arr = new AtomicArray<i32>(1024)          // нулями, размер 1024
const arr = new AtomicArray<i32>([1, 2, 3, 4]) // из литерала — без двойного цикла
const arr = new AtomicArray<i32>(existing)      // из i32[] — move, без двойного цикла

arr.load(0, LoadOrdering.Acquire)              // i32
arr.store(0, 42, StoreOrdering.Release)        // void
arr.fetchAdd(0, 1, RmwOrdering.AcqRel)         // i32
arr.compareExchange(0, expected, desired,
    RmwOrdering.AcqRel,
    LoadOrdering.Acquire
)                                              // { success: boolean, value: i32 }
arr.length                                     // i32 — bounds checking при каждом обращении
```

C-output (FAM — одна аллокация):
```c
struct AtomicArray_i32 {
    atomic_size_t ref_count;
    size_t length;
    _Atomic int32_t data[];  // данные идут сразу за метаданными (C99 FAM)
};
// аллокация: malloc(sizeof(struct AtomicArray_i32) + sizeof(int32_t) * n)
```

Заметки компилятора:
- **compareExchange zero-cost**: `const { success, value } = arr.compareExchange(...)` — компилятор не создаёт временную структуру на стеке, переменные используются напрямую
- **Relaxed на x86/ARM практически бесплатен** — используй `RmwOrdering.Relaxed` для счётчиков профилировщика и статистики где порядок не важен; значительно быстрее чем JS `Atomics` который всегда использует более тяжёлую семантику
- **Bounds checking**: `length` хранится в структуре — компилятор вставляет проверку индекса при каждом обращении к элементу

### Правила Thread.spawn

| Тип | Разрешено | Поведение |
|-----|-----------|-----------|
| Owned `T` | ✅ | неявный move |
| Примитив | ✅ | copy |
| `Atomic<T>` | ✅ | retain/release автоматически |
| `AtomicArray<T>` | ✅ | retain/release автоматически |
| `Readonly<T>` | ✅ | retain/release автоматически |
| `Ref<T>` / `Mut<T>` | ❌ | ошибка компилятора |
| `Shared<T>` / `Weak<T>` | ❌ | ошибка компилятора |
| `await` внутри callback | ❌ | ошибка компилятора |

Только там где есть OS. Потоки работают как **изоляты** — без общей памяти. Связь через каналы с передачей владения или через `Atomic<T>`.

> **`await` внутри `Thread.spawn` — ошибка компилятора.** Поток не имеет event loop. Блокирующие операции (send, receive) вызываются без `await` — они блокируют OS-поток через mutex/condvar.

### channel<T>

**Bounded MPMC** — кольцевой буфер, одна аллокация. Capacity обязателен.

```typescript
import { Thread, channel, select, after } from "std/threads"

const [tx, rx] = channel<Message>(128)   // capacity = 128

// sender
await tx.send(msg)   // async-контекст: yield event loop если полный (backpressure)
tx.send(msg)         // thread-контекст: блокирует OS-поток если полный
tx.trySend(msg)      // boolean — false если полный, не блокирует (async, thread, ISR ✅)
tx.close()           // закрыть канал; получатель вычитает остаток, затем получает null

// receiver
const msg = await rx.receive()   // async-контекст: yield event loop пока пуст
const msg = rx.receive()         // thread-контекст: блокирует OS-поток пока пуст
rx.tryReceive()                  // Message | null — не блокирует (async, thread, ISR ✅)

// состояние канала — snapshot (ISR-safe ✅, только для мониторинга и адаптивной логики)
tx.size       // i32 — текущее кол-во элементов
tx.capacity   // i32 — максимальная ёмкость
tx.isFull     // boolean — size == capacity
tx.isEmpty    // boolean — size == 0
```

**ISR-safe операции** (`trySend`, `tryReceive`, `size`, `capacity`, `isFull`, `isEmpty`) не делают системных вызовов и не аллоцируют память — безопасны для вызова из прерываний.

**Адаптивный producer в ISR** — типичный паттерн для робототехники и real-time систем:

```typescript
// isFull — бинарная адаптация: два режима качества
@embedded.isr("LIDAR_SCAN")
function onScan(): void {
    const resolution = tx.isFull ? Resolution.Low : Resolution.High
    tx.trySend(captureScan(resolution))   // drop если всё ещё полный
}

// size — градуальная адаптация: три ступени качества
@embedded.isr("CAMERA_FRAME")
function onFrame(): void {
    const quality = tx.size < tx.capacity / 3  ? Quality.High
                  : tx.size < tx.capacity * 2/3 ? Quality.Medium
                  : Quality.Low

    tx.trySend(captureFrame(quality))   // drop если всё ещё полный после адаптации
}
```

`size` и `isFull` — snapshot: значение может измениться к моменту следующей инструкции. Для control flow это допустимо (worst case — один кадр не того качества). Для гарантий «exactly once» использовать `trySend()` — он атомарен.

Ownership: `tx.send(msg)` — move `msg` в канал. При удалении канала с непрочитанными элементами компилятор вызывает деструкторы всех оставшихся объектов.

C-output — кольцевой буфер с MPMC:
```c
typedef struct {
    pthread_mutex_t  mutex;
    pthread_cond_t   not_full;
    pthread_cond_t   not_empty;
    void**           buf;          // ring buffer
    size_t           capacity;
    size_t           head, tail, count;
    atomic_size_t    ref_count;
    bool             closed;
} Channel;
```

### select

Ждёт первого готового из нескольких каналов. Ровно одно поле результата non-null.

`select` — только для **async-контекста** (event loop). В `Thread.spawn` `await` запрещён, поэтому `await select(...)` там не скомпилируется автоматически. Из потока используй `rx.receive()` напрямую.

```typescript
const result = await select({
    msg:     rx1.receive(),   // ждём Message
    err:     errCh.receive(), // ждём AppError
    timeout: after(500)    // таймаут 500 мс
})

// match — единственный type-safe способ потребить result
// компилятор знает все поля select → exhaustiveness проверяется
// внутри каждого arm тип сужен: msg: Message (не Message | null)
match (result) {
    { msg }     => handleMsg(msg),
    { err }     => handleErr(err),
    { timeout } => handleTimeout(),
}
```

`result` — непрозрачный тип (opaque), обращение к полям напрямую (`result.msg`) — ошибка компилятора. Потреблять только через `match`.

`after(ms)` — Timer Task в event loop, не полноценный канал (нет аллокации буфера).

Fairness: перед регистрацией callbacks компилятор обходит каналы в случайном порядке через `tryReceive()`. Если хотя бы один готов — возвращает сразу без регистрации в event loop.

C-output — SelectState:
```c
typedef struct {
    void*    channel;      // указатель на канал или таймер
    void*    result_buf;   // куда писать значение
    size_t   val_size;     // сколько байт копировать
    int      arm_id;       // индекс → имя поля (msg=0, err=1, timeout=2)
} SelectArm;

typedef struct {
    SelectArm*    arms;
    size_t        count;
    atomic_bool   resolved;   // CAS — только один arm побеждает
    atomic_size_t ref_count;  // = count; каждый callback делает release()
    void*         promise;    // резолвить при победе
} SelectState;
```

Результат select — tagged union (экономия стека: в каждый момент заполнено ровно одно поле):
```c
struct SelectResult {
    int arm_id;   // дискриминант: 0=msg, 1=err, 2=timeout
    union {
        Message*  msg;
        AppError* err;
        // для timeout поле не нужно
    } data;
};
```
Компилятор генерирует `SelectResult` по конкретному вызову `select{}` — типы в union известны на этапе компиляции.

Жизненный цикл `SelectState`: `ref_count = arms_count`. Каждый callback (победитель или нет) делает `dec_ref`. Последний вошедший освобождает память. После победы одного — остальные отписываются от своих каналов.

### Readonly<T>

Глубоко иммутабельная обёртка для zero-copy sharing крупных данных между потоками. Compile-time проверка: все поля рекурсивно должны быть примитивами, `string`, `Atomic<T>`, `AtomicArray<T>` или `Readonly<U>`. Любое мутабельное поле — ошибка компилятора.

```typescript
import { Readonly } from "std/threads"

type Config = {
    maxRetries: i32
    timeout:    f64
    hosts:      string[]
}

// создаём один раз — передаём во все потоки
const cfg = new Readonly<Config>({
    maxRetries: 3,
    timeout:    5000.0,
    hosts:      ["a.example.com", "b.example.com"]
})

Thread.spawn(() => {
    // компилятор: cfg._retain() перед spawn
    // компилятор: cfg._release() в конце потока
    console.log(cfg.maxRetries)   // ✅ чтение безопасно из любого потока
    cfg.maxRetries = 5            // ❌ ошибка компилятора: Readonly
})
```

**Правило конструктора:** `new Readonly<T>(expr)` — `<T>` обязателен, `expr` должен быть типа строго `T` (поле-в-поле, без структурных subtypes). После вызова `expr` moved, исходная переменная недоступна.

- Inline литерал: все поля `T` должны присутствовать, лишние поля → ошибка компилятора
- Переменная: форма должна совпадать с `T` точно; subtype с лишними полями → ошибка, т.к. owned поля были бы dropped неявно

```typescript
// ✅ inline литерал — форма совпадает с Config
const cfg = new Readonly<Config>({ maxRetries: 3, timeout: 5000.0, hosts: [...] })

// ✅ переменная — тип точно Config
let c: Config = { maxRetries: 3, timeout: 5000.0, hosts: [...] }
const cfg = new Readonly<Config>(c)

// ❌ subtype с лишним owned полем
let d: DevConfig = { maxRetries: 3, timeout: 5000.0, hosts: [...], logLevel: "debug" }
const cfg = new Readonly<Config>(d)
// error: cannot move DevConfig into Readonly<Config>
//   field 'logLevel: string' would be silently dropped
//   hint: new Readonly<Config>({ maxRetries: d.maxRetries, timeout: d.timeout, hosts: d.hosts })

// ❌ <T> опущен
const cfg = new Readonly({ maxRetries: 3 })
// error: type parameter required: new Readonly<YourType>(...)
```

Нельзя создать `Readonly<T>` если `T` содержит `Shared<U>`, `Weak<U>`, `Ref<U>`, `Mut<U>` или мутабельное поле — ошибка компилятора.

C-output — одна аллокация (`atomic_size_t ref_count` + inline данные):
```c
struct Readonly_Config {
    atomic_size_t ref_count;
    Config data;               // данные сразу за счётчиком
};
// аллокация: malloc(sizeof(struct Readonly_Config))
```

Retain/release генерируется компилятором автоматически на границе `Thread.spawn`. `ref_count` доходит до нуля → вызов деструктора `data` → `free`.

Зачем не `const`: `const` локальная переменная — это гарантия компилятора только в текущем потоке. `Readonly<T>`:
1. **Thread-safe** — атомарный ref count, safe для `Thread.spawn`
2. **Deep** — рекурсивная проверка; `const obj` может хранить `Shared<T>` внутри
3. **Owned** — автоматическое управление памятью

Типичное использование: конфиги, lookup-таблицы, скомпилированные шейдеры, статичные данные уровня — один раз создать, раздать во все потоки без копирования.

```typescript
// ✅ Readonly<T> с Atomic<T> внутри — допустимо
type Stats = {
    hits:   Atomic<i64>   // мутабельный, но сам по себе thread-safe
    misses: Atomic<i64>
}

const stats = new Readonly<Stats>({
    hits:   new Atomic<i64>(0),
    misses: new Atomic<i64>(0)
})

// несколько потоков читают конфиг и пишут в атомики одновременно
Thread.spawn(() => {
    stats.hits.fetchAdd(1, RmwOrdering.Relaxed)   // ✅
})
```

### Thread<T> — типизированный результат

`Thread.spawn` возвращает `Thread<T>`, где `T` выводится из return type callback. Обе формы получения результата валидны и компилируются в идентичный C-output:

```typescript
// Форма 1: Thread<T> — сахар для простого "запустить и получить результат"
const t = Thread.spawn(() => heavyComputation())   // Thread<HeavyResult>

const result = await t.join()   // из async-контекста — не блокирует event loop
// const result = t.join()      // из другого потока — блокирует OS thread

// Форма 2: явный канал — для сложных случаев (стриминг, несколько значений, select)
const [tx, rx] = channel<HeavyResult>(1)
Thread.spawn(() => { tx.send(heavyComputation()) })
const result = await rx.receive()
```

Под капотом `Thread<T>` — это `channel<T>(1)`, генерируемый компилятором автоматически. Никакой скрытой магии — только удобная обёртка над явным примитивом.

Если поток бросает — ошибка propagates через `join()`:

```typescript
const t = Thread.spawn(() => {
    if (fail) throw new IOError("disk full")
    return computeResult()
})

try {
    const result = await t.join()   // throws IOError если поток упал
} catch (e: IOError) { ... }
```

`Thread<void>` — для потоков без результата, `join()` используется только как точка синхронизации:

```typescript
const t = Thread.spawn(() => { doWork() })
await t.join()   // ждём завершения, результата нет
```

**Когда какую форму использовать:**

| Задача | Форма |
|--------|-------|
| Запустить и получить один результат | `Thread<T>` + `await t.join()` |
| Стримить несколько значений | явный `channel<T>` |
| Несколько потоков → один получатель | явные каналы + `select` |
| Сложная координация | явные каналы |

**Async и threads — два намеренно разделённых мира:**

`await` внутри `Thread.spawn` — ошибка компилятора. Поток не имеет event loop. Блокирующие операции (`send`, `receive`, `t.join()`) вызываются без `await` и блокируют OS-поток через mutex/condvar. Канал — единственный bridge между ними:

```
Event loop:   await rx.receive()  ←──────────────┐  неблокирующий
                                               │
Thread:       tx.send(result)  ────────────────┘  блокирующий (если полный)
```

```typescript
import { Thread, channel, select, after } from "std/threads"

async function main(): void {
    const [tx, rx] = channel<i32[]>(64)

    const t = Thread.spawn(() => {
        // тяжёлые вычисления в отдельном потоке
        const result = heavyComputation()
        tx.send(result)   // move владения в канал
    })

    const result = await rx.receive()   // ждём результат
    t.join()
    console.log(result)
}
```

**Global State в контексте потоков:**

```typescript
const CONFIG = { maxRetries: 3 };     // const — ok, читать из потоков можно
let counter = 0;                       // ошибка компилятора если Thread.spawn захватывает
const ac = new Atomic<i32>(0);         // Atomic<T> — ok из потоков

class Server {
    static count: i32 = 0;             // mutable static — ошибка при захвате в Thread.spawn
    static readonly MAX: i32 = 100;    // const static — ok
}
```

Компилятор проверяет захваченные переменные **на границе `Thread.spawn`**:
- Мутабельный `let` или глобаль → ошибка компилятора
- `Shared<T>` или `Weak<T>` → ошибка компилятора
- `Ref<T>` / `Mut<T>` → ошибка компилятора
- `await` внутри callback → ошибка компилятора
- Owned `T` → неявный move, **с рекурсивной проверкой полей** (см. ниже)
- Примитив → copy
- `Atomic<T>` / `AtomicArray<T>` / `Readonly<T>` → retain/release автоматически

**Рекурсивная Send-проверка owned типов:**

Перед move в `Thread.spawn` компилятор рекурсивно обходит все поля типа. Тип считается thread-safe если каждое поле является:
- примитивом
- `string` (owned, после move принадлежит потоку)
- `Atomic<T>` / `AtomicArray<T>` / `Readonly<T>`
- другим owned типом, рекурсивно прошедшим ту же проверку

Любое поле `Shared<U>`, `Weak<U>`, `Ref<U>`, `Mut<U>` — ошибка компилятора с указанием пути к проблемному полю:

```typescript
class Node {
    value: i32
    next: Shared<Node>   // ← проблема
}

const n = new Node()
Thread.spawn(() => { use(n) })
// error: cannot send `Node` to thread
//   field `next: Shared<Node>` is not thread-safe
//   hint: use Atomic<T>, channel<T>, or Readonly<T> for shared state
```

```typescript
class Message {
    id:   i32
    body: string   // ok — owned string, после move принадлежит потоку
}

const msg = new Message(1, "hello")
Thread.spawn(() => { process(msg) })  // ✅ — все поля thread-safe
```

---

## 3. @embedded.isr — только Embedded

ISR — аппаратное прерывание. Не поток, не closure. Никакого захвата контекста.

### Volatile<T> — регистры MMIO

`Volatile<T>` гарантирует что каждое чтение/запись доходит до памяти (не кэшируется в регистр процессора). Транслируется в `volatile T*` в C. Используется исключительно для Memory-Mapped I/O.

```typescript
import { Volatile, pointer } from "std/embedded"

// описываем регистры периферии — type гарантирует: никакого vtable, только data
type UartRegs = {
    dr:        Volatile<u32>   // Data Register
    rsr:       Volatile<u32>   // Status Register
    _reserved: u32[4]          // пропуск памяти
    fr:        Volatile<u32>   // Flag Register
}

// маппинг на физический адрес
const UART0 = pointer<UartRegs>(0x101f1000)

UART0.dr.write(0x41)              // C: *(volatile uint32_t*)0x101f1000 = 0x41
const status = UART0.fr.read()   // C: *(volatile uint32_t*)0x101f1018 — не кэшируется
```

> `Volatile<T>` ≠ `Atomic<T>`: атомики используют инструкции синхронизации которые периферия не понимает. Для MMIO регистров — только `Volatile<T>`.

Два гарантии `Volatile<T>`:
1. **No cache** — каждое чтение/запись физически идёт на шину, не кэшируется в регистр процессора
2. **No reordering** — компилятор не переставляет инструкции чтения/записи `Volatile<T>` относительно друг друга (критично для последовательности инициализации периферии)

### @embedded.isr

Функция-прерывание. Только embedded платформы.

**Сигнатура:** всегда `(): void` — без параметров, без возвращаемого значения, без `throws`. Любое отклонение — ошибка компилятора:
```typescript
@embedded.isr(14)
function handler(): void { ... }          // ✅

@embedded.isr(14)
function handler(x: i32): void { ... }   // ❌ параметры запрещены

@embedded.isr(14)
function handler(): i32 { ... }          // ❌ return type должен быть void

@embedded.isr(14)
function handler(): void throws IOError { ... }  // ❌ throws запрещён
```

Два варианта аргумента:

```typescript
@embedded.isr("TIMER1_OVF")   // по имени вектора — AVR (avr-libc naming)
@embedded.isr(14)              // по номеру вектора — ARM Cortex-M (IRQn)
```

Пример:

```typescript
import { Atomic, RmwOrdering } from "std/threads"

// type — stack-allocated struct, не class (нет heap)
type TimerEvent = { irq: u32; tick: u32 }

static readonly irqCount = new Atomic<u32>(0)
static readonly [tx, rx] = channel<TimerEvent>(32)

@embedded.isr(14)   // ARM Cortex-M: IRQ14
function onTimerInterrupt(): void {
    // Atomic<T> — ok
    irqCount.fetchAdd(1, RmwOrdering.Relaxed)

    // type-литерал — stack allocation, не heap
    const ev: TimerEvent = { irq: 14, tick: irqCount.load(RmwOrdering.Relaxed) }
    tx.trySend(ev)   // non-blocking

    // Volatile<T> — ok
    TIMER_REG.sr.write(0x0)   // сброс флага прерывания
}

@embedded.isr("TIMER1_OVF")   // AVR: именованный вектор
function onTimerOverflow(): void {
    irqCount.fetchAdd(1, RmwOrdering.Relaxed)
}
```

Компилятор генерирует платформенный атрибут:
```c
// GCC/Clang (ARM Cortex) — числовой аргумент
__attribute__((interrupt("IRQ")))
void onTimerInterrupt(void) { ... }

// AVR — строковый аргумент
ISR(TIMER1_OVF_vect) {
    counter++;
}
```

Context saving — полностью на стороне C компилятора через `__attribute__((interrupt))`. TSC не генерирует код сохранения регистров.

**Ошибка на desktop:**

```typescript
@embedded.isr("TIMER1_OVF")  // ❌ error: ISR not supported on "desktop"
function onTimer(): void {
    counter++;
}
```

**Когда использовать:**
- Hardware interrupts (timer, UART, external)
- Альтернатива — native, но менее удобно

**Сравнение с native:**

```typescript
// ✅ Через @embedded.isr — удобно
@embedded.isr("TIMER1_OVF")
function onTimer(): void {
    counter++;
}

// ⚠️ Через native — неудобно, разрывает код
native `ISR(TIMER1_OVF_vect) {`;
counter++;
native `}`
```

### Правила @embedded.isr

| Операция | Разрешено |
|----------|-----------|
| `Atomic<T>` / `AtomicArray<T>` | ✅ |
| `Volatile<T>` (MMIO) | ✅ |
| `tx.trySend()` / `rx.tryReceive()` | ✅ (не блокирует) |
| Примитивы на стеке (`i32`, `u8`, etc.) | ✅ |
| `type`-литералы на стеке (`{ field: u32 }`) | ✅ (stack allocation) |
| Модульные переменные (`static`, `const`, `let` на уровне модуля) | ✅ (статическая память) |
| Фиксированные массивы `T[N]` | ✅ (стек) |
| `await` | ❌ ошибка компилятора |
| `new` (heap allocation) | ❌ ошибка компилятора |
| `tx.send()` / `rx.receive()` (блокирующие) | ❌ ошибка компилятора |
| `Shared<T>` / `Weak<T>` | ❌ ошибка компилятора |
| String concatenation | ❌ ошибка компилятора (heap) |
| `Map`, `Set` операции | ❌ ошибка компилятора (heap) |
| `throw` / `throws` | ❌ ошибка компилятора |
| `interrupts.disable()` внутри ISR | ❌ ошибка компилятора (прерывания уже отключены) |
| Два `@embedded.isr` с одним вектором | ❌ ошибка компилятора (duplicate vector) |

**Почему heap запрещён в ISR:**
1. **Safety** — аллокация может завершиться OOM → crash системы
2. **Determinism** — heap имеет непредсказуемое время → нарушение real-time
3. **Atomicity** — аллокатор использует блокировки → deadlock внутри ISR
4. **Stack** — аллокация требует стекового пространства, ISR работает на ограниченном стеке

Ошибка компилятора:
```
error[TSC-E081]: heap allocation in ISR context
  --> src/handler.tsc:5:10
    |
  5 |     const ev = new Event(14)
    |                ^^^^^^^^^^^^^ heap allocation forbidden in ISR
    |
    = hint: use pre-allocated buffer or static data structure
    = note: use global buffer or channel + trySend instead
```

**Правильные паттерны:**

```typescript
// ✅ Примитив на стеке + канал
const _sensorChannel = channel<u16>(32)

@embedded.isr(14)
function handler(): void {
    const reading: u16 = ADC.read()       // примитив — стек, не heap
    _sensorChannel.trySend(reading)       // non-blocking
}

// ✅ Глобальный статический буфер
const _buffer: u8[64] = [0, ...]
let _bufferLen: i32 = 0

@embedded.isr("UART_RX")
function uartRx(): void {
    if (_bufferLen < 64) {
        _buffer[_bufferLen++] = UART.read()
    }
}

// ✅ Atomic счётчик
const _counter = new Atomic<u32>(0)

@embedded.isr("TIMER1_OVF")
function timerOverflow(): void {
    _counter.fetchAdd(1, RmwOrdering.Relaxed)
}
```

**Вызов функций из ISR:** компилятор проверяет только прямые операции внутри ISR-функции. Если вызываемая функция внутри делает `new` или `await` — ошибка выдаётся на месте нарушения, не на месте вызова. Ответственность за ISR-safety вызываемых функций — на разработчике.

`std/threads` на embedded targets — ошибка компилятора (нет OS).

### std/sync — критические секции (embedded)

Для безопасного доступа к составным данным которые меняет IRQ — временный запрет прерываний:

```typescript
import { interrupts } from "std/sync"

interrupts.disable(() => {
    // прерывания выключены на время выполнения лямбды
    // гарантирует атомарность группы операций
    const snapshot = sensorData.x  // читаем составную структуру безопасно
    const y = sensorData.y
    process(snapshot, y)
})
// прерывания автоматически включаются по выходу
```

C-output (платформозависимый):
```c
// ARM Cortex-M
__asm volatile("cpsid i");   // disable interrupts
{ /* тело лямбды */ }
__asm volatile("cpsie i");   // enable interrupts

// x86
__asm volatile("cli");
{ /* тело лямбды */ }
__asm volatile("sti");

// AVR
uint8_t sreg = SREG; cli();
{ /* тело лямбды */ }
SREG = sreg;  // восстанавливаем флаги (не просто sei())
```

> Внутри `interrupts.disable()` те же ограничения что и в `@embedded.isr`: нет `await`, нет `new`.

### EmbeddedSignal — мост ISR → async

`channel<T>` подходит для передачи данных из ISR в async-код, но для простых событий без полезной нагрузки (ADC готов, таймер сработал, кнопка нажата) он избыточен: занимает буфер и требует обёртку.

`EmbeddedSignal` — нулевой overhead: один `volatile bool` в BSS.

```typescript
import { EmbeddedSignal } from "std/embedded"

// статически выделяется в BSS — не heap
const adcReady = new EmbeddedSignal()

@embedded.isr("ADC_vect")
function adc_isr(): void {
    ADCSRA  // сброс флага прерывания (читаем регистр)
    adcReady.set()    // ✅ ISR-safe: просто volatile bool = true
}

async function readADC(): u16 {
    ADCSRA |= (1 << 6)         // запускаем преобразование
    await adcReady.wait()      // ждём сигнала от ISR
    return ADCL | (ADCH << 8)
}
```

C-output:

```c
// BSS — один volatile bool
static volatile bool _sig_adcReady = false;

// ISR — один store
ISR(ADC_vect) {
    (void)ADCSRA;
    _sig_adcReady = true;
}

// State machine poll для readADC
bool readADC_poll(ReadADC_SM* sm) {
    switch (sm->_state) {
    case 0:
        ADCSRA |= (1 << 6);
        sm->_state = 1;
        return false;
    case 1:
        if (!_sig_adcReady) return false;   // ещё не готово — выходим
        _sig_adcReady = false;              // auto-reset
        sm->_result = ADCL | (ADCH << 8);
        sm->_state = 0xFF;
        return true;
    }
}
```

Никакого heap, никакого рантайма. Главный цикл просто опрашивает state machines:

```c
// main loop (кооперативный планировщик):
while (1) {
    readADC_poll(&sm_readADC);
    processData_poll(&sm_processData);
    // ...
}
```

**API:**

```typescript
class EmbeddedSignal {
    set(): void         // ISR-safe: устанавливает флаг (volatile store)
    wait(): Promise<void>  // async: опрашивает флаг; auto-reset при срабатывании
    clear(): void       // ручной сброс (если нужен без await)
    readonly isSet: bool   // ISR-safe: проверка без ожидания
}
```

**Правила:**
- `new EmbeddedSignal()` компилируется в один бит в `volatile uint32_t` в BSS — без heap
- `await signal.wait()` разрешён только в `async` функции
- `signal.set()` / `signal.isSet` / `signal.clear()` разрешены в ISR
- Один `EmbeddedSignal` на одно событие: если несколько ISR могут сигналить — использовать `channel<T>` или отдельный signal на каждый

#### Оптимизация: автоматическая битовая упаковка

Компилятор собирает все `EmbeddedSignal` в модуле и упаковывает их в один `volatile uint32_t` (bank). Каждый сигнал — один бит. Это даёт быструю проверку в главном цикле: **один `if` на все 32 события разом**.

Если сигналов больше 32 — компилятор автоматически добавляет второй bank. Синтаксис TSC не меняется.

**C-output для трёх сигналов:**

```c
// Один volatile uint32_t вместо трёх volatile bool
static volatile uint32_t _sig_bank_0 = 0;
#define _SIG_adcReady    (1u << 0)
#define _SIG_timerTick   (1u << 1)
#define _SIG_buttonPress (1u << 2)

// ISR: set-only — один OR, атомарно на большинстве платформ
ISR(ADC_vect)       { _sig_bank_0 |= _SIG_adcReady;    }
ISR(TIMER1_OVF_vect){ _sig_bank_0 |= _SIG_timerTick;   }
ISR(INT0_vect)      { _sig_bank_0 |= _SIG_buttonPress;  }

// Главный цикл — быстрый путь
void main_loop(void) {
    while (1) {
        if (!_sig_bank_0) continue;   // ← нет событий — пропускаем ВСЁ

        // Snapshot-and-clear: атомарный снимок
        // AVR: cli/sei (8 тактов); Cortex-M: LDREX/STREX (без блокировки прерываний)
        uint32_t pending = _tsc_signal_snapshot(&_sig_bank_0);

        if (pending & _SIG_adcReady)    readADC_poll(&sm_readADC);
        if (pending & _SIG_timerTick)   onTimer_poll(&sm_onTimer);
        if (pending & _SIG_buttonPress) onButton_poll(&sm_onButton);
    }
}
```

Платформенная реализация `_tsc_signal_snapshot`:

```c
// AVR: прерывания на 2 инструкции
static inline uint32_t _tsc_signal_snapshot(volatile uint32_t *bank) {
    uint8_t sreg = SREG; cli();
    uint32_t v = *bank; *bank = 0;
    SREG = sreg;
    return v;
}

// ARM Cortex-M: lock-free (LDREX/STREX)
static inline uint32_t _tsc_signal_snapshot(volatile uint32_t *bank) {
    uint32_t v;
    do { v = __LDREX(bank); } while (__STREX(0, bank));
    return v;
}
```

**Выгода:** на системе в режиме ожидания (idle) — ни одного лишнего вызова `poll()`. Экономия тактов и потребления батареи пропорциональна числу задач.

**Когда что использовать:**

| Сценарий | Инструмент |
|----------|-----------|
| ISR → флаг "событие произошло" | `EmbeddedSignal` |
| ISR → передача данных (ADC value, UART byte) | `channel<T>.trySend()` |
| ISR → разделяемый счётчик | `Atomic<T>.fetchAdd()` |
| ISR → сложная составная структура | `interrupts.disable()` + глобальная переменная |

### Итоговая таблица Low-level инструментов

| Задача | TSC синтаксис | Гарантия |
|--------|---------------|----------|
| MMIO регистры | `Volatile<T>` | Прямое обращение к шине, no reorder |
| Обработчик прерывания | `@embedded.isr(N)` / `@embedded.isr("NAME")` | `__attribute__((interrupt))`, context saved |
| Общее состояние с IRQ | `static Atomic<T>` | Атомарный доступ без гонок |
| Составные данные с IRQ | `interrupts.disable()` | Критическая секция |
| Сигнал ISR → async (нет данных) | `EmbeddedSignal` | бит в `uint32_t`, auto-reset, быстрый idle |
| Данные ISR → async (поток) | `channel.trySend()` | Передача без блокировки |

---

## 4. Embedded-аннотации

Декораторы для fine-grained контроля над поведением на embedded платформах.

### `@embedded.inline`

Принудительный инлайн функции. Без декоратора — решение за C компилятором.

```typescript
@embedded.inline
function setBit(reg: Mut<u8>, bit: u8): void {
    reg |= (1 << bit);
}
```

Генерирует:
```c
static inline void setBit(volatile uint8_t* reg, uint8_t bit) {
    *reg |= (1 << bit);
}
```

**Когда использовать:**
- Критичные к производительности участки
- Очень маленькие функции (set bit, read register)
- Когда C-компилятор не инлайнит сам

**Альтернатива через native:**

```typescript
// Макрос в C — тоже inline
native `#define SET_BIT(reg, bit) ((reg) |= (1 << (bit)))`;
```

Доступен на всех платформах (desktop, embedded).

### `@embedded.noHeap`

Статическая проверка компилятором: функция не использует heap.

```typescript
@embedded.noHeap
function process(data: Ref<u8[]>): i32 {
    // ❌ ошибка компиляции: new Array использует heap
    const temp = new Array<u8>(10);
    
    // ❌ ошибка: new Map использует heap
    const map = new Map<string, i32>();
    
    // ✅ ok: stack allocation (fixed size)
    const temp: u8[10] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    
    // ✅ ok: borrowed reference
    return data.length;
}
```

**Когда использовать:**
- ISR (прерывания) — heap внутри ISR = crash
- Функции в no-heap платформах
- Явное документирование ограничений

**Альтернатива через `declare platform`:**

```typescript
// В platform profile
declare platform {
    heap: false  // Компилятор проверит все new Array/Map
}
```

Доступен на всех платформах (desktop, embedded).

### `@signal` — POSIX-сигналы (desktop)

Аналог `@embedded.isr` для desktop — обработка POSIX-сигналов.

```typescript
@signal("SIGINT")
function onInterrupt(): void {
    console.log("Ctrl+C pressed");
    cleanup()
    process.exit(0)
}

@signal("SIGTERM")
function onTerminate(): void {
    console.log("Termination requested");
    gracefulShutdown()
}

@signal("SIGHUP")
function onHangup(): void {
    console.log("SIGHUP received");
    reloadConfig();
}
```

**Безопасность:** `@signal` реализован через libuv (`uv_signal_t`), а не через прямой `signal()`. Настоящий C signal handler только пишет байт в pipe; callback вызывается в event loop. Поэтому внутри `@signal` хэндлера доступен любой TSClang-код — `console.log`, async-вызовы и др.

C-output:
```c
// callback вызывается в event loop (async-signal-safe)
static void _onInterrupt(uv_signal_t* handle, int signum) {
    printf("Ctrl+C pressed\n");
    cleanup();
    exit(0);
}

// В main() — регистрация через libuv
uv_signal_t _sig_int, _sig_term, _sig_hup;
uv_signal_init(loop, &_sig_int);  uv_signal_start(&_sig_int, _onInterrupt, SIGINT);
uv_signal_init(loop, &_sig_term); uv_signal_start(&_sig_term, _onTerminate, SIGTERM);
uv_signal_init(loop, &_sig_hup);  uv_signal_start(&_sig_hup, _onHangup, SIGHUP);
```

Поддерживаемые сигналы:

| Сигнал | Когда |
|--------|-------|
| `SIGINT` | Ctrl+C |
| `SIGTERM` | kill (graceful) |
| `SIGHUP` | Terminal closed / reload config |
| `SIGUSR1`, `SIGUSR2` | User-defined |
| `SIGPIPE` | Broken pipe |
| `SIGALRM` | Timer |

На embedded `@signal` → ошибка компиляции.

### Сводная таблица аннотаций

| Аннотация | Desktop | Embedded | Проверка |
|-----------|---------|----------|----------|
| `@embedded.inline` | ✅ | ✅ | — |
| `@embedded.noHeap` | ✅ | ✅ | Compile-time |
| `@embedded.isr` | ❌ | ✅ | Compile-time |
| `@signal` | ✅ | ❌ | Compile-time |


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
async function* readLines(path: string): AsyncIterator<string> throws IOError {
    const fd = await openFile(path)
    try {
        while (true) {
            const line: string | null = await fd.readLine()
            if (line == null) break
            yield line   // move semantics — передаёт ownership caller'у
        }
    } finally {
        await fd.close()   // выполняется и при break, и при close()
    }
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
for await (const line of readLines("data.txt")) {
    if (line.startsWith("#")) break   // → вызывает gen.close() → finally
    process(line)
}
// close() вызывается автоматически при: break, throw, нормальном завершении
```

`for await` — sugar над `AsyncIterator<T>`:

```typescript
// десахаривается в:
const _gen = readLines("data.txt")
try {
    while (true) {
        const line = await _gen.next()
        if (line == null) break
        // body
        if (shouldBreak) break
    }
} finally {
    await _gen.close()
}
```

### close() семантика

`close()` не прерывает pending `await` — устанавливает флаг. Генератор проверяет флаг после текущего `await`, пропускает следующий `yield`, выполняет `finally`.

```typescript
// close() вызван пока генератор ждёт fd.readLine()
// → readLine() завершается нормально
// → генератор видит флаг close
// → не делает yield, переходит в finally → fd.close()
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
const gen = readLines("data.txt")
gen.throw(new IOError("injected"))   // генератор увидит ошибку при следующем yield
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
typedef enum {
    GEN_STATE_INIT,
    GEN_STATE_AWAIT_OPEN,      // await openFile
    GEN_STATE_AWAIT_READLINE,  // await fd.readLine
    GEN_STATE_YIELDED,         // ожидание следующего next()
    GEN_STATE_FINALLY,         // await fd.close()
    GEN_STATE_DONE,
    GEN_STATE_ERROR
} ReadLinesState;

typedef struct {
    ReadLinesState state;
    FileHandle*    fd;
    String*        yielded_value;   // значение между yield и next()
    IOError*       error;
    bool           close_requested;
} ReadLinesGen;

// next() принимает callback: (value, done, error, userdata)
void readlines_next(ReadLinesGen* g,
    void (*cb)(String* val, bool done, IOError* err, void* ud), void* ud);
void readlines_close(ReadLinesGen* g, void (*cb)(void* ud), void* ud);
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
/* C-output */
typedef struct { uint8_t channel; uint8_t _state; } _AdcSamplerGen;
static _AdcSamplerGen _adcSampler_instance;   /* BSS, не heap */

static bool adcSampler_next(_AdcSamplerGen* g, uint16_t* out) {
    switch (g->_state) {
    case 0: g->_state = 1;
    case 1:
        *out = ADC_read(g->channel);
        return true;
    }
    return false;
}
```

На `allocator: "none"` — `async function*` с heap-аллокацией → ошибка компилятора. Без `@static` и без `allocator: "none"` также ошибка. `@static` обязателен при `allocator: "static"`.

Обычные (синхронные) генераторы (`function*` без `async`) всегда работают на стеке — heap не требуется ни на каких платформах.

#### `@embedded.singleton` — единственный экземпляр генератора

Семантически эквивалентен `@static function*`, но явно выражает намерение: один экземпляр state machine на всю программу, живёт в BSS.

```typescript
@embedded.singleton
function* scanline(): Generator<u8[256]> {
    while (true) {
        yield renderLine()
    }
}
```

```c
// C-output — статическая state machine
static struct {
    uint8_t state;
    uint8_t line[256];
} scanline_gen;

bool scanline_next(void) {
    renderLine(scanline_gen.line);
    return true;  // бесконечный
}
```

`@embedded.singleton` применяется только к `function*` — ошибка компилятора на любом другом таргете.

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

@embedded.isr("USART_RX")
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

## 6. Кооперативная многозадачность через генераторы

Паттерн для "параллельного" выполнения нескольких задач без потоков и без OS.
Каждая задача — генератор, `yield` уступает управление следующей. Round-robin loop тикает все задачи по очереди.

Работает на любой платформе. На embedded — основной способ многозадачности.

```typescript
function* inputTask(): Generator<void> {
    while (true) {
        if (keyboard.available()) {
            handleKey(keyboard.read())
        }
        yield
    }
}

function* logicTask(): Generator<void> {
    while (true) {
        updateLogic()
        yield
    }
}

function* renderTask(): Generator<void> {
    while (true) {
        renderScreen()
        yield
    }
}

function main(): void {
    const tasks = [inputTask(), logicTask(), renderTask()]
    while (true) {
        for (const t of tasks) t.next()
    }
}
```

```c
// C-output — три state machine, round-robin без heap
static InputTask_state input_task;
static LogicTask_state logic_task;
static RenderTask_state render_task;

void main(void) {
    while (1) {
        InputTask_next(&input_task);
        LogicTask_next(&logic_task);
        RenderTask_next(&render_task);
    }
}
```

**Размер:** каждая task ≈ 4–16 байт (зависит от живых переменных через `yield`).

| Подход | Heap | Сложность | Применение |
|--------|------|-----------|-----------|
| Sync polling | нет | низкая | простой loop, одна задача |
| **Generators round-robin** | нет | средняя | несколько задач, embedded и desktop |
| Async/Await + runtime | нужен | высокая | desktop/server |
| Threads | нужен | высокая | CPU-bound, OS |

---

## Итоговая картина

```
┌─────────────────────────────────────────────────────┐
│  TSC Concurrency Model                               │
│                                                      │
│  async/await ──── event loop ──── все платформы      │
│       │                                              │
│       └── async generators / for await ─ heap only  │
│       │                                              │
│       └── Shared<T>/Weak<T> не атомарны              │
│       └── Weak narrowing безопасен                   │
│                                                      │
│  std/threads ───── isolates ────── OS only            │
│       │                                              │
│       ├── channel<T>: передача владения              │
│       ├── Atomic<T> / AtomicArray<T>: shared счётчики│
│       ├── Readonly<T>: zero-copy immutable sharing   │
│       └── компилятор проверяет на Thread.spawn       │
│                                                      │
│  @embedded.isr ─── ISR ─────────── embedded only     │
│       │                                              │
│       └── только Volatile<T> + Atomic<T>             │
│       └── нет захвата контекста                      │
│                                                      │
│  @signal ──────── POSIX signal ──── desktop only     │
│                                                      │
│  @platform ────── условная компиляция ─── все        │
│  @embedded.inline / @embedded.noHeap ──── все        │
└─────────────────────────────────────────────────────┘
```
