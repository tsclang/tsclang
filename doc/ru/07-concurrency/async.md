# Async/Await — стандартный способ

[← Вверх](./index.md) | [Следующий →](./promise.md) | [Предыдущий ←](./index.md)

---

`async/await` — основной механизм конкурентности в TSC. Работает на **всех платформах**: desktop (libuv/io_uring), embedded (poll loop, без heap).

## Архитектура

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

Единственный event loop, один поток исполнения. `Shared<T>` и `Weak<T>` **не атомарны** — никаких накладных расходов.

## async-функции

```typescript
async function fetchUser(id: i32): User throws NetworkError {
    const conn = await connect("https://api.example.com");
    const data = await conn.get(`/users/${id}`);
    return User.parse(data);
}
```

Компилятор выводит `Promise<T>` как возвращаемый тип. Обе записи эквивалентны:

```typescript
async function fetchUser(id: i32): User { ... }           // Promise<User> выводится
async function fetchUser(id: i32): Promise<User> { ... }  // явно
```

На **embedded** `async fn` компилируется в state machine без runtime, без heap:

```c
typedef struct { int _state; /* захваченные переменные */ } FetchUserTask;
bool FetchUserTask_poll(FetchUserTask* t) { switch (t->_state) { ... } }
```

## State machine

Struct содержит только переменные, **живые через хотя бы один await**. Переменная, использованная до await и больше не нужная, в struct не попадает:

```typescript
async function op(): Result {
    const tmp = heavyCompute()    // tmp не переживает await → НЕ попадает в struct
    const a = await step1(tmp)    // tmp мёртв здесь
    const b = await step2(a)      // struct: { _state, a, b } — только живые
}
```

### Размер и alignment

**Формула:**

```
sizeof(StateMachine) = sizeof(_state) + sum(sizeof(V) for V in live_vars) + padding
```

| Платформа | Тип `_state` | Размер | Alignment |
|-----------|-------------|--------|-----------|
| AVR | `uint8_t` | 1 B | 1 B |
| ARM Cortex-M | `uint32_t` | 4 B | 4 B |
| x86-64 | `int32_t` | 4 B | 8 B |

Максимальное число состояний: количество await-точек + 2 (`STATE_INIT`, `STATE_DONE`). На AVR — максимум 253 await-точки.

### throws overhead

`async fn throws E` добавляет к state machine хранение ошибки:

```c
typedef struct {
    uint8_t        _state;
    /* живые переменные */
    bool           _ok;
    union {
        ReturnType _value;
        ErrorType  _error;
    };
} AsyncThrowsTask;
```

### Статический анализ стека

Компилятор суммирует `sizeof` всех state machine по глубочайшему пути вызовов. Превышение `stack_size` из профиля — ошибка:

```
error: async call stack exceeds platform limit (256 bytes)
  op: 12 bytes
  └─ step2: 8 bytes
       └─ fetchRaw: 244 bytes  ← виновник
hint: reduce live variables across await in fetchRaw
```

Флаг `--report-stack` выводит полную картину без сборки.

## Правила await

- `await` **только** внутри `async` функции — иначе ошибка компилятора
- `await` **только** на `Promise<T>` — `await` на обычном значении — ошибка компилятора

```typescript
// ✅ ok
async function foo(): i32 {
    return await bar();   // bar(): Promise<i32>
}

// ❌ await вне async
function bad(): void {
    await foo();   // error: await outside async function
}

// ❌ await на не-Promise
async function bad2(): void {
    const x: i32 = 42;
    await x;   // error: cannot await i32, expected Promise<T>
}
```

## Borrows через await — запрещено

`Ref<T>` и `Mut<T>` не могут пережить точку `await`. Только owned значения (`T`) захватываются в state machine struct:

```typescript
// ❌ borrow жив через await
async function bad(data: Buffer): Promise<void> {
    const header = data.readHeader()  // Ref<Header> — borrow из data
    await fetchMore()                 // ← header жив через await — ошибка
    process(header)
}

// ✅ Клонировать до await
async function ok(data: Buffer): Promise<void> {
    const header = data.readHeader().clone()  // owned копия
    await fetchMore()
    process(header)
}

// ✅ Завершить использование borrow до await
async function ok2(data: Buffer): Promise<void> {
    const size = data.readHeader().size   // использовали и отпустили
    await fetchMore()
    data.resize(size)
}
```

## async main

Entry point может быть `async` — компилятор запускает event loop автоматически:

```typescript
async function main(): void {
    const user = await fetchUser(42);
    console.log(user.name);
}
```

- Desktop/server — стандартный event loop (libuv/io_uring)
- Embedded — poll loop, state machine без heap

## Рекурсивные async-функции

Обычная async-функция — state machine фиксированного размера на стеке. Рекурсивная — неизвестный размер, компилятор размещает на **heap**:

```typescript
async function traverse(node: Ref<TreeNode>): void {
    await process(node)
    if (node.left)  await traverse(node.left)   // ← рекурсия
    if (node.right) await traverse(node.right)
}
// warning: async function `traverse` is recursive — state machine heap-allocated
```

| Платформа | Рекурсивная async | Поведение |
|-----------|-------------------|-----------|
| Desktop/server | ✅ | heap allocation, предупреждение |
| Embedded | ❌ | ошибка компилятора: no heap available |

### @embedded.stack — явный стек для рекурсии

Декоратор для случаев когда рекурсия на embedded необходима (обход деревьев, DFS):

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
    }
}
```

Размер N — compile-time константа. Переполнение → паника в runtime.

### Дополнительные ограничения на embedded

| Конструкция | Desktop | Embedded |
|-------------|---------|----------|
| Рекурсивная async | ✅ heap | ❌ → используй `@embedded.stack` |
| `Ref<T>` через `await` | ❌ всегда | ❌ всегда |
| `Promise.all` / `Promise.race` | ✅ | ❌ требует heap |
| `@static async function` | работает | обязателен при `allocator: "static"` |

## Отмена задач — AbortController / AbortSignal

Кооперативная отмена async-операций. Компилятор вставляет проверку флага автоматически.

### Основной пример

```typescript
const controller = new AbortController()
const signal = controller.signal

setTimeout(() => controller.abort(new TimeoutError()), 5000)

try {
    const data = await fetch(url, { signal })
} catch (e) {
    if (e instanceof AbortError) console.log("отменено:", e.cause)
}
```

### AbortController

```typescript
class AbortController {
    readonly signal: AbortSignal
    abort(reason?: Error): void   // idempotent — повторный вызов no-op
}
```

### AbortSignal

```typescript
class AbortSignal {
    readonly aborted: boolean
    readonly reason:  Error | null

    onAbort(callback: () => void): void           // очистка ресурсов
    static timeout(ms: i32): AbortSignal           // хелпер — автоотмена через N мс
    static any(signals: AbortSignal[]): AbortSignal // объединение нескольких сигналов
}
```

Удобный хелпер `AbortSignal.timeout`:

```typescript
const data = await fetch(url, { signal: AbortSignal.timeout(5000) })
```

Объединение сигналов `AbortSignal.any`:

```typescript
const deadline = AbortSignal.timeout(5000)
const userCancel = controller.signal

const combined = AbortSignal.any([deadline, userCancel])
await fetch(url, { signal: combined })
```

### Автоматические проверки

Если функция принимает `signal?: AbortSignal` — компилятор вставляет проверку в начале каждого state:

```typescript
async function loadConfig(path: string, signal?: AbortSignal): Config {
    const raw  = await readFile(path)    // ← автопроверка signal
    const json = await parseJson(raw)   // ← автопроверка signal
    return validate(json)
}
```

```c
case STATE_READ_FILE:
    if (signal && atomic_load(&signal->aborted)) {
        ctx->state = STATE_ERROR;
        ctx->error = signal->reason ? signal->reason : &AbortError_default;
        break;
    }
    // ... логика чтения ...
