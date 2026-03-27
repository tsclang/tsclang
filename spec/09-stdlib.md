# TSClang — Стандартная библиотека

## Error (base class)

Глобальный базовый класс для всех ошибок — импорт не нужен.

```typescript
class Error {
    message: string
    constructor(message: string) { this.message = message }
}
```

**Правило:** `throw` принимает только экземпляры классов, наследующих `Error`. Бросить произвольный класс или примитив — ошибка компилятора.

```typescript
class IOError extends Error { }
class NetworkError extends Error {
    code: i32
    constructor(msg: string, code: i32) {
        super(msg)
        this.code = code
    }
}

throw new IOError("not found")      // ✅
throw new NetworkError("timeout", 408)  // ✅
throw "oops"                        // ❌ ошибка компилятора: string не является Error
throw new MyClass()                 // ❌ ошибка компилятора: MyClass не наследует Error
```

> **Осознанный разрыв с TypeScript:** в TS `throw` принимает `any` — можно бросить строку, число, объект. На практике все бросают `Error` или его наследников, но компилятор не требует. В TSClang это правило обязательно: `throw` только `Error`-наследники. Причина: без этого требования `catch (e: IOError)` не может гарантировать тип `e` — это ломает всю систему типизированных ошибок и `throws`-сигнатуры. Разрыв осознан, но обратно совместим: любой TS-код где `throw new SomeError(...)` (а это 99% кода) работает без изменений — достаточно добавить `extends Error`.

C-output — `Error`-иерархия через C-поля, без vtable:
```c
typedef struct { String message; } Error;
typedef struct { Error base; } IOError;    // наследование = первое поле
typedef struct { Error base; int32_t code; } NetworkError;
```

## Globals

Глобальные объекты и функции — импорт не нужен.

`console` и `process` — глобальные, импорт не нужен.

```typescript
// console — все платформы
console.log("hello")
console.error("error")
console.warn("warning")
console.debug("debug")

// таймеры — все платформы
const id = setTimeout(() => console.log("hello"), 1000)  // i64 — id таймера
clearTimeout(id)
const tick = setInterval(() => update(), 100)             // i64 — id интервала
clearInterval(tick)

// sleep — все платформы (только внутри async)
await sleep(500)   // пауза 500мс

// высокоточный таймер — все платформы
performance.now()  // f64 — миллисекунды с момента старта программы

// process — только desktop/server
process.exit(0)
process.argv   // string[] — аргументы командной строки
process.env    // Map<string, string> — переменные окружения
```

На **embedded** targets `process.*` — ошибка компилятора (нет OS, нет процесса). Вместо этого используются `std/serial`, `std/gpio` и др.

Недоступно на embedded (требует OS):
- `process.*`
- `std/threads`

Только для embedded:
- `std/sync` — критические секции (`interrupts.disable()`)
- `std/embedded` — `Volatile<T>`, `pointer<T>(addr)`

## Map\<K, V\>

Глобальный класс — импорт не нужен. Hash map с открытой адресацией. Ключи и значения управляются ownership-системой.

На **embedded** — ошибка компилятора (heap аллокации не гарантированы). Используй статические массивы или `type`-структуры.

```typescript
// создание
const m = new Map<string, i32>()
const m = new Map<string, User>()

// запись / чтение
m.set("alice", 42)             // void — move value в map
const v = m.get("alice")       // i32 | null — null если ключ не найден
const v = m.get("alice") ?? 0  // дефолт через ??

// проверка и удаление
m.has("alice")    // boolean
m.delete("alice") // boolean — true если ключ был

// размер
m.size   // i32, readonly

// итерация
for (const [key, value] of m) { ... }   // по парам
for (const key of m.keys()) { ... }
for (const value of m.values()) { ... }

// очистка
m.clear()  // void — удаляет все элементы, деструкторы вызываются
```

Ownership:
- `m.set(key, value)` — move `value` в map. После вызова `value` недоступен (если не примитив).
- `m.get(key)` — возвращает `Ref<V> | null` для сложных типов, `V | null` для примитивов.
- `m.delete(key)` — вызывает деструктор value.

