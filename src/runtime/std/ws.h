/* std/ws.h — TSClang WebSocket client + server (RFC 6455, sync-over-async) */
#pragma once
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#  include <winsock2.h>
#  include <ws2tcpip.h>
#  pragma comment(lib, "Ws2_32.lib")
typedef SOCKET tsc_ws_sock_t;
#  define TSC_WS_INVAL INVALID_SOCKET
#  define tsc_ws_close_fd(s) closesocket(s)
#  define tsc_ws_send_fd(s, b, n) send((s), (const char*)(b), (int)(n), 0)
#  define tsc_ws_recv_fd(s, b, n) recv((s), (char*)(b), (int)(n), 0)
static inline void _tsc_ws_net_init(void) {
    static bool _d = false;
    if (_d) return; WSADATA wd; WSAStartup(MAKEWORD(2,2), &wd); _d = true;
}
#else
#  include <sys/types.h>
#  include <sys/socket.h>
#  include <netdb.h>
#  include <arpa/inet.h>
#  include <unistd.h>
typedef int tsc_ws_sock_t;
#  define TSC_WS_INVAL (-1)
#  define tsc_ws_close_fd(s) close(s)
#  define tsc_ws_send_fd(s, b, n) send((s), (b), (n), 0)
#  define tsc_ws_recv_fd(s, b, n) recv((s), (b), (n), 0)
static inline void _tsc_ws_net_init(void) {}
#endif

typedef void (*TscMessageCallback)(String msg);
typedef void (*TscWsConnectCallback)(struct _TscWebSocket *ws);
typedef void (*TscWsCloseCallback)(void);

typedef struct _TscWebSocket { int32_t _fd; } TscWebSocket;
typedef struct { bool _done; TscWebSocket _result; } TscWsConnectAwaitable;
typedef struct { bool _done; }                        TscWsSendAwaitable;
typedef struct { int32_t _fd; }                       TscWebSocketServer;

/* -------------------------------------------------------------------------
 * Base64 (for Sec-WebSocket-Key header and Accept computation)
 * ------------------------------------------------------------------------- */
