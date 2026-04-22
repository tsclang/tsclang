# TSClang — std/net: реализация

> Детальная спецификация реализации `std/net`.
> Шаг 3 в плане: документация → тесты → реализация.

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
| `await fetch(url)` | `tsc_fetch_async(url, NULL)` / `tsc_fetch_poll` | уже есть |
| `await fetch(url, opts)` | `tsc_fetch_async(url, &opts)` / `tsc_fetch_poll` | уже есть |
| `await net.connect(host, port)` | `tsc_net_connect_async(host, port)` / `tsc_net_connect_poll` | уже есть |
| `sock.close()` | `tsc_socket_close(&sock)` | уже есть |
| `await sock.write(data)` | `tsc_socket_write_async(&sock, data)` / `tsc_socket_write_poll` | NEW |
| `await sock.readLine()` | `tsc_socket_readline_async(&sock)` / `tsc_socket_readline_poll` | NEW |
| `await sock.readAll()` | `tsc_socket_readall_async(&sock)` / `tsc_socket_readall_poll` | NEW |
| `new HttpServer(port)` | `tsc_http_server_create(port)` | уже есть |
| `server.get(path, h)` | `tsc_http_server_get(&s, path, h)` | уже есть |
| `server.post(path, h)` | `tsc_http_server_post(&s, path, h)` | уже есть |
| `server.listen()` | `tsc_http_server_listen(&s)` | уже есть |
| `res.text(body)` | `tsc_response_text(&res, body)` | уже есть |
| `res.json(body)` | `tsc_response_json(&res, body)` | уже есть |
| `req.param(key)` | `tsc_request_param(&req, key)` | уже есть |
| `net.listen(port, h)` | `tsc_net_listen(port, h)` | уже есть |
| `new UDPSocket()` | `tsc_udp_create()` | NEW |
| `await udp.bind(port)` | `tsc_udp_bind_async(&udp, port)` / `tsc_udp_bind_poll` | NEW |
| `await udp.send(addr, port, data)` | `tsc_udp_send_async(&udp, addr, port, data.data, data.length)` / `tsc_udp_send_poll` | NEW |
| `await udp.receive()` | `tsc_udp_receive_async(&udp)` / `tsc_udp_receive_poll` | NEW |

## Реализация (шаг 3)

- `tsc_fetch_async`: `uv_tcp_connect` → HTTP/1.1 GET/POST → parse status line + headers + body
- `tsc_net_connect_async`: `uv_tcp_t` connect → TscSocket{ ._fd = handle index }
- `tsc_socket_write_async`: `uv_write` request на tcp stream
- `tsc_socket_readline_async`: `uv_read_start` + scan ring buffer for `\n`
- `tsc_socket_readall_async`: `uv_read_start` до EOF → heap String
- HTTP сервер: `uv_tcp_t` listen → accept → mini HTTP/1.1 parser → route handlers
- UDP: `uv_udp_t` bind/send/recv

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
| socket-write | `doc/phase19/net/socket-write` | ✗ ждёт шага 3 |
| socket-readline | `doc/phase19/net/socket-readline` | ✗ ждёт шага 3 |
| udp-socket | `doc/phase19/net/udp-socket` | ✗ ждёт шага 3 |
| err-net-embedded | `doc/phase19/net/err-net-embedded` | ✓ проходит |