```typescript
// сложные типы — get возвращает Ref
const users = new Map<string, User>()
users.set("alice", new User("Alice", 30))   // move User в map

const u: Ref<User> | null = users.get("alice")  // borrow
if (u != null) console.log(u.name)              // ok — User жив в map

// примитивы — get возвращает copy
const counts = new Map<string, i32>()
counts.set("hits", 42)
const n: i32 | null = counts.get("hits")    // copy
```

C-output — open addressing hash map:
```c
typedef struct {
    void**  keys;      // массив указателей на ключи (или inlined для примитивов)
    void**  values;    // массив указателей на значения
    bool*   occupied;  // маска занятых слотов
    size_t  capacity;
    size_t  size;
} Map;
// монорфизируется: Map_string_i32, Map_string_User и т.д.
```

## Buffer

Глобальный класс для работы с бинарными данными — байтовый буфер с удобным API для I/O. Импорт не нужен. Доступен на всех платформах.

```typescript
// создание
const buf = Buffer.alloc(1024)                         // нули, size=1024
const buf = Buffer.alloc(256, 0xFF)                    // заполнен 0xFF
const buf = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // из u8[]
const buf = Buffer.from("hello", "utf8")               // из строки
const buf = Buffer.from("aGVsbG8=", "base64")
const buf = Buffer.concat([buf1, buf2, buf3])           // объединить

// размер
buf.length   // usize, readonly

// доступ к байтам
buf[0]        // u8 — чтение
buf[0] = 0xFF // запись

// zero-copy view
const s: Slice<u8>    = buf.view(4, 12)     // байты 4..11, не копирует
const ms: MutSlice<u8> = buf.viewMut(0, 4)  // мутабельный view

// копирование
buf.copy(target, targetStart?: usize, sourceStart?: usize, sourceEnd?: usize): usize  // возвращает кол-во скопированных байт

// заполнение
buf.fill(value: u8, start?: usize, end?: usize): void

// поиск
buf.indexOf(value: u8, start?: i32): i32   // -1 если не найдено

// конвертация в строку
buf.toString("utf8" | "ascii" | "hex" | "base64"): string
```

C-output:
```c
typedef struct {
    uint8_t* data;
    size_t   length;
    size_t   capacity;
} Buffer;
```

## DataView

Чтение и запись примитивных типов в `Buffer` по произвольным смещениям с контролем byte order (endianness). Импорт не нужен. Критично для парсинга бинарных протоколов.

```typescript
const buf = Buffer.alloc(64)
const dv = new DataView(buf)          // весь буфер
const dv = new DataView(buf, 4, 16)   // byteOffset=4, byteLength=16

dv.byteLength   // i32
dv.byteOffset   // i32

// чтение (littleEndian по умолчанию = false — big-endian)
dv.getU8(offset)
dv.getI8(offset)
dv.getU16(offset, littleEndian?: boolean)
dv.getI16(offset, littleEndian?: boolean)
dv.getU32(offset, littleEndian?: boolean)
dv.getI32(offset, littleEndian?: boolean)
dv.getU64(offset, littleEndian?: boolean)
dv.getI64(offset, littleEndian?: boolean)
dv.getF32(offset, littleEndian?: boolean)
dv.getF64(offset, littleEndian?: boolean)

// запись
dv.setU8(offset, value)
dv.setI8(offset, value)
dv.setU16(offset, value, littleEndian?: boolean)
// ... аналогично для всех типов

// пример: парсинг бинарного заголовка протокола
type PacketHeader = {
    magic:   u32   // big-endian
    version: u16
    length:  u32
    checksum: u32
}

function parseHeader(buf: Ref<Buffer>): PacketHeader {
    const dv = new DataView(buf)
    return {
        magic:    dv.getU32(0),         // big-endian (по умолчанию)
        version:  dv.getU16(4),
        length:   dv.getU32(6),
        checksum: dv.getU32(10),
    }
}
```

C-output — `getU32` big-endian:
```c
uint32_t tsc_DataView_getU32(DataView* dv, size_t offset, bool little_endian) {
    uint8_t* p = dv->buffer->data + dv->byte_offset + offset;
    if (little_endian)
        return (uint32_t)p[0] | ((uint32_t)p[1]<<8) | ((uint32_t)p[2]<<16) | ((uint32_t)p[3]<<24);
    else
        return ((uint32_t)p[0]<<24) | ((uint32_t)p[1]<<16) | ((uint32_t)p[2]<<8) | (uint32_t)p[3];
}
```

