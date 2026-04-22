/* std/net.h — TSClang networking (BSD sockets, sync-over-async) */
#pragma once
#define TSC_STD_NET_H
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#  include <winsock2.h>
#  include <ws2tcpip.h>
#  pragma comment(lib, "Ws2_32.lib")
typedef SOCKET tsc_sock_t;
#  define TSC_INVALID_SOCK INVALID_SOCKET
#  define tsc_close_sock(s) closesocket(s)
#  define tsc_sock_send(s, b, n)  send((s), (const char*)(b), (int)(n), 0)
#  define tsc_sock_recv(s, b, n)  recv((s), (char*)(b), (int)(n), 0)
static inline void _tsc_net_init(void) {
    static bool _done = false;
    if (_done) return;
    WSADATA wd; WSAStartup(MAKEWORD(2,2), &wd); _done = true;
}
#else
#  include <sys/types.h>
#  include <sys/socket.h>
#  include <netdb.h>
#  include <netinet/in.h>
#  include <arpa/inet.h>
#  include <unistd.h>
#  include <fcntl.h>
typedef int tsc_sock_t;
#  define TSC_INVALID_SOCK (-1)
#  define tsc_close_sock(s) close(s)
#  define tsc_sock_send(s, b, n) send((s), (b), (n), 0)
#  define tsc_sock_recv(s, b, n) recv((s), (b), (n), 0)
static inline void _tsc_net_init(void) {}
#endif

/* -------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */
static inline tsc_sock_t _tsc_tcp_connect(const char *host, int port) {
    _tsc_net_init();
    char port_str[16];
    snprintf(port_str, sizeof(port_str), "%d", port);
    struct addrinfo hints = {0}, *res;
    hints.ai_family   = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    if (getaddrinfo(host, port_str, &hints, &res) != 0) return TSC_INVALID_SOCK;
    tsc_sock_t fd = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
    if (fd == TSC_INVALID_SOCK) { freeaddrinfo(res); return TSC_INVALID_SOCK; }
    if (connect(fd, res->ai_addr, (int)res->ai_addrlen) != 0) {
        tsc_close_sock(fd); freeaddrinfo(res); return TSC_INVALID_SOCK;
    }
    freeaddrinfo(res);
    return fd;
}

static inline String _tsc_sock_readline(tsc_sock_t fd, bool *eof_out) {
    size_t cap = 256, len = 0;
    char *buf = (char *)malloc(cap);
    if (!buf) { *eof_out = true; return (String){0}; }
    bool got_eof = false;
    for (;;) {
        if (len == cap) {
            cap *= 2;
            char *nb = (char *)realloc(buf, cap);
            if (!nb) { free(buf); *eof_out = true; return (String){0}; }
            buf = nb;
        }
        char c;
        int n = (int)tsc_sock_recv(fd, &c, 1);
        if (n <= 0) { got_eof = true; break; }
        if (c == '\n') break;
        if (c != '\r') buf[len++] = c;
    }
    buf[len] = '\0';
    *eof_out = got_eof && len == 0;
    return (String){ .data = buf, .length = len, .capacity = cap };
}

static inline String _tsc_sock_readall(tsc_sock_t fd) {
    size_t cap = 4096, len = 0;
    char *buf = (char *)malloc(cap);
    if (!buf) return (String){0};
    for (;;) {
        if (len == cap) {
            cap *= 2;
            char *nb = (char *)realloc(buf, cap);
            if (!nb) { free(buf); return (String){0}; }
            buf = nb;
        }
        int n = (int)tsc_sock_recv(fd, buf + len, (int)(cap - len));
        if (n <= 0) break;
        len += (size_t)n;
    }
    buf[len] = '\0';
    return (String){ .data = buf, .length = len, .capacity = cap };
}

/* -------------------------------------------------------------------------
 * TCP socket
 * ------------------------------------------------------------------------- */
static inline TscConnectAwaitable tsc_net_connect_async(String host, int32_t port) {
    char *h = (char *)malloc(host.length + 1);
    memcpy(h, host.data, host.length); h[host.length] = '\0';
    tsc_sock_t fd = _tsc_tcp_connect(h, (int)port);
    free(h);
    TscSocket s = { ._fd = (int32_t)fd };
    return (TscConnectAwaitable){ ._done = true, ._result = s };
}
static inline void tsc_net_connect_poll(TscConnectAwaitable *a) { a->_done = true; }

static inline void tsc_socket_close(TscSocket *s) {
    if (s->_fd >= 0) { tsc_close_sock((tsc_sock_t)s->_fd); s->_fd = -1; }
}

