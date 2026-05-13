# @embedded.isr — аппаратные прерывания

[← Вверх](./index.md) | [Следующий →](./generators.md) | [Предыдущий ←](./channels.md)

---

ISR (Interrupt Service Routine) — аппаратное прерывание. Не поток, не closure. Никакого захвата контекста. Доступно **только на embedded** (AVR, ARM Cortex-M).

## Volatile\<T\> — регистры MMIO

`Volatile<T>` гарантирует что каждое чтение/запись доходит до памяти (не кэшируется в регистр процессора). Транслируется в `volatile T*` в C.

```typescript
import { Volatile, pointer } from "std/embedded"

type UartRegs = {
    dr:        Volatile<u32>   // Data Register
    rsr:       Volatile<u32>   // Status Register
    _reserved: u32[4]          // пропуск памяти
    fr:        Volatile<u32>   // Flag Register
}

const UART0 = pointer<UartRegs>(0x101f1000)

UART0.dr.write(0x41)              // *(volatile uint32_t*)0x101f1000 = 0x41
const status = UART0.fr.read()   // *(volatile uint32_t*)0x101f1018
```

> `Volatile<T>` ≠ `Atomic<T>`: атомики используют инструкции синхронизации, которые периферия не понимает. Для MMIO — только `Volatile<T>`.

Две гарантии:
1. **No cache** — каждое чтение/запись идёт на шину
2. **No reordering** — компилятор не переставляет volatile-операции

## @embedded.isr

### Сигнатура

Всегда `(): void` — без параметров, без возвращаемого значения, без `throws`:

```typescript
@embedded.isr(14)
function handler(): void { ... }          // ✅

@embedded.isr(14)
function handler(x: i32): void { ... }   // ❌ параметры запрещены

@embedded.isr(14)
function handler(): i32 { ... }          // ❌ return type должен быть void

@embedded.isr(14)
function handler(): void throws E { ... } // ❌ throws запрещён
```

### Аргумент декоратора

Два варианта:

```typescript
@embedded.isr("TIMER1_OVF")   // по имени вектора — AVR (avr-libc naming)
@embedded.isr(14)              // по номеру вектора — ARM Cortex-M (IRQn)
```

### Пример

```typescript
import { Atomic, RmwOrdering } from "std/threads"

type TimerEvent = { irq: u32; tick: u32 }

static readonly irqCount = new Atomic<u32>(0)
static readonly [tx, rx] = channel<TimerEvent>(32)

@embedded.isr(14)   // ARM Cortex-M: IRQ14
function onTimerInterrupt(): void {
    irqCount.fetchAdd(1, RmwOrdering.Relaxed)

    const ev: TimerEvent = { irq: 14, tick: irqCount.load(RmwOrdering.Relaxed) }
    tx.trySend(ev)   // non-blocking

    TIMER_REG.sr.write(0x0)   // сброс флага прерывания
}

@embedded.isr("TIMER1_OVF")   // AVR: именованный вектор
function onTimerOverflow(): void {
    irqCount.fetchAdd(1, RmwOrdering.Relaxed)
}
```

### C-output

```c
// GCC/Clang (ARM Cortex) — числовой аргумент
__attribute__((interrupt("IRQ")))
void onTimerInterrupt(void) { ... }

// AVR — строковый аргумент
ISR(TIMER1_OVF_vect) {
    counter++;
}
```

Context saving — полностью на стороне C компилятора через `__attribute__((interrupt))`.

## Правила @embedded.isr

| Операция | Разрешено |
|----------|-----------|
| `Atomic<T>` / `AtomicArray<T>` | ✅ |
| `Volatile<T>` (MMIO) | ✅ |
| `tx.trySend()` / `rx.tryReceive()` | ✅ (не блокирует) |
| Примитивы на стеке (`i32`, `u8`, etc.) | ✅ |
| `type`-литералы на стеке (`{ field: u32 }`) | ✅ |
| Модульные переменные (`static`, `const`, `let`) | ✅ |
| Фиксированные массивы `T[N]` | ✅ |
| `await` | ❌ ошибка компилятора |
| `new` (heap allocation) | ❌ ошибка компилятора |
| `tx.send()` / `rx.receive()` (блокирующие) | ❌ ошибка компилятора |
| `Shared<T>` / `Weak<T>` | ❌ ошибка компилятора |
| String concatenation | ❌ ошибка компилятора (heap) |
| `throw` / `throws` | ❌ ошибка компилятора |
| `interrupts.disable()` внутри ISR | ❌ ошибка компилятора |
| Два `@embedded.isr` с одним вектором | ❌ duplicate vector |

### Почему heap запрещён в ISR

1. **Safety** — OOM → crash системы
2. **Determinism** — непредсказуемое время → нарушение real-time
3. **Atomicity** — аллокатор использует блокировки → deadlock
4. **Stack** — ISR работает на ограниченном стеке

### Правильные паттерны

```typescript
// ✅ Примитив + канал
const _sensorChannel = channel<u16>(32)

@embedded.isr(14)
function handler(): void {
    const reading: u16 = ADC.read()
    _sensorChannel.trySend(reading)
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

## std/sync — критические секции

Для безопасного доступа к составным данным, которые меняет IRQ — временный запрет прерываний:

```typescript
import { interrupts } from "std/sync"

