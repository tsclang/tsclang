/* std/fs.h — TSClang filesystem stubs (compile-only for [F] tests) */
#pragma once
#include <stdint.h>
#include <stdbool.h>

typedef void (*TscWatchCallback)(String event);

typedef struct {
    String name;
    String path;
    bool   is_file;
    bool   is_dir;
} TscDirEntry;

typedef struct {
    int64_t size;
    bool    is_file;
    bool    is_dir;
} TscFileStat;

typedef struct { bool _done; String      _result; } TscFsReadAwaitable;
typedef struct { bool _done; Array_u8    _result; } TscFsReadBytesAwaitable;
typedef struct { bool _done; }                       TscFsVoidAwaitable;
typedef struct { bool _done; bool        _result; }  TscFsBoolAwaitable;
typedef struct { bool _done; TscFileStat _result; }  TscFsStatAwaitable;
typedef struct { TscDirEntry *data; size_t length; size_t capacity; } TscDirEntryArray;
typedef struct { bool _done; TscDirEntryArray _result; } TscFsReaddirAwaitable;

static inline TscFsReadAwaitable tsc_fs_read_async(String path) {
    (void)path; return (TscFsReadAwaitable){0};
}
static inline void tsc_fs_read_poll(TscFsReadAwaitable *a) { a->_done = true; }

static inline TscFsReadBytesAwaitable tsc_fs_read_bytes_async(String path) {
    (void)path; return (TscFsReadBytesAwaitable){0};
}
static inline void tsc_fs_read_bytes_poll(TscFsReadBytesAwaitable *a) { a->_done = true; }

static inline TscFsVoidAwaitable tsc_fs_write_async(String path, String data) {
    (void)path; (void)data; return (TscFsVoidAwaitable){0};
}
static inline void tsc_fs_write_poll(TscFsVoidAwaitable *a) { a->_done = true; }

static inline TscFsVoidAwaitable tsc_fs_append_async(String path, String data) {
    (void)path; (void)data; return (TscFsVoidAwaitable){0};
}
static inline void tsc_fs_append_poll(TscFsVoidAwaitable *a) { a->_done = true; }

static inline TscFsVoidAwaitable tsc_fs_remove_async(String path) {
    (void)path; return (TscFsVoidAwaitable){0};
}
static inline void tsc_fs_remove_poll(TscFsVoidAwaitable *a) { a->_done = true; }

static inline TscFsVoidAwaitable tsc_fs_rename_async(String from, String to) {
    (void)from; (void)to; return (TscFsVoidAwaitable){0};
}
static inline void tsc_fs_rename_poll(TscFsVoidAwaitable *a) { a->_done = true; }

static inline TscFsVoidAwaitable tsc_fs_mkdir_async(String path) {
    (void)path; return (TscFsVoidAwaitable){0};
}
static inline void tsc_fs_mkdir_poll(TscFsVoidAwaitable *a) { a->_done = true; }

static inline TscFsBoolAwaitable tsc_fs_exists_async(String path) {
    (void)path; return (TscFsBoolAwaitable){0};
}
static inline void tsc_fs_exists_poll(TscFsBoolAwaitable *a) { a->_done = true; }

static inline TscFsStatAwaitable tsc_fs_stat_async(String path) {
    (void)path; return (TscFsStatAwaitable){0};
}
static inline void tsc_fs_stat_poll(TscFsStatAwaitable *a) { a->_done = true; }

static inline TscFsReaddirAwaitable tsc_fs_readdir_async(String path) {
    (void)path; return (TscFsReaddirAwaitable){0};
}
static inline void tsc_fs_readdir_poll(TscFsReaddirAwaitable *a) { a->_done = true; }

static inline void tsc_fs_watch(String path, TscWatchCallback cb) {
    (void)path; (void)cb;
}

/* Sync variants — no state machine, direct POSIX call (desktop only) */
static inline String tsc_fs_read_sync(String path) {
    (void)path; return (String){0};
}
static inline Array_u8 tsc_fs_read_bytes_sync(String path) {
    (void)path; return (Array_u8){0};
}
static inline void tsc_fs_write_sync(String path, String data) {
    (void)path; (void)data;
}
static inline void tsc_fs_append_sync(String path, String data) {
    (void)path; (void)data;
}
static inline void tsc_fs_remove_sync(String path) {
    (void)path;
}
static inline void tsc_fs_rename_sync(String from, String to) {
    (void)from; (void)to;
}
static inline void tsc_fs_mkdir_sync(String path) {
    (void)path;
}
static inline bool tsc_fs_exists_sync(String path) {
    (void)path; return false;
}
static inline TscFileStat tsc_fs_stat_sync(String path) {
    (void)path; return (TscFileStat){0};
}
static inline TscDirEntryArray tsc_fs_readdir_sync(String path) {
    (void)path; return (TscDirEntryArray){0};
}