## process.stdin / stdout / stderr

```typescript
// stdin — async чтение
const line = await process.stdin.readLine()   // string | null (null = EOF)
const all  = await process.stdin.readAll()    // string

// stdout / stderr — запись
await process.stdout.write("hello")
await process.stderr.write("error\n")
```

## Совместимость с платформами

| Модуль | Desktop | Embedded (ARM) | Embedded (AVR) | Примечание |
|--------|---------|----------------|----------------|------------|
| `std/string` | ✅ | ✅ | ✅ | |
| `std/math` | ✅ | ✅ | ✅ | |
| `std/libc` | ✅ | ✅ | 🟡 | AVR: без `malloc`/`free` |
| `std/random` | ✅ | 🟡 | 🟡 | `HardwareRandom` — только на embedded с RNG-периферией |
| `std/temporal` | ✅ | 🟡 | ✅ | ARM: без wall clock, только monotonic tick |
| `std/io` | ✅ | ❌ | ❌ | требует heap и OS |
| `std/fs` | ✅ | ❌ | ❌ | требует файловую систему |
| `std/net` | ✅ | ❌ | ❌ | требует TCP/IP стек |
| `std/ws` | ✅ | ❌ | ❌ | поверх `std/net` |
| `std/threads` | ✅ | ❌ | ❌ | требует OS-потоки (libuv) |
| `std/reactive` | ✅ | ❌ | ❌ | поверх `std/threads` |
| `std/embedded` | ❌ | ✅ | ✅ | GPIO, UART, SPI, I2C |
| `std/sync` | ❌ | ✅ | ✅ | атомики без ОС (spin-lock, barrier) |

**Легенда:** ✅ — полная поддержка, 🟡 — частичная поддержка, ❌ — недоступно

Компилятор проверяет совместимость при импорте. Попытка использовать `std/fs` на embedded-таргете — ошибка компилятора.

```typescript
// target: avr
import { readFile } from "std/fs"  // ❌ ошибка компилятора: std/fs не поддерживается на AVR
import { gpio } from "std/embedded" // ✅
```

---

## std/io

Абстракция потоков — базовые интерфейсы `Reader` и `Writer`. Используются для построения поверх них (файлы, сеть, serial).

```typescript
import { Reader, Writer, Stream } from "std/io"

interface Reader {
    read(buf: Mut<u8[]>): i32 | null throws IOError   // прочитать в буфер, null = EOF
    readLine(): string | null throws IOError
    readAll(): string throws IOError
}

interface Writer {
    write(data: string): void throws IOError
    write(data: u8[]): void throws IOError
    flush(): void throws IOError
}

interface Stream extends Reader, Writer {}
```

`process.stdin` реализует `Reader`, `process.stdout` / `process.stderr` реализуют `Writer`.

## std/fs

Все операции async. Реализация зависит от платформы:

| Платформа | Реализация |
|-----------|-----------|
| Desktop/Server | POSIX / Windows API |
| Embedded (SD карта) | FatFS |
| Embedded (Flash) | LittleFS |

```typescript
import { fs } from "std/fs"

// файлы
const text = await fs.readFile("data.txt")            // string throws IOError
const raw  = await fs.readFileBytes("data.bin")       // u8[] throws IOError
await fs.writeFile("out.txt", "hello")                // void throws IOError
await fs.writeFileBytes("out.bin", bytes)             // void throws IOError
await fs.appendFile("log.txt", "new line\n")          // void throws IOError
await fs.deleteFile("old.txt")                        // void throws IOError
await fs.copyFile("src.txt", "dst.txt")               // void throws IOError
await fs.moveFile("old.txt", "new.txt")               // void throws IOError

// директории
await fs.mkdir("mydir")                               // void throws IOError
await fs.mkdir("a/b/c", { recursive: true })          // создать вложенные
await fs.rmdir("mydir")                               // void throws IOError
await fs.rmdir("mydir", { recursive: true })          // удалить со содержимым
const entries = await fs.readDir(".")                 // DirEntry[] throws IOError

// мета
const exists = await fs.exists("file.txt")            // boolean
const info   = await fs.stat("file.txt")              // FileStat throws IOError
const isFile = await fs.isFile("file.txt")            // boolean
const isDir  = await fs.isDir("mydir")                // boolean
```