static inline TscSocketWriteAwaitable tsc_socket_write_async(TscSocket *s, String data) {
    tsc_sock_send((tsc_sock_t)s->_fd, data.data, data.length);
    return (TscSocketWriteAwaitable){ ._done = true };
}
static inline void tsc_socket_write_poll(TscSocketWriteAwaitable *a) { a->_done = true; }

static inline TscSocketReadLineAwaitable tsc_socket_readline_async(TscSocket *s) {
    bool eof = false;
    String line = _tsc_sock_readline((tsc_sock_t)s->_fd, &eof);
    return (TscSocketReadLineAwaitable){ ._done = true, ._result = line, ._eof = eof };
}
static inline void tsc_socket_readline_poll(TscSocketReadLineAwaitable *a) { a->_done = true; }

static inline TscSocketReadAllAwaitable tsc_socket_readall_async(TscSocket *s) {
    return (TscSocketReadAllAwaitable){ ._done = true, ._result = _tsc_sock_readall((tsc_sock_t)s->_fd) };
}
static inline void tsc_socket_readall_poll(TscSocketReadAllAwaitable *a) { a->_done = true; }

/* -------------------------------------------------------------------------
 * HTTP server (minimal stub — real implementation requires event loop)
 * ------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------
 * Fetch (HTTP GET stub using raw TCP — minimal, no TLS)
 * ------------------------------------------------------------------------- */
static inline TscFetchAwaitable tsc_fetch_async(String url, TscFetchOptions *opts) {
    (void)url; (void)opts;
    return (TscFetchAwaitable){
        ._done = true,
        ._result = { .ok = false, .value = { .ok = false, .status = 0, .body = STR_LIT("") } }
    };
}
static inline void tsc_fetch_poll(TscFetchAwaitable *a) { a->_done = true; }

/* -------------------------------------------------------------------------
 * UDP socket
 * ------------------------------------------------------------------------- */
static inline TscUdpSocket tsc_udp_create(void) {
    _tsc_net_init();
    tsc_sock_t fd = socket(AF_INET, SOCK_DGRAM, 0);
    return (TscUdpSocket){ ._fd = (int32_t)fd };
}

static inline TscUdpBindAwaitable tsc_udp_bind_async(TscUdpSocket *udp, int32_t port) {
    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons((uint16_t)port);
    bind((tsc_sock_t)udp->_fd, (struct sockaddr *)&addr, sizeof(addr));
    return (TscUdpBindAwaitable){ ._done = true };
}
static inline void tsc_udp_bind_poll(TscUdpBindAwaitable *a) { a->_done = true; }

static inline TscUdpSendAwaitable tsc_udp_send_async(TscUdpSocket *udp, String addr, int32_t port,
                                                      const uint8_t *data, size_t len) {
    char *host = (char *)malloc(addr.length + 1);
    memcpy(host, addr.data, addr.length); host[addr.length] = '\0';
    struct sockaddr_in dst = {0};
    dst.sin_family = AF_INET;
    dst.sin_port   = htons((uint16_t)port);
    dst.sin_addr.s_addr = inet_addr(host);
    free(host);
    sendto((tsc_sock_t)udp->_fd, (const char *)data, (int)len, 0,
           (struct sockaddr *)&dst, sizeof(dst));
    return (TscUdpSendAwaitable){ ._done = true };
}
static inline void tsc_udp_send_poll(TscUdpSendAwaitable *a) { a->_done = true; }

static inline TscUdpReceiveAwaitable tsc_udp_receive_async(TscUdpSocket *udp) {
    uint8_t *buf = (uint8_t *)malloc(65536);
    struct sockaddr_in src = {0};
    socklen_t srclen = sizeof(src);
    int n = (int)recvfrom((tsc_sock_t)udp->_fd, (char *)buf, 65536, 0,
                          (struct sockaddr *)&src, &srclen);
    if (n < 0) { free(buf); return (TscUdpReceiveAwaitable){ ._done = true }; }
    char ip[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &src.sin_addr, ip, sizeof(ip));
    size_t iplen = strlen(ip);
    char *ipbuf = (char *)malloc(iplen + 1);
    memcpy(ipbuf, ip, iplen + 1);
    TscUdpPacket pkt = {
        .data = buf, .length = (size_t)n,
        .addr = { .data = ipbuf, .length = iplen, .capacity = iplen + 1 },
        .port = (int32_t)ntohs(src.sin_port),
    };
    return (TscUdpReceiveAwaitable){ ._done = true, ._result = pkt };
}
static inline void tsc_udp_receive_poll(TscUdpReceiveAwaitable *a) { a->_done = true; }
