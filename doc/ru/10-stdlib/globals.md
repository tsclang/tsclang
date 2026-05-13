# Глобальные объекты

[← Вверх](./index.md) | [Следующий →](./console.md) | [Предыдущий ←](./index.md)

---

Глобальные объекты и функции — импорт не нужен. Доступны на всех платформах, если не указано иное.

## console

Подробная документация — [console](./console.md).

```typescript
console.log("hello")
console.error("error")
console.warn("warning")
console.info("info")
console.debug("debug")
console.time("op")
console.timeEnd("op")
```

## Math

Подробная документация — [Math](./math.md).

```typescript
Math.PI            // 3.141592653589793
Math.abs(-5)       // 5
Math.floor(4.7)    // 4.0
Math.sqrt(9.0)     // 3.0
Math.random()      // f64 — [0.0, 1.0)
```

## Таймеры

```typescript
const id = setTimeout(() => console.log("hello"), 1000)  // i64 — id таймера
clearTimeout(id)

const tick = setInterval(() => update(), 100)  // i64 — id интервала
clearInterval(tick)
```

`setTimeout` и `setInterval` возвращают `i64` — идентификатор таймера. Доступны на всех платформах.

## sleep

```typescript
await sleep(500)  // пауза 500мс
```

Доступно на всех платформах. Используется только внутри `async`-функций.

## performance

Высокоточный таймер.

```typescript
performance.now()  // f64 — миллисекунды с момента старта программы
```

### performance.mark / measure — только desktop

```typescript
performance.mark("start")
// ... работа ...
performance.mark("end")
const entry = performance.measure("my-work", "start", "end")
// entry: { name: string, duration: f64, startTime: f64 }
```

## process — только desktop/server

```typescript
process.exit(0)
process.argv   // string[] — аргументы командной строки
process.env    // Map<string, string> — переменные окружения
```

На embedded-таргетах `process.*` — ошибка компилятора (нет OS, нет процесса).

### process.stdin / stdout / stderr

```typescript
const line = await process.stdin.readLine()   // string | null (null = EOF)
const all  = await process.stdin.readAll()     // string

await process.stdout.write("hello")
await process.stderr.write("error\n")
```

`process.stdin` реализует `Reader`, `process.stdout` / `process.stderr` — `Writer` (см. [std/io](./io.md)).

## Error

Базовый класс для всех ошибок — импорт не нужен.

```typescript
class Error {
    message: string
    constructor(message: string) { this.message = message }
}
```

`throw` принимает только экземпляры классов, наследующих `Error`:

```typescript
class IOError extends Error { }
class NetworkError extends Error {
    code: i32
    constructor(msg: string, code: i32) {
        super(msg)
        this.code = code
    }
}

throw new IOError("not found")           // ok
throw new NetworkError("timeout", 408)   // ok
throw "oops"                             // ошибка: string не Error
throw new MyClass()                      // ошибка: MyClass не наследует Error
```

## Map\<K, V\>

Глобальный hash map с открытой адресацией. Импорт не нужен.

**Допустимые типы ключей K:** примитивы (`i8`..`i64`, `u8`..`u64`, `f32`, `f64`, `boolean`), `string`, `enum`. Классы и интерфейсы — ошибка компилятора.

```typescript
const m = new Map<string, i32>()

m.set("alice", 42)             // void — move value в map
const v = m.get("alice")       // i32 | null
const v = m.get("alice") ?? 0  // дефолт через ??

m.has("alice")    // boolean
m.delete("alice") // i32 | null — удалённое значение или null
m.size            // i32, readonly

for (const [key, value] of m) { }   // по парам
for (const key of m.keys()) { }
for (const value of m.values()) { }

m.clear()  // void — удаляет все элементы
```

### Ownership

- `m.set(key, value)` — move `value` в map
- `m.get(key)` — `Ref<V> | null` для сложных типов, `V | null` для примитивов
- `m.delete(key)` — owned value или `null`

```typescript
const users = new Map<string, User>()
users.set("alice", new User("Alice", 30))  // move

const u: Ref<User> | null = users.get("alice")  // borrow
if (u != null) console.log(u.name)
```

### Map на embedded

На `allocator: "static"` — `new Map<K,V>(N)` с compile-time capacity:

```typescript
@static const hotkeys = new Map<u8, Action>(16)  // 16 слотов в BSS
```

На `allocator: "none"` — `Map` недоступен. Альтернативы: `switch`, массив по индексу, `HashMap<K,V,N>` из `std/embedded`, `StaticMap`.

## Buffer

Байтовый буфер. Импорт не нужен.

```typescript
const buf = Buffer.alloc(1024)
const buf = Buffer.alloc(256, 0xFF)
const buf = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f])
const buf = Buffer.from("hello", "utf8")
const buf = Buffer.from("aGVsbG8=", "base64")

buf.length              // usize, readonly
buf[0]                  // u8 — чтение
buf[0] = 0xFF           // запись

buf.view(4, 12)         // Slice<u8> — zero-copy view
buf.viewMut(0, 4)       // MutSlice<u8> — мутабельный view

buf.copy(target, targetStart?, sourceStart?, sourceEnd?)  // usize
buf.fill(value: u8, start?, end?)                         // void
buf.indexOf(value: u8, start?)                            // i32, -1 если не найдено

buf.toString("utf8")    // string — "utf8" | "ascii" | "hex" | "base64"
```

## DataView

Чтение/запись примитивов в `Buffer` по произвольным смещениям с контролем endianness.

```typescript
const buf = Buffer.alloc(64)
const dv = new DataView(buf)         // весь буфер
const dv = new DataView(buf, 4, 16)  // byteOffset=4, byteLength=16

dv.getU8(offset)
dv.getI16(offset, littleEndian?)   // littleEndian по умолчанию = false (big-endian)
dv.getU32(offset, littleEndian?)
dv.getF64(offset, littleEndian?)
// ... аналогично для I8, U16, I32, U64, I64, F32

dv.setU8(offset, value)
dv.setU32(offset, value, littleEndian?)
// ... аналогично для всех типов
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `string is not assignable to Error` | `throw` принимает только `Error`-наследников |
| `class MyClass does not extend Error` | Класс брошен в `throw` без наследования `Error` |
| `std/fs is not available on target "avr"` | `process.*` на embedded |
| `map overflow: capacity N exceeded` | Переполнение статического `Map` на embedded |

## См. также

- [console](./console.md) — подробное API логирования
- [Math](./math.md) — константы и математические функции
- [std/io](./io.md) — `Reader`, `Writer`, `process.stdin`/`stdout`
- [std/hal и embedded](./hal.md) — `HashMap<K,V,N>`, `StaticMap` для embedded
- [Обработка ошибок](../06-errors/index.md) — `throw`/`try`/`catch`, `throws`
