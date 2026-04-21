/* std/fs.h — TSClang filesystem stubs (compile-only for [F] tests) */
#pragma once
#include <stdint.h>
#include <stdbool.h>

typedef void (*TscWatchCallback)(String event);

static inline void tsc_fs_watch(String path, TscWatchCallback cb) {
    (void)path; (void)cb;
}