interrupts.disable(() => {
    // прерывания выключены
    const snapshot = sensorData.x
    const y = sensorData.y
    process(snapshot, y)
})
// прерывания автоматически включаются
```

> Те же ограничения что и в `@embedded.isr`: нет `await`, нет `new`.

### C-output (платформозависимый)

```c
// ARM Cortex-M
__asm volatile("cpsid i");   // disable
{ /* тело */ }
__asm volatile("cpsie i");   // enable

// x86
__asm volatile("cli");
{ /* тело */ }
__asm volatile("sti");

// AVR
uint8_t sreg = SREG; cli();
{ /* тело */ }
SREG = sreg;  // восстанавливает флаги (не просто sei())
```

## EmbeddedSignal — мост ISR → async

Для простых событий без полезной нагрузки (ADC готов, таймер, кнопка). Нулевой overhead: один `volatile bool` в BSS.

```typescript
import { EmbeddedSignal } from "std/embedded"

const adcReady = new EmbeddedSignal()

@embedded.isr("ADC_vect")
function adc_isr(): void {
    ADCSRA
    adcReady.set()    // ISR-safe: volatile bool = true
}

async function readADC(): u16 {
    ADCSRA |= (1 << 6)         // запускаем преобразование
    await adcReady.wait()      // ждём сигнала от ISR
    return ADCL | (ADCH << 8)
}
```

### API

```typescript
class EmbeddedSignal {
    set(): void              // ISR-safe: volatile store
    wait(): Promise<void>    // async: опрос флага, auto-reset
    clear(): void            // ручной сброс
    readonly isSet: bool     // ISR-safe: проверка без ожидания
}
```

### Правила

- `new EmbeddedSignal()` — один бит в BSS, без heap
- `await signal.wait()` — только в async-функции
- `signal.set()` / `signal.isSet` / `signal.clear()` — ISR-safe
- Один `EmbeddedSignal` на одно событие

### Автоматическая битовая упаковка

Компилятор собирает все `EmbeddedSignal` в модуле и упаковывает в один `volatile uint32_t`. Каждый сигнал — один бит. Быстрая проверка в главном цикле: **один `if` на все 32 события**.

```c
static volatile uint32_t _sig_bank_0 = 0;
#define _SIG_adcReady    (1u << 0)
#define _SIG_timerTick   (1u << 1)
#define _SIG_buttonPress (1u << 2)

ISR(ADC_vect)       { _sig_bank_0 |= _SIG_adcReady; }
ISR(TIMER1_OVF_vect){ _sig_bank_0 |= _SIG_timerTick; }
ISR(INT0_vect)      { _sig_bank_0 |= _SIG_buttonPress; }

void main_loop(void) {
    while (1) {
        if (!_sig_bank_0) continue;   // нет событий — пропускаем ВСЁ

        uint32_t pending = _tsc_signal_snapshot(&_sig_bank_0);

        if (pending & _SIG_adcReady)    readADC_poll(&sm_readADC);
        if (pending & _SIG_timerTick)   onTimer_poll(&sm_onTimer);
        if (pending & _SIG_buttonPress) onButton_poll(&sm_onButton);
    }
}
```

### C-output EmbeddedSignal

```c
// BSS — один volatile bool (или бит в bank)
static volatile bool _sig_adcReady = false;

ISR(ADC_vect) {
    (void)ADCSRA;
    _sig_adcReady = true;
}

bool readADC_poll(ReadADC_SM* sm) {
    switch (sm->_state) {
    case 0:
        ADCSRA |= (1 << 6);
        sm->_state = 1;
        return false;
    case 1:
        if (!_sig_adcReady) return false;
        _sig_adcReady = false;              // auto-reset
        sm->_result = ADCL | (ADCH << 8);
        sm->_state = 0xFF;
        return true;
    }
}
```

## Когда что использовать

| Сценарий | Инструмент |
|----------|-----------|
| ISR → флаг «событие произошло» | `EmbeddedSignal` |
| ISR → передача данных (ADC value, UART byte) | `channel<T>.trySend()` |
| ISR → разделяемый счётчик | `Atomic<T>.fetchAdd()` |
| ISR → сложная составная структура | `interrupts.disable()` + глобальная переменная |

## Итоговая таблица

| Задача | TSC синтаксис | Гарантия |
|--------|---------------|----------|
| MMIO регистры | `Volatile<T>` | Прямое обращение к шине, no reorder |
| Обработчик прерывания | `@embedded.isr(N)` / `@embedded.isr("NAME")` | Context saved компилятором C |
| Общее состояние с IRQ | `static Atomic<T>` | Атомарный доступ без гонок |
| Составные данные с IRQ | `interrupts.disable()` | Критическая секция |
| Сигнал ISR → async | `EmbeddedSignal` | бит в uint32_t, auto-reset, быстрый idle |
| Данные ISR → async | `channel.trySend()` | Передача без блокировки |

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `ISR not supported on "desktop"` | `@embedded.isr` вне embedded |
| `heap allocation in ISR context` | `new` внутри ISR |
| `parameters forbidden in ISR` | ISR с параметрами |
| `throws forbidden in ISR` | ISR с `throws` |
| `duplicate ISR vector` | Два ISR на один вектор |
| `interrupts.disable() inside ISR` | Прерывания уже отключены |

## См. также

- [Каналы и select](./channels.md) — channel.trySend() из ISR
- [Threads](./threads.md) — Atomic\<T\> и AtomicArray\<T\>
- [Async/Await](./async.md) — EmbeddedSignal → async
- [Генераторы](./generators.md) — ISR-паттерны для streaming