Типы:

```typescript
interface DirEntry {
    name: string        // имя файла/директории
    path: string        // полный путь
    isFile: boolean
    isDir: boolean
}

interface FileStat {
    size: i64           // размер в байтах
    createdAt: Date
    modifiedAt: Date
    isFile: boolean
    isDir: boolean
}
```

## std/net

Реализация зависит от платформы: POSIX sockets на desktop/server, lwIP на embedded.

### fetch (глобальный)

```typescript
// GET
const res = await fetch("https://api.example.com/users")
const users = await res.json<User[]>()

// POST
const res = await fetch("https://api.example.com/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
})

// Response
res.status    // i32 — 200, 404, 500...
res.ok        // boolean — status 200-299
res.headers   // Map<string, string>
await res.text()        // string throws NetworkError
await res.json<T>()     // T throws NetworkError | ParseError
await res.bytes()       // u8[] throws NetworkError
```

### HTTP сервер

```typescript
import { HttpServer, HttpRequest, HttpResponse } from "std/net"

const server = new HttpServer(async (req: HttpRequest, res: HttpResponse) => {
    if (req.method === "GET" && req.path === "/") {
        res.status = 200
        res.headers.set("Content-Type", "text/plain")
        await res.send("Hello, World!")
    } else {
        res.status = 404
        await res.send("Not Found")
    }
})

await server.listen(8080)
console.log("listening on :8080")
```

```typescript
interface HttpRequest {
    method:  string               // "GET", "POST", ...
    path:    string               // "/users/42"
    headers: Map<string, string>
    body:    string | null
}

interface HttpResponse {
    status:  i32
    headers: Map<string, string>
    send(body: string): void throws IOError
    send(body: u8[]): void throws IOError
    json<T>(data: T): void throws IOError
}
```

### TCP сокеты

```typescript
import { TCPSocket, TCPServer } from "std/net"

// клиент
const socket = await TCPSocket.connect("localhost", 8080)  // throws NetworkError
await socket.write("hello\n")
const line = await socket.readLine()   // string | null
socket.close()

// сервер
const server = new TCPServer()
await server.listen(8080)
while (true) {
    const client = await server.accept()   // TCPSocket
    const data = await client.readAll()
    await client.write("ok")
    client.close()
}
```

### UDP сокеты

```typescript
import { UDPSocket } from "std/net"

const socket = new UDPSocket()
await socket.bind(8080)

// отправка
await socket.send("192.168.1.1", 8080, bytes)

// приём
const { data, addr, port } = await socket.recv()  // throws NetworkError
```

## std/ws

WebSocket клиент и сервер. Работает на desktop/server и embedded (например ESP32 + lwIP).

```typescript
import { WebSocket, WebSocketServer } from "std/ws"

// клиент
const ws = await WebSocket.connect("ws://localhost:8080")  // throws NetworkError

ws.onMessage((data: string) => {
    console.log("received:", data)
})

ws.onClose(() => {
    console.log("disconnected")
})

await ws.send("hello")
await ws.close()

// бинарные данные
ws.onMessage((data: u8[]) => { ... })
await ws.sendBytes(bytes)

// сервер
const server = new WebSocketServer()

server.onConnect((client: WebSocket) => {
    client.onMessage((data: string) => {
        client.send(`echo: ${data}`)
    })
})

await server.listen(8080)
```

## std/math

`Math` — глобальный объект, импорт не нужен.

### Константы

```typescript
Math.PI       // 3.141592653589793
Math.E        // 2.718281828459045
Math.SQRT2    // 1.4142135623730951
Math.LN2      // 0.6931471805599453
Math.LN10     // 2.302585092994046
Math.LOG2E    // 1.4426950408889634
Math.LOG10E   // 0.4342944819032518
```

### Методы

