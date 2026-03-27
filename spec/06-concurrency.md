# TSClang — Конкурентность

## Уровни модели

TSC разделяет конкурентность на три независимых механизма:

| Механизм | Платформа | Уровень |
|----------|-----------|---------|
| `async/await` | все | стандартный |
| `std/threads` | OS (desktop/server) | продвинутый |
| `@interrupt` | embedded (AVR/Cortex) | системный |

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

TSC-код не знает какой runtime под капотом — работает с абстракцией. Runtime задаётся в `tsc.packages.json` через поле `"runtime"`. `std/fs`, `std/net`, `std/ws` зависят от этого runtime.

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
} catch (e) {
    if (e instanceof IOError) { ... }
    else if (e instanceof NetworkError) { ... }
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

### Отмена задач — AbortSignal

Кооперативная отмена async операций. Компилятор вставляет проверку флага автоматически — разработчик пишет только бизнес-логику.

```typescript
const controller = new AbortController()
const signal = controller.signal

// отменяем через 5 секунд
setTimeout(() => controller.abort(new TimeoutError()), 5000)

try {
    const data = await fetch(url, { signal })
} catch (e) {
    if (e instanceof AbortError) console.log("отменено:", e.cause)
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

> **`await` внутри `Thread.spawn` — ошибка компилятора.** Поток не имеет event loop. Блокирующие операции (send, recv) вызываются без `await` — они блокируют OS-поток через mutex/condvar.

### channel<T>

**Bounded MPMC** — кольцевой буфер, одна аллокация. Capacity обязателен.

```typescript
import { Thread, channel, select, after } from "std/threads"

const [tx, rx] = channel<Message>(128)   // capacity = 128

// sender
await tx.send(msg)   // async-контекст: yield event loop если полный (backpressure)
tx.send(msg)         // thread-контекст: блокирует OS-поток если полный
tx.trySend(msg)      // boolean — false если полный, не блокирует (оба контекста)
tx.close()           // закрыть канал; получатель вычитает остаток, затем получает null

// receiver
const msg = await rx.recv()   // async-контекст: yield event loop пока пуст
const msg = rx.recv()         // thread-контекст: блокирует OS-поток пока пуст
rx.tryRecv()                  // Message | null — не блокирует (оба контекста)
```

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

`select` — только для **async-контекста** (event loop). В `Thread.spawn` `await` запрещён, поэтому `await select(...)` там не скомпилируется автоматически. Из потока используй `rx.recv()` напрямую.

```typescript
const result = await select({
    msg:     rx1.recv(),   // ждём Message
    err:     errCh.recv(), // ждём AppError
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

Fairness: перед регистрацией callbacks компилятор обходит каналы в случайном порядке через `tryRecv()`. Если хотя бы один готов — возвращает сразу без регистрации в event loop.

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
const result = await rx.recv()
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
} catch (e) { ... }
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

`await` внутри `Thread.spawn` — ошибка компилятора. Поток не имеет event loop. Блокирующие операции (`send`, `recv`, `t.join()`) вызываются без `await` и блокируют OS-поток через mutex/condvar. Канал — единственный bridge между ними:

```
Event loop:   await rx.recv()  ←──────────────┐  неблокирующий
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

    const result = await rx.recv()   // ждём результат
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

## 3. @interrupt — только Embedded

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

### @interrupt

```typescript
import { Atomic, RmwOrdering } from "std/threads"

static readonly irqCount = new Atomic<u32>(0)
static readonly [tx, rx] = channel<Event>(32)

@interrupt(14)    // номер вектора IRQ
function onTimerInterrupt(): void {
    // Atomic<T> — ok
    irqCount.fetchAdd(1, RmwOrdering.Relaxed)

    // channel trySend — ok (не блокирует)
    tx.trySend(new Event(14))

    // Volatile<T> — ok
    TIMER_REG.sr.write(0x0)   // сброс флага прерывания
}
```

Компилятор генерирует платформенный атрибут:
```c
// GCC/Clang (ARM Cortex)
__attribute__((interrupt("IRQ")))
void onTimerInterrupt(void) { ... }

// AVR
ISR(TIMER0_OVF_vect) { ... }
```

Context saving — полностью на стороне C компилятора через `__attribute__((interrupt))`. TSC не генерирует код сохранения регистров.

### Правила @interrupt

| Операция | Разрешено |
|----------|-----------|
| `Atomic<T>` / `AtomicArray<T>` | ✅ |
| `Volatile<T>` (MMIO) | ✅ |
| `tx.trySend()` | ✅ (не блокирует) |
| `await` | ❌ ошибка компилятора |
| `new` (heap allocation) | ❌ ошибка компилятора |
| `await tx.send()` (блокирующий) | ❌ ошибка компилятора |
| Owned / `Shared<T>` / `Ref<T>` | ❌ ошибка компилятора |
| Обычные переменные программы | ❌ ошибка компилятора |

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

> Внутри `interrupts.disable()` те же ограничения что и в `@interrupt`: нет `await`, нет `new`.

### Итоговая таблица Low-level инструментов

| Задача | TSC синтаксис | Гарантия |
|--------|---------------|----------|
| MMIO регистры | `Volatile<T>` | Прямое обращение к шине, no reorder |
| Обработчик прерывания | `@interrupt(N)` | `__attribute__((interrupt))`, context saved |
| Общее состояние с IRQ | `static Atomic<T>` | Атомарный доступ без гонок |
| Составные данные с IRQ | `interrupts.disable()` | Критическая секция |
| Связь IRQ → основной код | `channel.trySend()` | Передача без блокировки |

---

## Итоговая картина

```
┌─────────────────────────────────────────────────────┐
│  TSC Concurrency Model                               │
│                                                      │
│  async/await ──── event loop ──── все платформы      │
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
│  @interrupt ────── ISR ─────────── embedded only     │
│       │                                              │
│       └── только Volatile<T> + Atomic<T>             │
│       └── нет захвата контекста                      │
└─────────────────────────────────────────────────────┘
```
