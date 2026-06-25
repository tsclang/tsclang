/* std/fs.h — TSClang filesystem (POSIX + Win32, sync-over-async) */
#pragma once
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <errno.h>

#ifdef _WIN32
#  include <windows.h>
#  include <direct.h>
#  define tsc_stat_t   struct _stat64
#  define tsc_stat(p,s) _stat64((p),(s))
#  define tsc_mkdir(p)  _mkdir(p)
#else
#  include <dirent.h>
#  include <unistd.h>
#  define tsc_stat_t   struct stat
#  define tsc_stat(p,s) stat((p),(s))
#  define tsc_mkdir(p)  mkdir((p), 0755)
#endif

typedef void (*TscWatchCallback)(String event);

typedef struct {
    String name;
    String path;
    bool   isFile;
    bool   isDirectory;
} TscDirEntry;

typedef struct {
    int64_t size;
    bool    isFile;
    bool    isDirectory;
    int64_t mtime;
} TscFileStat;

typedef struct { bool _done; String      _result; } TscFsReadAwaitable;
typedef struct { bool _done; Array_u8    _result; } TscFsReadBytesAwaitable;
typedef struct { bool _done; }                       TscFsVoidAwaitable;
typedef struct { bool _done; bool        _result; }  TscFsBoolAwaitable;
typedef struct { bool _done; TscFileStat _result; }  TscFsStatAwaitable;
typedef struct { TscDirEntry *data; size_t length; size_t capacity; } TscDirEntryArray;
typedef struct { bool _done; TscDirEntryArray _result; } TscFsReaddirAwaitable;

/* -------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */
static inline String _tsc_fs_read_file(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) return (String){0};
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (sz < 0) { fclose(f); return (String){0}; }
    char *buf = (char *)malloc((size_t)sz + 1);
    if (!buf) { fclose(f); return (String){0}; }
    size_t rd = fread(buf, 1, (size_t)sz, f);
    fclose(f);
    buf[rd] = '\0';
    return (String){ .data = buf, .length = rd, .capacity = (size_t)sz + 1 };
}

static inline Array_u8 _tsc_fs_read_file_bytes(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) return (Array_u8){0};
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (sz < 0) { fclose(f); return (Array_u8){0}; }
    uint8_t *buf = (uint8_t *)malloc((size_t)sz);
    if (!buf) { fclose(f); return (Array_u8){0}; }
    size_t rd = fread(buf, 1, (size_t)sz, f);
    fclose(f);
    return (Array_u8){ .data = buf, .length = rd, .capacity = (size_t)sz };
}

static inline TscFileStat _tsc_fs_stat(const char *path) {
    tsc_stat_t st;
    if (tsc_stat(path, &st) != 0) return (TscFileStat){0};
    bool is_file = (st.st_mode & S_IFREG) != 0;
    bool is_dir  = (st.st_mode & S_IFDIR) != 0;
    return (TscFileStat){
        .size = (int64_t)st.st_size,
        .isFile = is_file,
        .isDirectory = is_dir,
        .mtime = (int64_t)st.st_mtime,
    };
}

