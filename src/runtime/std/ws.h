/* std/ws.h — TSClang WebSocket stubs (compile-only for [F] tests) */
#pragma once
#include <stdint.h>
#include <stdbool.h>

typedef void (*TscMessageCallback)(String msg);
typedef struct { int32_t _fd; } TscWebSocket;

static inline TscWebSocket tsc_ws_connect(String url) {
    (void)url; return (TscWebSocket){-1};
}
static inline void tsc_ws_close(TscWebSocket *ws) { (void)ws; }
static inline void tsc_ws_send(TscWebSocket *ws, String msg) { (void)ws; (void)msg; }
static inline void tsc_ws_on_message(TscWebSocket *ws, TscMessageCallback cb) {
    (void)ws; (void)cb;
}
