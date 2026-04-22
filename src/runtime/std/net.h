/* std/net.h — TSClang networking stubs (compile-only for [F] tests) */
#pragma once
#define TSC_STD_NET_H
#include <stdint.h>
#include <stdbool.h>

typedef struct { bool ok; int32_t status; String body; } TscResponse;
typedef struct { String url; String method; String body; } TscRequest;
typedef struct { String method; String body; } TscFetchOptions;
typedef struct { bool _done; struct { bool ok; TscResponse value; } _result; } TscFetchAwaitable;

typedef struct { int32_t _fd; } TscSocket;
typedef struct { bool _done; TscSocket _result; } TscConnectAwaitable;

typedef void (*TscRouteHandler)(TscRequest *req, TscResponse *res);
typedef struct { int32_t port; } TscHttpServer;

static inline TscFetchAwaitable tsc_fetch_async(String url, TscFetchOptions *opts) {
    (void)url; (void)opts; return (TscFetchAwaitable){0};
}
static inline void tsc_fetch_poll(TscFetchAwaitable *a) { a->_done = true; }

static inline TscConnectAwaitable tsc_net_connect_async(String host, int32_t port) {
    (void)host; (void)port; return (TscConnectAwaitable){0};
}
static inline void tsc_net_connect_poll(TscConnectAwaitable *a) { a->_done = true; }
static inline void tsc_socket_close(TscSocket *s) { (void)s; }

static inline TscHttpServer tsc_http_server_create(int32_t port) {
    return (TscHttpServer){ .port = port };
}
static inline void tsc_http_server_get(TscHttpServer *s, String path, TscRouteHandler h) {
    (void)s; (void)path; (void)h;
}
static inline void tsc_http_server_post(TscHttpServer *s, String path, TscRouteHandler h) {
    (void)s; (void)path; (void)h;
}
static inline void tsc_http_server_listen(TscHttpServer *s) { (void)s; }
static inline void tsc_response_text(TscResponse *res, String body) { (void)res; (void)body; }
static inline void tsc_response_json(TscResponse *res, String body) { (void)res; (void)body; }
static inline String tsc_request_param(TscRequest *req, String key) {
    (void)req; (void)key; return STR_LIT("");
}
static inline void tsc_net_listen(int32_t port, void (*handler)(TscSocket *)) {
    (void)port; (void)handler;
}
