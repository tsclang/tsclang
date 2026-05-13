# std/net

[← Up](./index.md) | [Next →](./ws.md) | [Previous ←](./fs.md)

---

Network operations: `fetch`, HTTP server, TCP and UDP sockets. Desktop/server only — on embedded compiler error.

Implementation: POSIX sockets on desktop/server, lwIP on embedded (ARM with TCP/IP stack).

## fetch

Global function — no import needed.

```typescript
const res = await fetch("https://api.example.com/users")
const users = await res.json<User[]>()
```

### POST request

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

## HTTP server

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

### Request and response types

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

## TCP sockets

```typescript
import { TCPSocket, TCPServer } from "std/net"

// client
const socket = await TCPSocket.connect("localhost", 8080)  // throws NetworkError
await socket.write("hello\n")
const line = await socket.readLine()   // string | null
socket.close()

// server
const server = new TCPServer()
await server.listen(8080)
while (true) {
    const client = await server.accept()   // TCPSocket
    const data = await client.readAll()
    await client.write("ok")
    client.close()
}
```

## UDP sockets

```typescript
import { UDPSocket } from "std/net"

const socket = new UDPSocket()
await socket.bind(8080)

// send
await socket.send("192.168.1.1", 8080, bytes)

// receive
const { data, addr, port } = await socket.receive()  // throws NetworkError
```

## Example: REST API

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

## Errors

| Error | Cause |
|-------|-------|
| `std/net is not available on target "avr"` | `std/net` requires TCP/IP stack |
| `NetworkError: connection refused` | Server not responding |
| `NetworkError: timeout` | Connection timeout |
| `ParseError: invalid JSON` | Invalid JSON in `res.json()` |

## See also

- [std/ws](./ws.md) — WebSocket on top of `std/net`
- [std/io](./io.md) — `Reader`/`Writer`
- [std/json](./json.md) — JSON parsing
- [Error handling](../06-errors/index.md) — `throws NetworkError`