```typescript
// округление
Math.floor(4.7)       // f64 → f64 — 4.0
Math.ceil(4.2)        // f64 → f64 — 5.0
Math.round(4.5)       // f64 → f64 — 5.0
Math.trunc(4.9)       // f64 → f64 — 4.0

// арифметика
Math.abs(-5)          // перегрузка: i32|f64 → тот же тип
Math.pow(2.0, 10.0)   // f64 → f64 — 1024.0
Math.sqrt(9.0)        // f64 → f64 — 3.0
Math.cbrt(27.0)       // f64 → f64 — 3.0
Math.hypot(3.0, 4.0)  // f64 → f64 — 5.0

// тригонометрия (радианы)
Math.sin(Math.PI / 2) // 1.0
Math.cos(0.0)         // 1.0
Math.tan(Math.PI / 4) // 1.0
Math.asin(1.0)        // Math.PI / 2
Math.acos(1.0)        // 0.0
Math.atan(1.0)        // Math.PI / 4
Math.atan2(1.0, 1.0)  // Math.PI / 4

// логарифмы
Math.log(Math.E)      // 1.0
Math.log2(8.0)        // 3.0
Math.log10(1000.0)    // 3.0
Math.exp(1.0)         // Math.E

// утилиты
Math.min(3, 1, 4, 1)       // перегрузка: i32|f64 → тот же тип
Math.max(3, 1, 4, 1)       // перегрузка: i32|f64 → тот же тип
Math.clamp(15, 0, 10)      // перегрузка: i32|f64 → тот же тип — 10
Math.sign(-5.0)            // f64 → f64 — -1.0
Math.sign(0.0)             // 0.0
Math.sign(5.0)             // 1.0

// random (0..1, без seed)
Math.random()              // f64 — [0.0, 1.0)
```

## std/string

### Unicode extension methods

Extension methods для работы с Unicode — импортируются явно:

```typescript
import { chars, charCount, graphemes, codePointAt, graphemeAt, sliceChars } from "std/string"

const s = "привет❤️"

s.chars()                  // Iterator<u32> — codepoints (1087, 1088...), O(1) per step
s.charCount()              // i32 — количество codepoints, O(n)
s.graphemes()              // Iterator<string> — графемные кластеры ("п", "р", "❤️")
s.codePointAt(byteIdx)     // u32 — codepoint по байтовому смещению
s.graphemeAt(byteIdx)      // string — графемный кластер по байтовому смещению
s.sliceChars(start, end)   // string — безопасный срез по codepoint-индексам, O(n)
```

`codePointAt(byteIdx)` и `graphemeAt(byteIdx)` принимают **байтовое смещение** — удобно после `indexOf`: смещение уже известно, сканировать с начала не нужно. Декодирование одного UTF-8 символа — O(1..4 байта).

