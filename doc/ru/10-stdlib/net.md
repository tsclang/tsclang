# std/net

[← Вверх](./index.md) | [Следующий →](./ws.md) | [Предыдущий ←](./fs.md)

---

Сетевые операции: `fetch`, HTTP-сервер, TCP и UDP сокеты. Только desktop/server — на embedded ошибка компилятора.

Реализация: POSIX sockets на desktop/server, lwIP на embedded (ARM с TCP/IP стеком).

## fetch

Глобальная функция — импорт не нужна.

```typescript
const res = await fetch("https://api.example.com/users")
const users = await res.json<User[]>()
```

### POST-запрос

```typescript
const res = await fetch("https://api.example.com/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
})
```

### Response

```typescript
res.status    // i32 — 200, 404, 500...
res.ok        // boolean — status 200-299
res.headers   // Map<string, string>
await res.text()        // string throws NetworkError
await res.json<T>()     // T throws NetworkError | ParseError
await res.bytes()       // u8[] throws NetworkError
```

## HTTP-сервер

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

### Типы запроса и ответа

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

## TCP сокеты

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

## UDP сокеты

```typescript
import { UDPSocket } from "std/net"

const socket = new UDPSocket()
await socket.bind(8080)

// отправка
await socket.send("192.168.1.1", 8080, bytes)

// приём
const { data, addr, port } = await socket.receive()  // throws NetworkError
```

## Пример: REST API

```typescript
import { HttpServer, HttpRequest, HttpResponse } from "std/net"
import { JSON } from "std/json"

const users = new Map<string, User>()

const server = new HttpServer(async (req, res) => {
    if (req.method === "GET" && req.path.startsWith("/users/")) {
        const id = req.path.slice(7)
        const user = users.get(id)
        if (user != null) {
            res.status = 200
            res.json(user)
        } else {
            res.status = 404
            await res.send("Not Found")
        }
    } else if (req.method === "POST" && req.path === "/users") {
        const user = JSON.parse<User>(req.body!)
        users.set(user.id, user)
        res.status = 201
        await res.send("Created")
    }
})

await server.listen(8080)
```

C-output:

```c
typedef struct { bool ok; int32_t status; String body; } TscResponse;
typedef struct { int32_t _fd; } TscSocket;
typedef struct { bool _done; TscSocket _result; } TscConnectAwaitable;
typedef struct { int32_t _fd; } TscUdpSocket;
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `std/net is not available on target "avr"` | `std/net` требует TCP/IP стек |
| `NetworkError: connection refused` | Сервер не отвечает |
| `NetworkError: timeout` | Таймаут соединения |
| `ParseError: invalid JSON` | Невалидный JSON в `res.json()` |

## См. также

- [std/ws](./ws.md) — WebSocket поверх `std/net`
- [std/io](./io.md) — `Reader`/`Writer`
- [std/json](./json.md) — JSON-парсинг
- [Обработка ошибок](../06-errors/index.md) — `throws NetworkError`