```

### Cleanup при отмене

State machine не прерывается немедленно — переходит в режим **unwind**, освобождая owned ресурсы:

```typescript
async function processFile(path: string, signal?: AbortSignal): Buffer {
    const file = await openFile(path)       // owned FileHandle
    // ← если signal.aborted → unwind: file._free() автоматически
    const data = await readAll(file)
    // ← если signal.aborted → unwind: data._free() + file._free()
    return data
}
```

```c
case STATE_CLEANUP:
    if (ctx->file) FileHandle_free(ctx->file);
    ctx->state = STATE_ERROR;
    break;
```

### signal.onAbort — очистка ресурсов

Для ресурсов, не управляемых через `await`:

```typescript
async function readSocket(fd: i32, signal?: AbortSignal): Buffer {
    signal?.onAbort(() => close(fd))   // закрываем fd при отмене
    const data = await recv(fd)
    return data
}
```

Callbacks выполняются в event loop (не синхронно с `abort()`). `await` внутри callback — ошибка компилятора.

### AbortError и throws

- `AbortError` **не объявляется в `throws`** — наличие `signal?: AbortSignal` уже декларирует отменяемость
- Ловится через `catch (e: AbortError)` для graceful fallback
- Для cleanup — `signal.onAbort()`, не `catch`

```typescript
// ✅ — AbortError не в throws
async function loadConfig(path: string, signal?: AbortSignal): Config throws IOError {
    return await readFile(path)
}

try {
    const cfg = await loadConfig(path, signal)
} catch (e: AbortError) {
    return defaultConfig   // graceful fallback
} catch (e: IOError) {
    throw e
}
```

### signal.addEventListener

JS-совместимый синтаксис (только `"abort"`):

```typescript
signal.addEventListener("abort", () => cleanup())   // ✅ OK
signal.addEventListener("load", () => ...)          // ❌ compile error
```

### C-output платформозависимый

```c
/* desktop — abort() может прийти из worker thread */
struct AbortSignal {
    atomic_bool    aborted;
    Error*         reason;
    AbortCallback* callbacks;
};

/* embedded — нет threads, plain bool */
struct AbortSignal {
    bool           aborted;
    AbortCallback* callbacks;
    /* reason убран — нет heap для Error* */
};
```

## AsyncMutex — координация async-функций

Обычный `Mutex` (std/sync) заблокирует event loop. Для async-функций — `AsyncMutex` из `std/async`:

```typescript
import { AsyncMutex } from "std/async"

const mutex = new AsyncMutex()

async function critical(): Promise<void> {
    await mutex.lock()   // неблокирующий: отдаёт event loop
    try {
        await doWork()
    } finally {
        mutex.unlock()
    }
}

// Или через runExclusive — автоматический unlock:
await mutex.runExclusive(async () => {
    await doWork()
})
```

- Честная очередь (FIFO)
- `Mutex` (std/sync) — только для синхронного кода и `Thread.spawn`
- `AsyncMutex` — для async-функций
- `Mutex.lock()` в async-контексте — **предупреждение компилятора**

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `await outside async function` | `await` в синхронной функции |
| `cannot await i32, expected Promise<T>` | `await` на не-Promise значении |
| `borrow lives across await point` | `Ref<T>` / `Mut<T>` переживает `await` |
| `async function is recursive — state machine heap-allocated` | Предупреждение на desktop, ошибка на embedded |
| `ISR not supported on "desktop"` | `@embedded.isr` вне embedded |

## См. также

- [Promise\<T\>](./promise.md) — тип результата async-функций
- [Каналы и select](./channels.md) — связь async-кода с потоками
- [Генераторы](./generators.md) — async function\*, for await
- [Модель памяти](../05-memory/index.md) — ownership, borrows через await
