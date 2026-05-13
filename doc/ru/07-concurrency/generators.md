# Async-генераторы и кооперативная многозадачность

[← Вверх](./index.md) | [Предыдущий ←](./isr.md)

---

Async-генераторы — механизм стриминга данных и кооперативной многозадачности. `async function*` создаёт `AsyncIterator<T>`, `for await` — потребляет.

## AsyncIterator\<T\>

```typescript
interface AsyncIterator<T> {
    next():  Promise<T | null>    // null = exhausted (done)
    close(): Promise<void>        // graceful stop, выполняет finally
    return(value: T): Promise<T | null>    // завершить, отдав последнее значение
    throw(error: Error): Promise<T | null> // инъекция ошибки в точке yield
}
```

`null` означает конец потока. Генератор не может `yield null` как данные — compile error.

## async function\*

```typescript
async function* readLines(path: string): AsyncIterator<string> throws IOError {
    const fd = await openFile(path)
    try {
        while (true) {
            const line: string | null = await fd.readLine()
            if (line == null) break
            yield line   // move semantics — ownership передаётся caller'у
        }
    } finally {
        await fd.close()   // выполняется и при break, и при close()
    }
}
```

- `yield expr` — move semantics. Значение перемещается в state machine struct, затем забирается caller'ом
- `throws` в async-генераторе — ошибка пробрасывается через `next()`:

```typescript
async function* gen(): AsyncIterator<string> throws IOError {
    yield "ok"
    throw new IOError("fail")   // next() вернёт rejected Promise
}
```

## for await

```typescript
for await (const line of readLines("data.txt")) {
    if (line.startsWith("#")) break   // → вызывает gen.close() → finally
    process(line)
}
```

`close()` вызывается автоматически при: `break`, `throw`, нормальном завершении.

Десахаризация:

```typescript
const _gen = readLines("data.txt")
try {
    while (true) {
        const line = await _gen.next()
        if (line == null) break
        // body
    }
} finally {
    await _gen.close()
}
```

## close() семантика

`close()` не прерывает pending `await` — устанавливает флаг. Генератор проверяет флаг после текущего `await`, пропускает `yield`, выполняет `finally`:

```typescript
// close() вызван пока генератор ждёт fd.readLine()
// → readLine() завершается нормально
// → генератор видит флаг close
// → не делает yield, переходит в finally → fd.close()
```

Параллельный вызов `next()` (пока предыдущий не завершён) — runtime panic. `for await` гарантирует последовательность.

## return(value) и throw(error)

```typescript
const gen = readLines("data.txt")

// Завершить генератор, отдав последнее значение
gen.return("last")

// Инъекция ошибки в точке yield
gen.throw(new IOError("injected"))
```

- `return(value)` — завершает генератор, выполняет `finally`, возвращает `value`
- `throw(error)` — инъектирует ошибку в точке ожидания `next()`

## AsyncChannel как AsyncIterator

`AsyncChannel<T>` реализует `AsyncIterator<T>` — можно использовать в `for await`:

```typescript
const ch = new AsyncChannel<Buffer>(16)

async function producer(): void {
    for (const chunk of data) await ch.send(chunk)
    ch.close()
}

for await (const chunk of ch) {
    process(chunk)
}
```

## C-output

### Async generator state machine

```c
typedef enum {
    GEN_STATE_INIT,
    GEN_STATE_AWAIT_OPEN,
    GEN_STATE_AWAIT_READLINE,
    GEN_STATE_YIELDED,         // ожидание следующего next()
    GEN_STATE_FINALLY,
    GEN_STATE_DONE,
    GEN_STATE_ERROR
} ReadLinesState;

typedef struct {
    ReadLinesState state;
    FileHandle*    fd;
    String*        yielded_value;
    IOError*       error;
    bool           close_requested;
} ReadLinesGen;

void readlines_next(ReadLinesGen* g,
    void (*cb)(String* val, bool done, IOError* err, void* ud), void* ud);
void readlines_close(ReadLinesGen* g, void (*cb)(void* ud), void* ud);
```

State machine аллоцируется на heap по умолчанию.

### @static на embedded

При `allocator: "static"` — используйте `@static`, struct генератора идёт в BSS:

```typescript
@static function* adcSampler(channel: u8): Generator<u16> {
    while (true) {
        yield ADC.read(channel)
    }
}

const sampler = adcSampler(0)   // struct на BSS
for (const sample of sampler) {
    uart.write(sample as u8)
    if (sample > 900) break
}
```

```c
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

### @embedded.singleton

Эквивалентен `@static function*`, но явно выражает намерение — один экземпляр на всю программу:

```typescript
@embedded.singleton
function* scanline(): Generator<u8[256]> {
    while (true) {
        yield renderLine()
    }
}
```

```c
static struct {
    uint8_t state;
    uint8_t line[256];
} scanline_gen;

bool scanline_next(void) {
    renderLine(scanline_gen.line);
    return true;
}
```

Применяется только к `function*` — ошибка компилятора на других таргетах.

## Синхронные генераторы

Синхронный `Generator<T>` (без `async`) имеет аналогичный интерфейс без `Promise`:

```typescript
interface Generator<T> {
    next():               T | null
    return(value: T):     T | null
    throw(error: Error):  T | null
}
```

Синхронные генераторы всегда работают на стеке — heap не требуется ни на каких платформах.

## Embedded: альтернативы async generators

На `heap: false` (AVR, bare-metal ARM) async generators недоступны.

### Паттерн 1: polling loop

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

### Паттерн 2: ISR + ring buffer

```typescript
import { Volatile } from "std/embedded"

const rxBuf: u8[64] = [0, ...]
const rxHead = new Volatile<u8>(0)   // пишет ISR
const rxTail = new Volatile<u8>(0)   // читает main loop

@embedded.isr("USART_RX")
function onUartRx(): void {
    const next = (rxHead.read() + 1) as u8
    if (next != rxTail.read()) {
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

### Паттерн 3: DMA + callback

```typescript
const dmaBuf: u8[256] = [0, ...]

dma.read(dmaBuf, 256, (buf: Ref<u8[256]>) => {
    process(buf)
})
```

## Кооперативная многозадачность через генераторы

Паттерн для «параллельного» выполнения без потоков и OS. Каждая задача — генератор, `yield` уступает управление. Round-robin loop тикает все задачи по очереди. Работает на любой платформе.

```typescript
function* inputTask(): Generator<void> {
    while (true) {
        if (keyboard.available()) handleKey(keyboard.read())
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

Каждая task ≈ 4–16 байт (зависит от живых переменных через `yield`).

### Сравнение подходов

| Подход | Heap | Сложность | Применение |
|--------|------|-----------|-----------|
| Sync polling | нет | низкая | простой loop, одна задача |
| **Generators round-robin** | нет | средняя | несколько задач, embedded и desktop |
| Async/Await + runtime | нужен | высокая | desktop/server |
| Threads | нужен | высокая | CPU-bound, OS |

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `yield null as data` | `null` зарезервирован как «конец потока» |
| `async generator on heap: false` | Нет heap для state machine |
| `parallel next() call` | Runtime panic при параллельном вызове |
| `@static required with allocator: "static"` | Heap недоступен |

## См. также

- [Async/Await](./async.md) — state machines, async-функции
- [ISR (Embedded)](./isr.md) — ISR-паттерны для streaming
- [Каналы](./channels.md) — AsyncChannel как AsyncIterator
- [Модель памяти](../05-memory/index.md) — ownership, move semantics при yield
