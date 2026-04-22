/* std/ws.h — TSClang WebSocket stubs (compile-only for [F] tests) */
#pragma once
#include <stdint.h>
#include <stdbool.h>

typedef void (*TscMessageCallback)(String msg);
typedef void (*TscWsConnectCallback)(struct _TscWebSocket *ws);
typedef void (*TscWsCloseCallback)(void);

typedef struct _TscWebSocket { int32_t _fd; } TscWebSocket;
typedef struct { bool _done; TscWebSocket _result; } TscWsConnectAwaitable;
typedef struct { bool _done; }                        TscWsSendAwaitable;
typedef struct { int32_t _fd; }                       TscWebSocketServer;

static inline TscWebSocket tsc_ws_connect(String url) {
    (void)url; return (TscWebSocket){-1};
}

static inline TscWsConnectAwaitable tsc_ws_connect_async(String url) {
    (void)url; return (TscWsConnectAwaitable){0};
}
static inline void tsc_ws_connect_poll(TscWsConnectAwaitable *a) { a->_done = true; }

static inline void tsc_ws_close(TscWebSocket *ws) { (void)ws; }
static inline void tsc_ws_send(TscWebSocket *ws, String msg) { (void)ws; (void)msg; }

static inline TscWsSendAwaitable tsc_ws_send_async(TscWebSocket *ws, String msg) {
    (void)ws; (void)msg; return (TscWsSendAwaitable){0};
}
static inline void tsc_ws_send_poll(TscWsSendAwaitable *a) { a->_done = true; }

static inline void tsc_ws_send_bytes(TscWebSocket *ws, const uint8_t *data, size_t len) {
    (void)ws; (void)data; (void)len;
}
static inline void tsc_ws_on_message(TscWebSocket *ws, TscMessageCallback cb) {
    (void)ws; (void)cb;
}
static inline void tsc_ws_on_close(TscWebSocket *ws, TscWsCloseCallback cb) {
    (void)ws; (void)cb;
}

static inline TscWebSocketServer tsc_ws_server_create(void) {
    return (TscWebSocketServer){-1};
}
static inline void tsc_ws_server_on_connect(TscWebSocketServer *srv, TscWsConnectCallback cb) {
    (void)srv; (void)cb;
}
static inline void tsc_ws_server_listen(TscWebSocketServer *srv, int32_t port) {
    (void)srv; (void)port;
}
