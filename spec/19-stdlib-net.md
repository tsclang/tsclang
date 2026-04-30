# TSClang — std/net: реализация

> Детальная спецификация реализации `std/net`.
> Реализовано.

## Зависимости

- Desktop TCP: libuv `uv_tcp_t`
- Desktop HTTP: mini HTTP/1.1 parser (ручной) или `llhttp`
- `fetch`: libuv + mini HTTP/1.1 клиент (или `libcurl` как опция)
- Embedded: ошибка компилятора (нет BSD sockets)

## Типы

```c
/* HTTP */
typedef struct { bool ok; int32_t status; String body; }          TscResponse;
typedef struct { String url; String method; String body; }         TscRequest;
typedef struct { String method; String body; }                     TscFetchOptions;
typedef struct { bool _done; struct { bool ok; TscResponse value; } _result; } TscFetchAwaitable;

/* TCP Socket */
typedef struct { int32_t _fd; }                                    TscSocket;
typedef struct { bool _done; TscSocket _result; }                  TscConnectAwaitable;
typedef struct { bool _done; }                                     TscSocketWriteAwaitable;
typedef struct { bool _done; String _result; bool _eof; }          TscSocketReadLineAwaitable;
typedef struct { bool _done; String _result; }                     TscSocketReadAllAwaitable;
typedef struct { bool _done; TscSocket _result; }                  TscServerAcceptAwaitable;

/* UDP */
typedef struct { int32_t _fd; }                                    TscUdpSocket;
typedef struct { bool _done; }                                     TscUdpBindAwaitable;
typedef struct { bool _done; }                                     TscUdpSendAwaitable;
typedef struct {
    uint8_t *data; size_t length;
    String   addr; int32_t port;
} TscUdpPacket;
typedef struct { bool _done; TscUdpPacket _result; }               TscUdpReceiveAwaitable;

/* TCP Server */
typedef struct { int32_t _fd; }                                    TscTcpServer;
typedef struct { bool _done; }                                     TscServerListenAwaitable;

/* HTTP Server */
typedef void (*TscRouteHandler)(TscRequest *req, TscResponse *res);
typedef struct { int32_t port; }                                   TscHttpServer;
```

## Функции

| TSClang | C-функция | Статус |
|---------|-----------|--------|
| `await fetch(url)` | `tsc_fetch_async(url, NULL)` / `tsc_fetch_poll` | ✓ |
| `await fetch(url, opts)` | `tsc_fetch_async(url, &opts)` / `tsc_fetch_poll` | ✓ |
| `await net.connect(host, port)` | `tsc_net_connect_async(host, port)` / `tsc_net_connect_poll` | ✓ |
| `sock.close()` | `tsc_socket_close(&sock)` | ✓ |
| `await sock.write(data)` | `tsc_socket_write_async(&sock, data)` / `tsc_socket_write_poll` | ✓ |
| `await sock.readLine()` | `tsc_socket_readline_async(&sock)` / `tsc_socket_readline_poll` | ✓ |
| `await sock.readAll()` | `tsc_socket_readall_async(&sock)` / `tsc_socket_readall_poll` | ✓ |
| `new HttpServer(port)` | `tsc_http_server_create(port)` | ✓ |
| `server.get(path, h)` | `tsc_http_server_get(&s, path, h)` | ✓ |
| `server.post(path, h)` | `tsc_http_server_post(&s, path, h)` | ✓ |
| `server.listen()` | `tsc_http_server_listen(&s)` | ✓ |
| `res.text(body)` | `tsc_response_text(&res, body)` | ✓ |
| `res.json(body)` | `tsc_response_json(&res, body)` | ✓ |
| `req.param(key)` | `tsc_request_param(&req, key)` | ✓ |
| `net.listen(port, h)` | `tsc_net_listen(port, h)` | ✓ |
| `new UDPSocket()` | `tsc_udp_create()` | ✓ |
| `await udp.bind(port)` | `tsc_udp_bind_async(&udp, port)` / `tsc_udp_bind_poll` | ✓ |
| `await udp.send(addr, port, data)` | `tsc_udp_send_async(&udp, addr, port, data.data, data.length)` / `tsc_udp_send_poll` | ✓ |
| `await udp.receive()` | `tsc_udp_receive_async(&udp)` / `tsc_udp_receive_poll` | ✓ |

## Реализация

- `tsc_fetch_async`: BSD socket → HTTP/1.1 GET/POST → parse status line + headers + body
- `tsc_net_connect_async`: `getaddrinfo` + `connect` → `TscSocket{ ._fd }`
- `tsc_socket_write_async`: POSIX `write` loop
- `tsc_socket_readline_async`: `recv` побайтово до `\n`
- `tsc_socket_readall_async`: `recv` loop до EOF → heap String
- HTTP сервер: `socket`/`bind`/`listen`/`accept` → mini HTTP/1.1 parser → route handlers
- UDP: `socket(SOCK_DGRAM)`, `bind`, `sendto`, `recvfrom`

## Тесты

| Тест | Файл | Статус |
|------|------|--------|
| fetch-get | `doc/phase19/net/fetch-get` | ✓ проходит |
| fetch-post | `doc/phase19/net/fetch-post` | ✓ проходит |
| response-props | `doc/phase19/net/response-props` | ✓ проходит |
| request-props | `doc/phase19/net/request-props` | ✓ проходит |
| http-server | `doc/phase19/net/http-server` | ✓ проходит |
| server-routes | `doc/phase19/net/server-routes` | ✓ проходит |
| tcp-connect | `doc/phase19/net/tcp-connect` | ✓ проходит |
| tcp-server | `doc/phase19/net/tcp-server` | ✓ проходит |
| socket-write | `doc/phase19/net/socket-write` | ✓ проходит |
| socket-readline | `doc/phase19/net/socket-readline` | ✓ проходит |
| udp-socket | `doc/phase19/net/udp-socket` | ✓ проходит |
| err-net-embedded | `doc/phase19/net/err-net-embedded` | ✓ проходит |