utf8proc (UAX #29, ~300KB, C-native) — используется для сегментации графемных кластеров. Работает на embedded.

```typescript
// паттерн: найти подстроку → получить символ по смещению
const idx = s.indexOf("❤️")        // байтовое смещение, O(n)
if (idx >= 0) {
    const g = s.graphemeAt(idx)    // "❤️", O(1 символа)
}
```

### Regex

```typescript
import { Regex } from "std/string"

const re = new Regex("^\\d+$")
const reLiteral = /^\d+$/          // литеральный синтаксис (как в JS)
const reFlags = /hello/gi          // флаги: g, i, m

re.test("123")                     // boolean
re.match("hello world")            // string[] | null — все совпадения
re.matchAll("aabbcc")              // string[][] — все группы
re.replace("hello", "world")       // string
re.replaceAll("aaa", "b")          // string
re.split("a,b,c")                  // string[]
```

### Кодирование

```typescript
import { base64, hex, url } from "std/string"

// base64
base64.encode(bytes: u8[]): string
base64.decode(s: string): u8[] throws ParseError

// hex
hex.encode(bytes: u8[]): string     // "deadbeef"
hex.decode(s: string): u8[] throws ParseError

// URL
url.encode(s: string): string       // "hello%20world"
url.decode(s: string): string throws ParseError
url.encodeComponent(s: string): string
url.decodeComponent(s: string): string throws ParseError
```

### Форматирование

```typescript
import { format } from "std/string"

format("Hello %s, you are %d years old", name, age)   // string
format("Pi is %.2f", Math.PI)                          // "Pi is 3.14"
format("%05d", 42)                                     // "00042"

// спецификаторы:
// %s — string
// %d — целое число
// %f — float (%.Nf — N знаков после запятой)
// %x — hex (нижний регистр)
// %X — hex (верхний регистр)
// %b — binary
// %o — octal
// %% — литеральный %
```

## std/random

`Math.random()` остаётся как JS-совместимое легаси. `std/random` — полноценный типизированный API.

Единственный метод `next<T>` — тип параметра диктует поведение:

```typescript
rng.next<i32>()           // случайный i32 (весь диапазон)
rng.next<i16>(0, 100)     // i16 в [0, 100)
rng.next<u8>(0, 255)      // u8 в [0, 255)
rng.next<f64>()           // f64 в [0.0, 1.0)
rng.next<f32>(0.0, 5.0)   // f32 в [0.0, 5.0)
rng.next<boolean>()       // boolean
rng.next<u8[]>(16)        // u8[] длиной 16
rng.next<i32[]>(10)       // i32[] длиной 10

rng.shuffle(arr)          // перемешать массив на месте
rng.pick<T>(arr)          // T | null — случайный элемент массива
```

### Random (все платформы)

```typescript
import { Random } from "std/random"

const rng = new Random()            // auto-seed из OS энтропии (desktop/server)
                                    // на embedded — ошибка компилятора
const rng = new Random(42)          // фиксированный seed — воспроизводимо (все платформы)

const a = rng.next<i32>(0, 100)
```

### SecureRandom — криптографически стойкий (desktop/server)

```typescript
import { SecureRandom } from "std/random"

const secure = new SecureRandom()
const key = secure.next<u8[]>(32)   // 32 случайных байта из OS
// на embedded — ошибка компилятора
```

### HardwareRandom — аппаратный источник (embedded)

```typescript
import { HardwareRandom } from "std/random"

const hw = new HardwareRandom()     // ADC шум, аппаратный RNG, таймер
const seed = hw.next<u32>()         // получить seed из железа
const rng = new Random(seed)        // использовать как seed для Random
// на desktop/server — ошибка компилятора
```

## std/temporal

Полноценная замена legacy `Date`. Основан на TC39 Temporal proposal. Все объекты **иммутабельны**. Месяцы **1-based** (январь = 1).

```typescript
import { PlainDate, PlainTime, PlainDateTime, Instant, ZonedDateTime, Duration, Now } from "std/temporal"
```

### PlainDate

```typescript
const d = PlainDate.from("2024-03-20")
const d = new PlainDate(2024, 3, 20)    // year, month (1-12), day

d.year    // i32 — 2024
d.month   // i32 — 3 (март, 1-based!)
d.day     // i32 — 20
d.dayOfWeek  // i32 — 1=пн, 7=вс

d.add({ days: 10 })           // PlainDate
d.subtract({ months: 1 })     // PlainDate
d.until(other)                // Duration
d.since(other)                // Duration
d.toString()                  // "2024-03-20"
```

### PlainTime

```typescript
const t = PlainTime.from("14:30:00")
const t = new PlainTime(14, 30, 0)      // hour, minute, second

t.hour    // i32
t.minute  // i32
t.second  // i32

t.add({ hours: 2 })           // PlainTime
t.toString()                  // "14:30:00"
```

### PlainDateTime

```typescript
const dt = PlainDateTime.from("2024-03-20T14:30:00")
const dt = new PlainDateTime(2024, 3, 20, 14, 30, 0)

dt.date   // PlainDate
dt.time   // PlainTime
dt.year   // i32
dt.month  // i32
dt.day    // i32
dt.hour   // i32
dt.minute // i32
dt.second // i32

dt.add({ days: 1, hours: 2 })  // PlainDateTime
dt.until(other)                // Duration
dt.toString()                  // "2024-03-20T14:30:00"
```

### Instant

```typescript
const i = Instant.from("2024-03-20T14:30:00Z")
const i = Now.instant()         // текущий момент

i.epochSeconds      // i64
i.epochMilliseconds // i64
i.epochNanoseconds  // i64

i.add({ hours: 1 })    // Instant
i.until(other)         // Duration
i.toString()           // "2024-03-20T14:30:00Z"
```

### Duration

```typescript
const dur = Duration.from({ years: 1, months: 2, days: 3, hours: 4 })

dur.years   // i32
dur.months  // i32
dur.days    // i32
dur.hours   // i32
dur.minutes // i32
dur.seconds // i32

dur.total("hours")   // f64 — всё в часах
dur.toString()       // "P1Y2M3DT4H"
```

### ZonedDateTime (только desktop/server)

```typescript
import { ZonedDateTime } from "std/temporal"

const zdt = ZonedDateTime.from("2024-03-20T14:30:00[Europe/Moscow]")
const zdt = Now.zonedDateTime("Europe/Moscow")  // текущее время в timezone

zdt.timeZone  // string — "Europe/Moscow"
zdt.offset    // string — "+03:00"
zdt.toPlainDateTime()   // PlainDateTime (без timezone)
zdt.toInstant()         // Instant

// на embedded — ошибка компилятора (нет tzdata)
```

### Now

```typescript
Now.instant()                      // Instant — текущий момент UTC
Now.plainDate()                    // PlainDate — сегодня (системный timezone)
Now.plainTime()                    // PlainTime — текущее время
Now.plainDateTime()                // PlainDateTime
Now.zonedDateTime("Europe/Moscow") // ZonedDateTime (desktop/server only)
```

## std/threads

Только для desktop/server — на embedded ошибка компилятора (нет OS scheduler).

Подробное описание API — в разделе [Concurrency → Threads (std/threads)](#2-threads-stdthread----продвинутый-уровень).

```typescript
import { Thread, channel } from "std/threads"
```

## std/reactive

Только для **desktop** — на embedded ошибка компилятора (нет heap-async).

Реактивность с явными зависимостями (explicit-deps, React-style). Auto-tracking (Vue/SolidJS) не поддерживается — требует interior mutability в `get()`, что нарушает гарантии `Shared<T>`.

```typescript
import { signal, computed, effect } from "std/reactive"
```

### Signal\<T\>

Реактивное значение. Владелец хранит `Signal<T>` owned, дочерние компоненты получают `Ref<Signal<T>>` или `Mut<Signal<T>>` для подписки.

```typescript
class CounterStore {
    count:   Signal<i32>   = signal(0)
    name:    Signal<string> = signal("Alice")
    doubled: Signal<i32>   = computed([this.count], () => this.count.get() * 2)

    mut increment(): void { this.count.set(this.count.get() + 1) }
    mut rename(n: string): void { this.name.set(n) }
}
```

### effect

Регистрирует функцию-подписчик. Принимает явный список зависимостей (`Mut<Signal<any>>[]`), вызывает `fn` сразу и при каждом изменении любой зависимости.

```typescript
let store = new CounterStore()

effect([store.count, store.name], () => {
    console.log(`${store.name.get()}: ${store.count.get()} (x2 = ${store.doubled.get()})`)
})
// → сразу: "Alice: 0 (x2 = 0)"

store.increment()  // → "Alice: 1 (x2 = 2)"
store.rename("Bob") // → "Bob: 1 (x2 = 2)"
```

### computed

Производное реактивное значение. Пересчитывается при изменении зависимостей:

```typescript
let doubled = computed([store.count], () => store.count.get() * 2)
// doubled — Signal<i32>, можно передавать как Ref<Signal<i32>>
```

### Реализация (std/reactive.tsc)

```typescript
export class Signal<T> {
    private value: T
    private subscribers: Array<() => void> = []

    constructor(initial: T) { this.value = initial }

    get(): T { return this.value }

    mut set(v: T): void {
        this.value = v
        this.subscribers.forEach(fn => fn())
    }

    mut subscribe(fn: () => void): void {
        this.subscribers.push(fn)
    }
}

export function signal<T>(initial: T): Signal<T> {
    return new Signal(initial)
}

export function effect(deps: Mut<Signal<any>>[], fn: () => void): void {
    deps.forEach(dep => dep.subscribe(fn))
    fn()
}

export function computed<T>(deps: Mut<Signal<any>>[], fn: () => T): Signal<T> {
    let result = signal(fn())
    effect(deps, () => result.set(fn()))
    return result
}
```

> **Отличие от Vue:** в TSClang зависимости указываются явно (`effect([a, b], fn)`). Пропущенная зависимость не вызовет перезапуск — это намеренное ограничение: нет магии, нет interior mutability, чистая библиотека без поддержки компилятора.
