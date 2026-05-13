# Async Generators and Cooperative Multitasking

[← Up](./index.md) | [Previous ←](./isr.md)

---

Async generators — a mechanism for streaming data and cooperative multitasking. `async function*` creates an `AsyncIterator<T>`, `for await` consumes it.

## AsyncIterator\<T\>

```typescript
interface AsyncIterator<T> {
    next():  Promise<T | null>    // null = exhausted (done)
    close(): Promise<void>        // graceful stop, executes finally
    return(value: T): Promise<T | null>    // finish, returning last value
    throw(error: Error): Promise<T | null> // inject error at yield point
}
```

`null` means end of stream. A generator cannot `yield null` as data — compile error.

## async function\*

```typescript
async function* readLines(path: string): AsyncIterator<string> throws IOError {
    const fd = await openFile(path)
    try {
        while (true) {
            const line: string | null = await fd.readLine()
            if (line == null) break
            yield line   // move semantics — ownership passed to caller
        }
    } finally {
        await fd.close()   // executes on both break and close()
    }
}
```

- `yield expr` — move semantics. Value is moved into the state machine struct, then taken by the caller
- `throws` in async generator — error is propagated through `next()`:

```typescript
async function* gen(): AsyncIterator<string> throws IOError {
    yield "ok"
    throw new IOError("fail")   // next() returns rejected Promise
}
```

## for await

```typescript
for await (const line of readLines("data.txt")) {
    if (line.startsWith("#")) break   // → calls gen.close() → finally
    process(line)
}
```

`close()` is called automatically on: `break`, `throw`, normal completion.

Desugaring:

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

## close() Semantics

`close()` does not interrupt a pending `await` — sets a flag. The generator checks the flag after the current `await`, skips `yield`, executes `finally`:

```typescript
// close() called while generator is waiting for fd.readLine()
// → readLine() completes normally
// → generator sees close flag
// → does not yield, enters finally → fd.close()
```

Parallel call to `next()` (while previous is not complete) — runtime panic. `for await` guarantees sequentiality.

## return(value) and throw(error)

```typescript
const gen = readLines("data.txt")

// Finish generator, returning last value
gen.return("last")

// Inject error at yield point
gen.throw(new IOError("injected"))
```

- `return(value)` — finishes generator, executes `finally`, returns `value`
- `throw(error)` — injects error at the `next()` await point

## AsyncChannel as AsyncIterator

`AsyncChannel<T>` implements `AsyncIterator<T>` — can be used in `for await`:

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

### Async Generator State Machine

```c
typedef enum {
    GEN_STATE_INIT,
    GEN_STATE_AWAIT_OPEN,
    GEN_STATE_AWAIT_READLINE,
    GEN_STATE_YIELDED,         // waiting for next next()
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

State machine is allocated on heap by default.

### @static on Embedded

With `allocator: "static"` — use `@static`, generator struct goes to BSS:

```typescript
@static function* adcSampler(channel: u8): Generator<u16> {
    while (true) {
        yield ADC.read(channel)
    }
}

const sampler = adcSampler(0)   // struct on BSS
for (const sample of sampler) {
    uart.write(sample as u8)
    if (sample > 900) break
}
```

```c
typedef struct { uint8_t channel; uint8_t _state; } _AdcSamplerGen;
static _AdcSamplerGen _adcSampler_instance;   /* BSS, not heap */

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

Equivalent to `@static function*`, but explicitly expresses intent — one instance for the entire program:

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

Applies only to `function*` — compile error on other targets.

## Synchronous Generators

Synchronous `Generator<T>` (without `async`) has a similar interface without `Promise`:

```typescript
interface Generator<T> {
    next():               T | null
    return(value: T):     T | null
    throw(error: Error):  T | null
}
```

Synchronous generators always work on the stack — no heap required on any platform.

## Embedded: Alternatives to Async Generators

On `heap: false` (AVR, bare-metal ARM) async generators are unavailable.

### Pattern 1: Polling Loop

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

### Pattern 2: ISR + Ring Buffer

```typescript
import { Volatile } from "std/embedded"

const rxBuf: u8[64] = [0, ...]
const rxHead = new Volatile<u8>(0)   // written by ISR
const rxTail = new Volatile<u8>(0)   // read by main loop

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

### Pattern 3: DMA + Callback

```typescript
const dmaBuf: u8[256] = [0, ...]

dma.read(dmaBuf, 256, (buf: Ref<u8[256]>) => {
    process(buf)
})
```

## Cooperative Multitasking via Generators

Pattern for "parallel" execution without threads or OS. Each task is a generator, `yield` yields control. Round-robin loop ticks all tasks in order. Works on any platform.

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

Each task ≈ 4–16 bytes (depends on live variables across `yield`).

### Comparison of Approaches

| Approach | Heap | Complexity | Use Case |
|--------|------|-----------|-----------|
| Sync polling | no | low | simple loop, single task |
| **Generators round-robin** | no | medium | multiple tasks, embedded and desktop |
| Async/Await + runtime | required | high | desktop/server |
| Threads | required | high | CPU-bound, OS |

## Errors

| Error | Cause |
|--------|---------|
| `yield null as data` | `null` is reserved as "end of stream" |
| `async generator on heap: false` | No heap for state machine |
| `parallel next() call` | Runtime panic on parallel call |
| `@static required with allocator: "static"` | Heap unavailable |

## See Also

- [Async/Await](./async.md) — state machines, async functions
- [ISR (Embedded)](./isr.md) — ISR patterns for streaming
- [Channels](./channels.md) — AsyncChannel as AsyncIterator
- [Memory Model](../05-memory/index.md) — ownership, move semantics on yield