static inline TscDirEntryArray _tsc_fs_readdir(const char *path) {
#ifdef _WIN32
    size_t plen = strlen(path);
    char *pat = (char *)malloc(plen + 3);
    if (!pat) return (TscDirEntryArray){0};
    memcpy(pat, path, plen);
    pat[plen] = '\\'; pat[plen+1] = '*'; pat[plen+2] = '\0';

    WIN32_FIND_DATAA fd;
    HANDLE h = FindFirstFileA(pat, &fd);
    free(pat);
    if (h == INVALID_HANDLE_VALUE) return (TscDirEntryArray){0};

    size_t cap = 16, len = 0;
    TscDirEntry *arr = (TscDirEntry *)malloc(cap * sizeof(TscDirEntry));
    if (!arr) { FindClose(h); return (TscDirEntryArray){0}; }

    do {
        if (strcmp(fd.cFileName, ".") == 0 || strcmp(fd.cFileName, "..") == 0) continue;
        if (len == cap) {
            cap *= 2;
            arr = (TscDirEntry *)realloc(arr, cap * sizeof(TscDirEntry));
            if (!arr) { FindClose(h); return (TscDirEntryArray){0}; }
        }
        size_t nlen = strlen(fd.cFileName);
        char *nbuf = (char *)malloc(nlen + 1);
        memcpy(nbuf, fd.cFileName, nlen + 1);

        size_t dlen = strlen(path);
        size_t pbuf_len = dlen + 1 + nlen + 1;
        char *pbuf = (char *)malloc(pbuf_len);
        snprintf(pbuf, pbuf_len, "%s\\%s", path, fd.cFileName);

        bool is_dir = (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
        arr[len++] = (TscDirEntry){
            .name = { .data = nbuf, .length = nlen, .capacity = nlen + 1 },
            .path = { .data = pbuf, .length = pbuf_len - 1, .capacity = pbuf_len },
            .isFile = !is_dir,
            .isDirectory = is_dir,
        };
    } while (FindNextFileA(h, &fd));
    FindClose(h);
    return (TscDirEntryArray){ .data = arr, .length = len, .capacity = cap };
#else
    DIR *d = opendir(path);
    if (!d) return (TscDirEntryArray){0};

    size_t cap = 16, len = 0;
    TscDirEntry *arr = (TscDirEntry *)malloc(cap * sizeof(TscDirEntry));
    if (!arr) { closedir(d); return (TscDirEntryArray){0}; }

    struct dirent *de;
    while ((de = readdir(d)) != NULL) {
        if (strcmp(de->d_name, ".") == 0 || strcmp(de->d_name, "..") == 0) continue;
        if (len == cap) {
            cap *= 2;
            arr = (TscDirEntry *)realloc(arr, cap * sizeof(TscDirEntry));
            if (!arr) { closedir(d); return (TscDirEntryArray){0}; }
        }
        size_t nlen = strlen(de->d_name);
        char *nbuf = (char *)malloc(nlen + 1);
        memcpy(nbuf, de->d_name, nlen + 1);

        size_t dlen = strlen(path);
        size_t pbuf_len = dlen + 1 + nlen + 1;
        char *pbuf = (char *)malloc(pbuf_len);
        snprintf(pbuf, pbuf_len, "%s/%s", path, de->d_name);

        tsc_stat_t st;
        bool is_dir = false, is_file = false;
        if (tsc_stat(pbuf, &st) == 0) {
            is_dir  = (st.st_mode & S_IFDIR) != 0;
            is_file = (st.st_mode & S_IFREG) != 0;
        }
        arr[len++] = (TscDirEntry){
            .name = { .data = nbuf, .length = nlen, .capacity = nlen + 1 },
            .path = { .data = pbuf, .length = pbuf_len - 1, .capacity = pbuf_len },
            .isFile = is_file,
            .isDirectory = is_dir,
        };
    }
    closedir(d);
    return (TscDirEntryArray){ .data = arr, .length = len, .capacity = cap };
#endif
}

/* -------------------------------------------------------------------------
 * Sync variants
 * ------------------------------------------------------------------------- */
static inline String tsc_fs_read_sync(String path) {
    char *p = (char *)malloc(path.length + 1);
    memcpy(p, path.data, path.length); p[path.length] = '\0';
    String r = _tsc_fs_read_file(p);
    free(p);
    return r;
}

static inline Array_u8 tsc_fs_read_bytes_sync(String path) {
    char *p = (char *)malloc(path.length + 1);
    memcpy(p, path.data, path.length); p[path.length] = '\0';
    Array_u8 r = _tsc_fs_read_file_bytes(p);
    free(p);
    return r;
}

static inline void tsc_fs_write_sync(String path, String data) {
    char *p = (char *)malloc(path.length + 1);
    memcpy(p, path.data, path.length); p[path.length] = '\0';
    FILE *f = fopen(p, "wb");
    free(p);
    if (!f) return;
    fwrite(data.data, 1, data.length, f);
    fclose(f);
}

static inline void tsc_fs_append_sync(String path, String data) {
    char *p = (char *)malloc(path.length + 1);
    memcpy(p, path.data, path.length); p[path.length] = '\0';
    FILE *f = fopen(p, "ab");
    free(p);
    if (!f) return;
    fwrite(data.data, 1, data.length, f);
    fclose(f);
}

static inline void tsc_fs_remove_sync(String path) {
    char *p = (char *)malloc(path.length + 1);
    memcpy(p, path.data, path.length); p[path.length] = '\0';
    remove(p);
    free(p);
}

static inline void tsc_fs_rename_sync(String from, String to) {
    char *pf = (char *)malloc(from.length + 1);
    char *pt = (char *)malloc(to.length + 1);
    memcpy(pf, from.data, from.length); pf[from.length] = '\0';
    memcpy(pt, to.data, to.length);     pt[to.length] = '\0';
    rename(pf, pt);
    free(pf); free(pt);
}

static inline void tsc_fs_mkdir_sync(String path) {
    char *p = (char *)malloc(path.length + 1);
    memcpy(p, path.data, path.length); p[path.length] = '\0';
    tsc_mkdir(p);
    free(p);
}

static inline bool tsc_fs_exists_sync(String path) {
    char *p = (char *)malloc(path.length + 1);
    memcpy(p, path.data, path.length); p[path.length] = '\0';
    tsc_stat_t st;
    bool exists = tsc_stat(p, &st) == 0;
    free(p);
    return exists;
}

static inline TscFileStat tsc_fs_stat_sync(String path) {
    char *p = (char *)malloc(path.length + 1);
    memcpy(p, path.data, path.length); p[path.length] = '\0';
    TscFileStat r = _tsc_fs_stat(p);
    free(p);
    return r;
}

static inline TscDirEntryArray tsc_fs_readdir_sync(String path) {
    char *p = (char *)malloc(path.length + 1);
    memcpy(p, path.data, path.length); p[path.length] = '\0';
    TscDirEntryArray r = _tsc_fs_readdir(p);
    free(p);
    return r;
}

/* -------------------------------------------------------------------------
 * Async variants (sync-over-async: do real work in _async, poll just signals)
 * ------------------------------------------------------------------------- */
static inline TscFsReadAwaitable tsc_fs_read_async(String path) {
    TscFsReadAwaitable a;
    a._done = true;
    a._result = tsc_fs_read_sync(path);
    return a;
}
static inline void tsc_fs_read_poll(TscFsReadAwaitable *a) { a->_done = true; }

static inline TscFsReadBytesAwaitable tsc_fs_read_bytes_async(String path) {
    TscFsReadBytesAwaitable a;
    a._done = true;
    a._result = tsc_fs_read_bytes_sync(path);
    return a;
}
static inline void tsc_fs_read_bytes_poll(TscFsReadBytesAwaitable *a) { a->_done = true; }

static inline TscFsVoidAwaitable tsc_fs_write_async(String path, String data) {
    tsc_fs_write_sync(path, data);
    return (TscFsVoidAwaitable){ ._done = true };
}
static inline void tsc_fs_write_poll(TscFsVoidAwaitable *a) { a->_done = true; }

static inline TscFsVoidAwaitable tsc_fs_append_async(String path, String data) {
    tsc_fs_append_sync(path, data);
    return (TscFsVoidAwaitable){ ._done = true };
}
static inline void tsc_fs_append_poll(TscFsVoidAwaitable *a) { a->_done = true; }

static inline TscFsVoidAwaitable tsc_fs_remove_async(String path) {
    tsc_fs_remove_sync(path);
    return (TscFsVoidAwaitable){ ._done = true };
}
static inline void tsc_fs_remove_poll(TscFsVoidAwaitable *a) { a->_done = true; }

static inline TscFsVoidAwaitable tsc_fs_rename_async(String from, String to) {
    tsc_fs_rename_sync(from, to);
    return (TscFsVoidAwaitable){ ._done = true };
}
static inline void tsc_fs_rename_poll(TscFsVoidAwaitable *a) { a->_done = true; }

static inline TscFsVoidAwaitable tsc_fs_mkdir_async(String path) {
    tsc_fs_mkdir_sync(path);
    return (TscFsVoidAwaitable){ ._done = true };
}
static inline void tsc_fs_mkdir_poll(TscFsVoidAwaitable *a) { a->_done = true; }

static inline TscFsBoolAwaitable tsc_fs_exists_async(String path) {
    return (TscFsBoolAwaitable){ ._done = true, ._result = tsc_fs_exists_sync(path) };
}
static inline void tsc_fs_exists_poll(TscFsBoolAwaitable *a) { a->_done = true; }

static inline TscFsStatAwaitable tsc_fs_stat_async(String path) {
    return (TscFsStatAwaitable){ ._done = true, ._result = tsc_fs_stat_sync(path) };
}
static inline void tsc_fs_stat_poll(TscFsStatAwaitable *a) { a->_done = true; }

static inline TscFsReaddirAwaitable tsc_fs_readdir_async(String path) {
    return (TscFsReaddirAwaitable){ ._done = true, ._result = tsc_fs_readdir_sync(path) };
}
static inline void tsc_fs_readdir_poll(TscFsReaddirAwaitable *a) { a->_done = true; }

static inline void tsc_fs_watch(String path, TscWatchCallback cb) {
    (void)path; (void)cb;
}
