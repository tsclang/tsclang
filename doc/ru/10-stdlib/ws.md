# std/ws

[← Вверх](./index.md) | [Следующий →](./string.md) | [Предыдущий ←](./net.md)

---

WebSocket клиент и сервер. Работает на desktop/server, поверх `std/net` TCP. Реализация: RFC 6455 frame parser/encoder.

## Импорт

```typescript
import { WebSocket, WebSocketServer } from "std/ws"
```

## Клиент

```typescript
const ws = await WebSocket.connect("ws://localhost:8080")  // throws NetworkError

ws.onMessage((data: string) => {
    console.log("received:", data)
})

ws.onClose(() => {
    console.log("disconnected")
})

await ws.send("hello")
await ws.close()
```

### Бинарные данные

```typescript
ws.onMessage((data: u8[]) => {
    console.log("received", data.length, "bytes")
})
await ws.sendBytes(bytes)
```

## Сервер

```typescript
const server = new WebSocketServer()

server.onConnect((client: WebSocket) => {
    client.onMessage((data: string) => {
        client.send(`echo: ${data}`)
    })
})

await server.listen(8080)
```

## Пример: чат-сервер

```typescript
import { WebSocket, WebSocketServer } from "std/ws"

const clients: WebSocket[] = []

const server = new WebSocketServer()

server.onConnect((client: WebSocket) => {
    clients.push(client)

    client.onMessage((data: string) => {
        for (const c of clients) {
            c.send(data)
        }
    })

    client.onClose(() => {
        const idx = clients.indexOf(client)
        if (idx >= 0) clients.splice(idx, 1)
    })
})

await server.listen(8080)
console.log("chat server on :8080")
```

C-output:

```c
typedef struct { int32_t _fd; } TscWebSocket;
typedef struct { int32_t _fd; } TscWebSocketServer;

// WebSocket frame: FIN + opcode + mask + payload (RFC 6455)
// Opcodes: 0x1=text, 0x2=binary, 0x8=close, 0x9=ping, 0xA=pong
// Client→Server: MASK=1 (required by RFC)
// Server→Client: MASK=0
```

## Ошибки

| Ошибка | Причина |
|--------|---------|
| `std/ws is not available on target "avr"` | `std/ws` поверх `std/net` |
| `NetworkError: connection refused` | WebSocket-сервер не отвечает |
| `NetworkError: handshake failed` | Сервер не вернул `101 Switching Protocols` |

## См. также

- [std/net](./net.md) — TCP/UDP, HTTP-сервер
- [std/json](./json.md) — парсинг JSON-сообщений
- [Глобальные объекты](./globals.md) — `Map` для хранения подключений
