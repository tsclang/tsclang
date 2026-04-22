/* std/io.h — TSClang I/O (POSIX fd-based) */
#pragma once
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#  include <io.h>
#  define tsc_read(fd, buf, n)  _read((fd), (buf), (unsigned)(n))
#  define tsc_write(fd, buf, n) _write((fd), (buf), (unsigned)(n))
#else
#  include <unistd.h>
#  define tsc_read(fd, buf, n)  read((fd), (buf), (n))
#  define tsc_write(fd, buf, n) write((fd), (buf), (n))
#endif

typedef struct { int32_t _fd; } TscReader;
typedef struct { int32_t _fd; } TscWriter;

typedef struct { bool _done; }                             TscPipeAwaitable;
typedef struct { bool _done; Array_u8 _result; }           TscReadAllAwaitable;
typedef struct { bool _done; }                             TscWriteAllAwaitable;
typedef struct { bool _done; String _result; bool _eof; }  TscReadLineAwaitable;
typedef struct { bool _done; }                             TscWriteStrAwaitable;

static inline TscReader  tsc_stdin(void)  { return (TscReader){0}; }
static inline TscWriter  tsc_stdout(void) { return (TscWriter){1}; }
static inline TscWriter  tsc_stderr(void) { return (TscWriter){2}; }

/* -------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */
static inline Array_u8 _tsc_read_all(int32_t fd) {
    size_t cap = 4096, len = 0;
    uint8_t *buf = (uint8_t *)malloc(cap);
    if (!buf) return (Array_u8){0};
    for (;;) {
        if (len == cap) {
            cap *= 2;
            uint8_t *nb = (uint8_t *)realloc(buf, cap);
            if (!nb) { free(buf); return (Array_u8){0}; }
            buf = nb;
        }
        ssize_t n = tsc_read(fd, buf + len, cap - len);
        if (n <= 0) break;
        len += (size_t)n;
    }
    return (Array_u8){ .data = buf, .length = len, .capacity = cap };
}

static inline String _tsc_read_line(int32_t fd, bool *eof_out) {
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
        ssize_t n = tsc_read(fd, &c, 1);
        if (n <= 0) { got_eof = true; break; }
        if (c == '\n') break;
        buf[len++] = c;
    }
    buf[len] = '\0';
    *eof_out = got_eof && len == 0;
    return (String){ .data = buf, .length = len, .capacity = cap };
}

/* -------------------------------------------------------------------------
 * Async variants (sync-over-async)
 * ------------------------------------------------------------------------- */
static inline TscPipeAwaitable tsc_pipe_async(TscReader r, TscWriter w) {
    uint8_t tmp[4096];
    for (;;) {
        ssize_t n = tsc_read(r._fd, tmp, sizeof(tmp));
        if (n <= 0) break;
        tsc_write(w._fd, tmp, (size_t)n);
    }
    return (TscPipeAwaitable){ ._done = true };
}
static inline void tsc_pipe_poll(TscPipeAwaitable *a) { a->_done = true; }

static inline TscReadAllAwaitable tsc_read_all_async(TscReader r) {
    return (TscReadAllAwaitable){ ._done = true, ._result = _tsc_read_all(r._fd) };
}
static inline void tsc_read_all_poll(TscReadAllAwaitable *a) { a->_done = true; }

static inline TscWriteAllAwaitable tsc_write_all_async(TscWriter w, const uint8_t *buf, size_t len) {
    tsc_write(w._fd, buf, len);
    return (TscWriteAllAwaitable){ ._done = true };
}
static inline void tsc_write_all_poll(TscWriteAllAwaitable *a) { a->_done = true; }

static inline TscReadLineAwaitable tsc_read_line_async(TscReader r) {
    bool eof = false;
    String line = _tsc_read_line(r._fd, &eof);
    return (TscReadLineAwaitable){ ._done = true, ._result = line, ._eof = eof };
}
static inline void tsc_read_line_poll(TscReadLineAwaitable *a) { a->_done = true; }

static inline TscWriteStrAwaitable tsc_write_str_async(TscWriter w, String s) {
    tsc_write(w._fd, s.data, s.length);
    return (TscWriteStrAwaitable){ ._done = true };
}
static inline void tsc_write_str_poll(TscWriteStrAwaitable *a) { a->_done = true; }
