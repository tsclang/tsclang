# std/ws

[← Up](./index.md) | [Next →](./string.md) | [Previous ←](./net.md)

---

WebSocket client and server. Works on desktop/server, on top of `std/net` TCP. Implementation: RFC 6455 frame parser/encoder.

## Import

```typescript
import { WebSocket, WebSocketServer } from "std/ws"
```

## Client

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

### Binary data

```typescript
ws.onMessage((data: u8[]) => {
    console.log("received", data.length, "bytes")
})
await ws.sendBytes(bytes)
```

## Server

```typescript
const server = new WebSocketServer()

server.onConnect((client: WebSocket) => {
    client.onMessage((data: string) => {
        client.send(`echo: ${data}`)
    })
})

await server.listen(8080)
```

## Example: chat server

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

## Errors

| Error | Cause |
|-------|-------|
| `std/ws is not available on target "avr"` | `std/ws` on top of `std/net` |
| `NetworkError: connection refused` | WebSocket server not responding |
| `NetworkError: handshake failed` | Server did not return `101 Switching Protocols` |

## See also

- [std/net](./net.md) — TCP/UDP, HTTP server
- [std/json](./json.md) — parsing JSON messages
- [Global objects](./globals.md) — `Map` for storing connections
