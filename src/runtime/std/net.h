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
typedef struct { bool _done; TscSocket _result; }         TscConnectAwaitable;
typedef struct { bool _done; }                            TscSocketWriteAwaitable;
typedef struct { bool _done; String _result; bool _eof; } TscSocketReadLineAwaitable;
typedef struct { bool _done; String _result; }            TscSocketReadAllAwaitable;
typedef struct { bool _done; TscSocket _result; }         TscServerAcceptAwaitable;

typedef struct { int32_t _fd; } TscUdpSocket;
typedef struct { bool _done; }  TscUdpSendAwaitable;
typedef struct { bool _done; }  TscUdpBindAwaitable;
typedef struct {
    uint8_t *data; size_t length;
    String addr; int32_t port;
} TscUdpPacket;
typedef struct { bool _done; TscUdpPacket _result; } TscUdpReceiveAwaitable;

typedef struct { int32_t _fd; } TscTcpServer;
typedef struct { bool _done; }  TscServerListenAwaitable;

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

static inline TscSocketWriteAwaitable tsc_socket_write_async(TscSocket *s, String data) {
    (void)s; (void)data; return (TscSocketWriteAwaitable){0};
}
static inline void tsc_socket_write_poll(TscSocketWriteAwaitable *a) { a->_done = true; }

static inline TscSocketReadLineAwaitable tsc_socket_readline_async(TscSocket *s) {
    (void)s; return (TscSocketReadLineAwaitable){0};
}
static inline void tsc_socket_readline_poll(TscSocketReadLineAwaitable *a) { a->_done = true; }

static inline TscSocketReadAllAwaitable tsc_socket_readall_async(TscSocket *s) {
    (void)s; return (TscSocketReadAllAwaitable){0};
}
static inline void tsc_socket_readall_poll(TscSocketReadAllAwaitable *a) { a->_done = true; }

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

static inline TscUdpSocket tsc_udp_create(void) { return (TscUdpSocket){-1}; }

static inline TscUdpBindAwaitable tsc_udp_bind_async(TscUdpSocket *udp, int32_t port) {
    (void)udp; (void)port; return (TscUdpBindAwaitable){0};
}
static inline void tsc_udp_bind_poll(TscUdpBindAwaitable *a) { a->_done = true; }

static inline TscUdpSendAwaitable tsc_udp_send_async(TscUdpSocket *udp, String addr, int32_t port,
                                                      const uint8_t *data, size_t len) {
    (void)udp; (void)addr; (void)port; (void)data; (void)len;
    return (TscUdpSendAwaitable){0};
}
static inline void tsc_udp_send_poll(TscUdpSendAwaitable *a) { a->_done = true; }

static inline TscUdpReceiveAwaitable tsc_udp_receive_async(TscUdpSocket *udp) {
    (void)udp; return (TscUdpReceiveAwaitable){0};
}
static inline void tsc_udp_receive_poll(TscUdpReceiveAwaitable *a) { a->_done = true; }
