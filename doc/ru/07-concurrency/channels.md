# Каналы и select

[← Вверх](./index.md) | [Следующий →](./isr.md) | [Предыдущий ←](./threads.md)

---

`channel<T>` — bounded MPMC (multiple producer, multiple consumer) кольцевой буфер. Основной способ передачи данных между потоками, между ISR и async-кодом, и между async-задачами.

## Создание

```typescript
import { Thread, channel, select, after } from "std/threads"

const [tx, rx] = channel<Message>(128)   // capacity = 128, обязателен
```

Возвращает кортеж `[Sender<T>, Receiver<T>]`. Capacity — compile-time константа.

## Отправка (Sender)

```typescript
// async-контекст: yield event loop если полный (backpressure)
await tx.send(msg)

// thread-контекст: блокирует OS-поток если полный
tx.send(msg)

// неблокирующий: boolean — false если полный
tx.trySend(msg)

// закрыть канал; получатель вычитает остаток, затем получает null
tx.close()
```

## Получение (Receiver)

```typescript
// async-контекст: yield event loop пока пуст
const msg = await rx.receive()

// thread-контекст: блокирует OS-поток пока пуст
const msg = rx.receive()

// неблокирующий: Message | null
rx.tryReceive()
```

## Ownership

`tx.send(msg)` — **move** `msg` в канал. После отправки `msg` недоступен. При удалении канала с непрочитанными элементами компилятор вызывает деструкторы всех оставшихся объектов.

## ISR-safe операции

`trySend`, `tryReceive`, `size`, `capacity`, `isFull`, `isEmpty` не делают системных вызовов и не аллоцируют память — безопасны для вызова из прерываний:

```typescript
tx.size       // i32 — текущее кол-во элементов
tx.capacity   // i32 — максимальная ёмкость
tx.isFull     // boolean — size == capacity
tx.isEmpty    // boolean — size == 0
```

`size` и `isFull` — snapshot: значение может измениться к моменту следующей инструкции.

### Адаптивный producer в ISR

Типичный паттерн для робототехники и real-time систем:

```typescript
// Бинарная адаптация: два режима качества
@embedded.isr("LIDAR_SCAN")
function onScan(): void {
    const resolution = tx.isFull ? Resolution.Low : Resolution.High
    tx.trySend(captureScan(resolution))
}

// Градуальная адаптация: три ступени качества
@embedded.isr("CAMERA_FRAME")
function onFrame(): void {
    const quality = tx.size < tx.capacity / 3  ? Quality.High
                  : tx.size < tx.capacity * 2/3 ? Quality.Medium
                  : Quality.Low

    tx.trySend(captureFrame(quality))
}
```

Для гарантий «exactly once» использовать `trySend()` — он атомарен.

## select

Ждёт первого готового из нескольких каналов. Ровно одно поле результата non-null. **Только для async-контекста** (event loop).

```typescript
const result = await select({
    msg:     rx1.receive(),   // ждём Message
    err:     errCh.receive(), // ждём AppError
    timeout: after(500)       // таймаут 500 мс
})

match (result) {
    { msg }     => handleMsg(msg),
    { err }     => handleErr(err),
    { timeout } => handleTimeout(),
}
```

- `result` — непрозрачный тип (opaque). Обращение к полям напрямую (`result.msg`) — ошибка компилятора
- Потреблять только через `match` — компилятор проверяет exhaustiveness
- `after(ms)` — Timer Task, не полноценный канал (нет аллокации буфера)

### Fairness

Перед регистрацией callbacks компилятор обходит каналы в случайном порядке через `tryReceive()`. Если хотя бы один готов — возвращает сразу без регистрации в event loop.

### Из потока

В `Thread.spawn` `await` запрещён, поэтому `await select(...)` не скомпилируется. Используйте `rx.receive()` напрямую.

## C-output

### Канал — кольцевой буфер MPMC

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

### select — SelectState

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
    void*         promise;
} SelectState;
```

### SelectResult — tagged union

```c
struct SelectResult {
    int arm_id;   // дискриминант: 0=msg, 1=err, 2=timeout
    union {
        Message*  msg;
        AppError* err;
    } data;
};
```

Компилятор генерирует `SelectResult` по конкретному вызову `select{}`.

Жизненный цикл: `ref_count = arms_count`. Каждый callback делает `dec_ref`. Последний освобождает память. После победы одного — остальные отписываются.

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `channel capacity required` | Не указан capacity при создании |
| `await select in Thread.spawn` | `select` только для async-контекста |
| `direct field access on select result` | `result.msg` — opaque, используйте `match` |
| `cannot send to closed channel` | `tx.send()` после `tx.close()` |

## См. также

- [Threads](./threads.md) — Thread.spawn, Atomic\<T\>, Readonly\<T\>
- [ISR (Embedded)](./isr.md) — ISR-safe операции каналов
- [Async/Await](./async.md) — event loop, async-контекст