static const char _tsc_b64[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static inline void _tsc_b64_encode(const uint8_t *in, size_t len, char *out) {
    size_t i = 0, j = 0;
    for (; i + 2 < len; i += 3) {
        out[j++] = _tsc_b64[in[i] >> 2];
        out[j++] = _tsc_b64[((in[i] & 3) << 4) | (in[i+1] >> 4)];
        out[j++] = _tsc_b64[((in[i+1] & 0xf) << 2) | (in[i+2] >> 6)];
        out[j++] = _tsc_b64[in[i+2] & 0x3f];
    }
    if (i < len) {
        out[j++] = _tsc_b64[in[i] >> 2];
        if (i + 1 < len) {
            out[j++] = _tsc_b64[((in[i] & 3) << 4) | (in[i+1] >> 4)];
            out[j++] = _tsc_b64[(in[i+1] & 0xf) << 2];
        } else {
            out[j++] = _tsc_b64[(in[i] & 3) << 4];
            out[j++] = '=';
        }
        out[j++] = '=';
    }
    out[j] = '\0';
}

/* -------------------------------------------------------------------------
 * SHA-1 (needed for Sec-WebSocket-Accept — RFC 6455 §4.2.2)
 * -------------------------------------------------------------------------
 * Minimal self-contained implementation.
 * ------------------------------------------------------------------------- */
typedef struct { uint32_t h[5]; uint64_t len; uint8_t buf[64]; uint32_t blen; } _TscSha1;

static inline void _tsc_sha1_init(_TscSha1 *s) {
    s->h[0]=0x67452301; s->h[1]=0xEFCDAB89; s->h[2]=0x98BADCFE;
    s->h[3]=0x10325476; s->h[4]=0xC3D2E1F0;
    s->len = 0; s->blen = 0;
}
#define _TSC_ROL32(x,n) (((x)<<(n))|((x)>>(32-(n))))
static inline void _tsc_sha1_block(_TscSha1 *s) {
    uint32_t w[80], a,b,c,d,e,f,k,t;
    for (int i=0;i<16;i++) {
        int bi=i*4;
        w[i]=(uint32_t)s->buf[bi]<<24|(uint32_t)s->buf[bi+1]<<16|
             (uint32_t)s->buf[bi+2]<<8|(uint32_t)s->buf[bi+3];
    }
    for (int i=16;i<80;i++) w[i]=_TSC_ROL32(w[i-3]^w[i-8]^w[i-14]^w[i-16],1);
    a=s->h[0];b=s->h[1];c=s->h[2];d=s->h[3];e=s->h[4];
    for (int i=0;i<80;i++) {
        if      (i<20){f=(b&c)|(~b&d);k=0x5A827999;}
        else if (i<40){f=b^c^d;        k=0x6ED9EBA1;}
        else if (i<60){f=(b&c)|(b&d)|(c&d);k=0x8F1BBCDC;}
        else          {f=b^c^d;        k=0xCA62C1D6;}
        t=_TSC_ROL32(a,5)+f+e+k+w[i];
        e=d;d=c;c=_TSC_ROL32(b,30);b=a;a=t;
    }
    s->h[0]+=a;s->h[1]+=b;s->h[2]+=c;s->h[3]+=d;s->h[4]+=e;
}
static inline void _tsc_sha1_update(_TscSha1 *s, const uint8_t *data, size_t len) {
    for (size_t i=0;i<len;i++) {
        s->buf[s->blen++]=data[i];
        s->len++;
        if (s->blen==64) { _tsc_sha1_block(s); s->blen=0; }
    }
}
static inline void _tsc_sha1_final(_TscSha1 *s, uint8_t *out) {
    uint64_t bits=s->len*8;
    s->buf[s->blen++]=0x80;
    if (s->blen>56) { while(s->blen<64)s->buf[s->blen++]=0; _tsc_sha1_block(s); s->blen=0; }
    while(s->blen<56)s->buf[s->blen++]=0;
    for(int i=7;i>=0;i--){s->buf[56+(7-i)]=(uint8_t)(bits>>(i*8));}
    _tsc_sha1_block(s);
    for(int i=0;i<5;i++){out[i*4]=(uint8_t)(s->h[i]>>24);out[i*4+1]=(uint8_t)(s->h[i]>>16);
                          out[i*4+2]=(uint8_t)(s->h[i]>>8);out[i*4+3]=(uint8_t)(s->h[i]);}
}

/* -------------------------------------------------------------------------
 * Recv exact N bytes from socket
 * ------------------------------------------------------------------------- */
static inline bool _tsc_ws_recv_exact(tsc_ws_sock_t fd, uint8_t *buf, size_t n) {
    size_t got = 0;
    while (got < n) {
        int r = (int)tsc_ws_recv_fd(fd, buf + got, (int)(n - got));
        if (r <= 0) return false;
        got += (size_t)r;
    }
    return true;
}

/* -------------------------------------------------------------------------
 * Send a WebSocket text frame (client masking ON as required by RFC 6455)
 * ------------------------------------------------------------------------- */
static inline void _tsc_ws_send_frame(tsc_ws_sock_t fd, const uint8_t *payload, size_t plen,
                                      uint8_t opcode, bool mask) {
    uint8_t hdr[14]; size_t hi = 0;
    hdr[hi++] = 0x80 | (opcode & 0x0f); /* FIN + opcode */
    uint8_t mask_bit = mask ? 0x80 : 0;
    if (plen < 126) {
        hdr[hi++] = mask_bit | (uint8_t)plen;
    } else if (plen < 65536) {
        hdr[hi++] = mask_bit | 126;
        hdr[hi++] = (uint8_t)(plen >> 8);
        hdr[hi++] = (uint8_t)(plen);
    } else {
        hdr[hi++] = mask_bit | 127;
        for (int i = 7; i >= 0; i--) hdr[hi++] = (uint8_t)(plen >> (i*8));
    }
    uint8_t mkey[4] = {0};
    if (mask) {
        /* pseudo-random mask key */
        uint32_t r = (uint32_t)(uintptr_t)payload ^ (uint32_t)plen ^ 0xDEADBEEF;
        for (int i=0;i<4;i++) { r = r*1664525+1013904223; mkey[i]=(uint8_t)(r>>24); }
        memcpy(hdr + hi, mkey, 4); hi += 4;
    }
    tsc_ws_send_fd(fd, hdr, hi);
    if (!mask) {
        tsc_ws_send_fd(fd, payload, plen);
    } else {
        uint8_t *masked = (uint8_t *)malloc(plen);
        for (size_t i = 0; i < plen; i++) masked[i] = payload[i] ^ mkey[i & 3];
        tsc_ws_send_fd(fd, masked, plen);
        free(masked);
    }
}

/* Receive a WebSocket frame; returns payload (malloc'd) or NULL on error. */
static inline uint8_t *_tsc_ws_recv_frame(tsc_ws_sock_t fd, size_t *out_len, uint8_t *out_op) {
    uint8_t h2[2];
    if (!_tsc_ws_recv_exact(fd, h2, 2)) return NULL;
    *out_op = h2[0] & 0x0f;
    bool masked = (h2[1] & 0x80) != 0;
    size_t plen = h2[1] & 0x7f;
    if (plen == 126) {
        uint8_t ex[2]; if (!_tsc_ws_recv_exact(fd, ex, 2)) return NULL;
        plen = ((size_t)ex[0] << 8) | ex[1];
    } else if (plen == 127) {
        uint8_t ex[8]; if (!_tsc_ws_recv_exact(fd, ex, 8)) return NULL;
        plen = 0; for (int i=0;i<8;i++) plen = (plen<<8)|ex[i];
    }
    uint8_t mkey[4] = {0};
    if (masked) { if (!_tsc_ws_recv_exact(fd, mkey, 4)) return NULL; }
    uint8_t *payload = (uint8_t *)malloc(plen + 1);
    if (!payload) return NULL;
    if (!_tsc_ws_recv_exact(fd, payload, plen)) { free(payload); return NULL; }
    if (masked) { for (size_t i=0;i<plen;i++) payload[i] ^= mkey[i&3]; }
    payload[plen] = '\0';
    *out_len = plen;
    return payload;
}

/* -------------------------------------------------------------------------
 * WebSocket handshake — client side
 * ------------------------------------------------------------------------- */
static inline tsc_ws_sock_t _tsc_ws_handshake_client(const char *url) {
    /* Parse ws://host:port/path */
    const char *rest = url;
    bool is_ws = strncmp(rest, "ws://", 5) == 0;
    if (!is_ws && strncmp(rest, "wss://", 6) != 0) return TSC_WS_INVAL;
    rest += is_ws ? 5 : 6;

    char host[256]; int port = 80; const char *path = "/";
    const char *colon = strchr(rest, ':');
    const char *slash = strchr(rest, '/');

    if (colon && (!slash || colon < slash)) {
        size_t hl = (size_t)(colon - rest);
        if (hl >= sizeof(host)) return TSC_WS_INVAL;
        memcpy(host, rest, hl); host[hl] = '\0';
        port = atoi(colon + 1);
        if (slash) path = slash;
    } else if (slash) {
        size_t hl = (size_t)(slash - rest);
        if (hl >= sizeof(host)) return TSC_WS_INVAL;
        memcpy(host, rest, hl); host[hl] = '\0';
        path = slash;
    } else {
        size_t hl = strlen(rest);
        if (hl >= sizeof(host)) return TSC_WS_INVAL;
        memcpy(host, rest, hl); host[hl] = '\0';
    }

    _tsc_ws_net_init();
    char port_str[16]; snprintf(port_str, sizeof(port_str), "%d", port);
    struct addrinfo hints = {0}, *ai;
    hints.ai_family = AF_INET; hints.ai_socktype = SOCK_STREAM;
    if (getaddrinfo(host, port_str, &hints, &ai) != 0) return TSC_WS_INVAL;
    tsc_ws_sock_t fd = socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
    if (fd == TSC_WS_INVAL) { freeaddrinfo(ai); return TSC_WS_INVAL; }
    if (connect(fd, ai->ai_addr, (int)ai->ai_addrlen) != 0) {
        tsc_ws_close_fd(fd); freeaddrinfo(ai); return TSC_WS_INVAL;
    }
    freeaddrinfo(ai);

    /* Generate a random 16-byte key */
    uint8_t raw_key[16];
    for (int i = 0; i < 16; i++) raw_key[i] = (uint8_t)(rand() >> 8);
    char key_b64[25]; _tsc_b64_encode(raw_key, 16, key_b64);

    char req[1024];
    int reqlen = snprintf(req, sizeof(req),
        "GET %s HTTP/1.1\r\n"
        "Host: %s:%d\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Key: %s\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n",
        path, host, port, key_b64);
    tsc_ws_send_fd(fd, (uint8_t *)req, (size_t)reqlen);

    /* Read response (until \r\n\r\n) */
    char resp[2048]; size_t rlen = 0;
    while (rlen < sizeof(resp) - 1) {
        int n = (int)tsc_ws_recv_fd(fd, (uint8_t *)resp + rlen, 1);
        if (n <= 0) break;
        rlen++;
        if (rlen >= 4 && memcmp(resp + rlen - 4, "\r\n\r\n", 4) == 0) break;
    }
    resp[rlen] = '\0';
    if (strstr(resp, "101") == NULL) { tsc_ws_close_fd(fd); return TSC_WS_INVAL; }
    return fd;
}

/* -------------------------------------------------------------------------
 * WebSocket server handshake
 * ------------------------------------------------------------------------- */
static inline bool _tsc_ws_server_handshake(tsc_ws_sock_t client_fd) {
    char req[4096]; size_t rlen = 0;
    while (rlen < sizeof(req) - 1) {
        int n = (int)tsc_ws_recv_fd(client_fd, (uint8_t *)req + rlen, 1);
        if (n <= 0) break;
        rlen++;
        if (rlen >= 4 && memcmp(req + rlen - 4, "\r\n\r\n", 4) == 0) break;
    }
    req[rlen] = '\0';

    /* Extract Sec-WebSocket-Key */
    const char *key_hdr = strstr(req, "Sec-WebSocket-Key: ");
    if (!key_hdr) return false;
    key_hdr += 19;
    const char *key_end = strstr(key_hdr, "\r\n");
    if (!key_end) return false;
    size_t klen = (size_t)(key_end - key_hdr);
    char key[64]; if (klen >= sizeof(key)) return false;
    memcpy(key, key_hdr, klen); key[klen] = '\0';

    /* Compute Accept = base64(SHA1(key + GUID)) */
    static const char guid[] = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    char combined[128];
    int clen = snprintf(combined, sizeof(combined), "%s%s", key, guid);
    _TscSha1 sha; _tsc_sha1_init(&sha);
    _tsc_sha1_update(&sha, (uint8_t *)combined, (size_t)clen);
    uint8_t digest[20]; _tsc_sha1_final(&sha, digest);
    char accept_b64[29]; _tsc_b64_encode(digest, 20, accept_b64);

    char resp[256];
    int rlen2 = snprintf(resp, sizeof(resp),
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Accept: %s\r\n\r\n",
        accept_b64);
    tsc_ws_send_fd(client_fd, (uint8_t *)resp, (size_t)rlen2);
    return true;
}

/* -------------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------------- */
static inline TscWebSocket tsc_ws_connect(String url) {
    char *u = (char *)malloc(url.length + 1);
    memcpy(u, url.data, url.length); u[url.length] = '\0';
    tsc_ws_sock_t fd = _tsc_ws_handshake_client(u);
    free(u);
    return (TscWebSocket){ ._fd = (int32_t)fd };
}

static inline TscWsConnectAwaitable tsc_ws_connect_async(String url) {
    return (TscWsConnectAwaitable){ ._done = true, ._result = tsc_ws_connect(url) };
}
static inline void tsc_ws_connect_poll(TscWsConnectAwaitable *a) { a->_done = true; }

static inline void tsc_ws_close(TscWebSocket *ws) {
    if (ws->_fd >= 0) {
        uint8_t close_frame[] = {0x88, 0x00}; /* FIN + close opcode, no payload */
        tsc_ws_send_fd((tsc_ws_sock_t)ws->_fd, close_frame, 2);
        tsc_ws_close_fd((tsc_ws_sock_t)ws->_fd);
        ws->_fd = -1;
    }
}

static inline void tsc_ws_send(TscWebSocket *ws, String msg) {
    if (ws->_fd < 0) return;
    _tsc_ws_send_frame((tsc_ws_sock_t)ws->_fd, (const uint8_t *)msg.data, msg.length, 0x01, true);
}

static inline TscWsSendAwaitable tsc_ws_send_async(TscWebSocket *ws, String msg) {
    tsc_ws_send(ws, msg);
    return (TscWsSendAwaitable){ ._done = true };
}
static inline void tsc_ws_send_poll(TscWsSendAwaitable *a) { a->_done = true; }

static inline void tsc_ws_send_bytes(TscWebSocket *ws, const uint8_t *data, size_t len) {
    if (ws->_fd < 0) return;
    _tsc_ws_send_frame((tsc_ws_sock_t)ws->_fd, data, len, 0x02, true); /* binary opcode */
}

static inline void tsc_ws_on_message(TscWebSocket *ws, TscMessageCallback cb) {
    if (ws->_fd < 0 || !cb) return;
    for (;;) {
        size_t plen; uint8_t op;
        uint8_t *payload = _tsc_ws_recv_frame((tsc_ws_sock_t)ws->_fd, &plen, &op);
        if (!payload) break;
        if (op == 0x08) { free(payload); break; } /* close */
        if (op == 0x01 || op == 0x02) {
            String s = { .data = (char *)payload, .length = plen, .capacity = plen + 1 };
            cb(s);
        }
        free(payload);
    }
}

static inline void tsc_ws_on_close(TscWebSocket *ws, TscWsCloseCallback cb) {
    /* Register callback — in sync-over-async model we call it after the connection drops.
       This is a simplified model; a real async runtime would call it on close event. */
    (void)ws; (void)cb;
}

/* -------------------------------------------------------------------------
 * WebSocket server
 * ------------------------------------------------------------------------- */
static inline TscWebSocketServer tsc_ws_server_create(void) {
    _tsc_ws_net_init();
    tsc_ws_sock_t fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd == TSC_WS_INVAL) return (TscWebSocketServer){ ._fd = -1 };
    int one = 1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, (const char *)&one, sizeof(one));
    return (TscWebSocketServer){ ._fd = (int32_t)fd };
}

static inline void tsc_ws_server_on_connect(TscWebSocketServer *srv, TscWsConnectCallback cb) {
    (void)srv; (void)cb;
}

static inline void tsc_ws_server_listen(TscWebSocketServer *srv, int32_t port) {
    if (srv->_fd < 0) return;
    tsc_ws_sock_t fd = (tsc_ws_sock_t)srv->_fd;
    struct sockaddr_in addr = {0};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons((uint16_t)port);
    if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) return;
    listen(fd, 16);
    /* Synchronous accept loop — blocks until server is stopped externally */
    for (;;) {
        struct sockaddr_in cli = {0}; socklen_t clen = sizeof(cli);
        tsc_ws_sock_t cfd = accept(fd, (struct sockaddr *)&cli, &clen);
        if (cfd == TSC_WS_INVAL) break;
        if (_tsc_ws_server_handshake(cfd)) {
            TscWebSocket ws = { ._fd = (int32_t)cfd };
            (void)ws;
        } else {
            tsc_ws_close_fd(cfd);
        }
    }
}
