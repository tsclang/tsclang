# TSClang — std/ws: реализация

> Детальная спецификация реализации `std/ws`.
> Реализовано.

## Зависимости

- Desktop: поверх `std/net` TCP; WebSocket handshake (RFC 6455) + frame parser/encoder
- Embedded (ESP32): через `std/net` lwIP (те же TscSocket)
- Нет отдельной зависимости от libuv — использует те же TCP сокеты что и `std/net`

## Типы

```c
typedef void (*TscMessageCallback)(String msg);
typedef void (*TscWsConnectCallback)(TscWebSocket *ws);
typedef void (*TscWsCloseCallback)(void);

typedef struct _TscWebSocket { int32_t _fd; }              TscWebSocket;
typedef struct { bool _done; TscWebSocket _result; }       TscWsConnectAwaitable;
typedef struct { bool _done; }                             TscWsSendAwaitable;
typedef struct { int32_t _fd; }                            TscWebSocketServer;
```

## Функции

| TSClang | C-функция | Статус |
|---------|-----------|--------|
| `new WebSocket(url)` | `tsc_ws_connect(url)` | ✓ |
| `await WebSocket.connect(url)` | `tsc_ws_connect_async(url)` / `tsc_ws_connect_poll` | ✓ |
| `ws.send(msg)` | `tsc_ws_send(&ws, msg)` | ✓ |
| `await ws.send(msg)` | `tsc_ws_send_async(&ws, msg)` / `tsc_ws_send_poll` | ✓ |
| `ws.sendBytes(data)` | `tsc_ws_send_bytes(&ws, data.data, data.length)` | ✓ |
| `ws.close()` | `tsc_ws_close(&ws)` | ✓ |
| `ws.onMessage(cb)` | `tsc_ws_on_message(&ws, cb)` | ✓ |
| `ws.onClose(cb)` | `tsc_ws_on_close(&ws, cb)` | ✓ |
| `new WebSocketServer()` | `tsc_ws_server_create()` | ✓ |
| `server.onConnect(cb)` | `tsc_ws_server_on_connect(&srv, cb)` | ✓ |
| `server.listen(port)` | `tsc_ws_server_listen(&srv, port)` | ✓ |

## WebSocket frame format (RFC 6455)

```
Byte 0: FIN(1) + RSV1(1) + RSV2(1) + RSV3(1) + opcode(4)
Byte 1: MASK(1) + payload_len(7)
        payload_len == 126 → следующие 2 байта = extended len (big-endian)
        payload_len == 127 → следующие 8 байт = extended len (big-endian)
[4 bytes masking key, если MASK=1]
Payload: data XOR mask (если маскировано)
```

Opcodes:
- `0x0` — continuation frame
- `0x1` — text frame
- `0x2` — binary frame
- `0x8` — connection close
- `0x9` — ping
- `0xA` — pong

Клиент → сервер: MASK=1 (обязательно по RFC).
Сервер → клиент: MASK=0.

## Реализация

- `tsc_ws_connect_async`: TCP connect → HTTP Upgrade request → verify `101 Switching Protocols` → `TscWebSocket{ ._fd }`
- `tsc_ws_send_async`: encode frame (opcode=0x1, FIN=1, masked) → BSD `send`
- `tsc_ws_send_bytes`: encode frame (opcode=0x2, FIN=1, masked) → send
- `tsc_ws_on_message`: `recv` loop → накапливать фреймы → при complete frame вызвать cb
- `tsc_ws_on_close`: регистрирует cb; вызывается при opcode=0x8 или EOF
- `tsc_ws_server_create`: BSD `socket` + bind handle
- `tsc_ws_server_on_connect`: сохраняет callback; при TCP accept → HTTP Upgrade handshake → вызвать cb(ws)
- `tsc_ws_server_listen`: `bind` + `listen` + `accept` loop

## Тесты

| Тест | Файл | Статус |
|------|------|--------|
| client-create | `test/cases/phase19/ws/client-create` | ✓ проходит |
| send | `test/cases/phase19/ws/send` | ✓ проходит |
| on-message | `test/cases/phase19/ws/on-message` | ✓ проходит |
| close | `test/cases/phase19/ws/close` | ✓ проходит |
| connect-async | `test/cases/phase19/ws/connect-async` | ✓ проходит |
| send-bytes | `test/cases/phase19/ws/send-bytes` | ✓ проходит |
| on-close | `test/cases/phase19/ws/on-close` | ✓ проходит |
| ws-server | `test/cases/phase19/ws/ws-server` | ✓ проходит |
