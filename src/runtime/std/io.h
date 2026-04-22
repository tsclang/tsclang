/* std/io.h — TSClang I/O stubs (compile-only for [F] tests) */
#pragma once
#include <stdint.h>
#include <stdbool.h>

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

static inline TscPipeAwaitable tsc_pipe_async(TscReader r, TscWriter w) {
    (void)r; (void)w; return (TscPipeAwaitable){0};
}
static inline void tsc_pipe_poll(TscPipeAwaitable *a) { a->_done = true; }

static inline TscReadAllAwaitable tsc_read_all_async(TscReader r) {
    (void)r; return (TscReadAllAwaitable){0};
}
static inline void tsc_read_all_poll(TscReadAllAwaitable *a) { a->_done = true; }

static inline TscWriteAllAwaitable tsc_write_all_async(TscWriter w, const uint8_t *buf, size_t len) {
    (void)w; (void)buf; (void)len; return (TscWriteAllAwaitable){0};
}
static inline void tsc_write_all_poll(TscWriteAllAwaitable *a) { a->_done = true; }

static inline TscReadLineAwaitable tsc_read_line_async(TscReader r) {
    (void)r; return (TscReadLineAwaitable){0};
}
static inline void tsc_read_line_poll(TscReadLineAwaitable *a) { a->_done = true; }

static inline TscWriteStrAwaitable tsc_write_str_async(TscWriter w, String s) {
    (void)w; (void)s; return (TscWriteStrAwaitable){0};
}
static inline void tsc_write_str_poll(TscWriteStrAwaitable *a) { a->_done = true; }
