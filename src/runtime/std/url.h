/* std/url.h — TSClang URL parsing */
#pragma once
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#define TSC_URL_MAX_PARAMS 32

typedef struct { String key; String value; } TscURLParam;
typedef struct { bool has_value; String value; } TscOptString;

typedef struct {
    TscURLParam entries[TSC_URL_MAX_PARAMS];
    size_t count;
} TscURLSearchParams;

typedef struct {
    String protocol;
    String host;
    String pathname;
    String hash;
    TscURLSearchParams searchParams;
    char *_buf;
} TscURL;

typedef struct { TscURLSearchParams *_params; size_t _idx; } TscURLParamIter;

static inline String _tsc_strdup_s(const char *s, size_t len) {
    char *buf = (char *)malloc(len + 1);
    memcpy(buf, s, len);
    buf[len] = '\0';
    return (String){ .data = buf, .length = len, .capacity = len + 1 };
}

static inline TscURLSearchParams _tsc_parse_query(const char *q, size_t qlen) {
    TscURLSearchParams sp = {0};
    size_t i = 0;
    while (i < qlen && sp.count < TSC_URL_MAX_PARAMS) {
        size_t key_start = i;
        while (i < qlen && q[i] != '=' && q[i] != '&') i++;
        size_t key_len = i - key_start;
        String k = _tsc_strdup_s(q + key_start, key_len);
        String v = _tsc_strdup_s("", 0);
        if (i < qlen && q[i] == '=') {
            i++;
            size_t val_start = i;
            while (i < qlen && q[i] != '&') i++;
            free(v.data);
            v = _tsc_strdup_s(q + val_start, i - val_start);
        }
        if (i < qlen && q[i] == '&') i++;
        sp.entries[sp.count++] = (TscURLParam){ .key = k, .value = v };
    }
    return sp;
}

static inline TscURL tsc_url_parse(String s) {
    TscURL u = {0};
    const char *p = s.data;
    size_t len = s.length;

    /* protocol */
    const char *colon = memchr(p, ':', len);
    if (colon && colon[1] == '/' && colon[2] == '/') {
        size_t proto_len = colon - p + 1; /* include ':' */
        u.protocol = _tsc_strdup_s(p, proto_len);
        p = colon + 3; len -= (colon + 3 - s.data);
    } else {
        u.protocol = _tsc_strdup_s("", 0);
    }

    /* host */
    const char *slash = memchr(p, '/', len);
    const char *qmark = memchr(p, '?', len);
    const char *hash  = memchr(p, '#', len);
    size_t host_end = len;
    if (slash) host_end = (size_t)(slash - p);
    if (qmark && (size_t)(qmark - p) < host_end) host_end = (size_t)(qmark - p);
    if (hash  && (size_t)(hash  - p) < host_end) host_end = (size_t)(hash  - p);
    u.host = _tsc_strdup_s(p, host_end);
    p += host_end; len -= host_end;

    /* pathname */
    if (len > 0 && *p == '/') {
        const char *end = p;
        while ((size_t)(end - p) < len && *end != '?' && *end != '#') end++;
        u.pathname = _tsc_strdup_s(p, end - p);
        len -= (size_t)(end - p); p = end;
    } else {
        u.pathname = _tsc_strdup_s("/", 1);
    }

    /* search params */
    if (len > 0 && *p == '?') {
        p++; len--;
        const char *end = p;
        while ((size_t)(end - p) < len && *end != '#') end++;
        u.searchParams = _tsc_parse_query(p, end - p);
        len -= (size_t)(end - p); p = end;
    }

    /* hash */
    if (len > 0 && *p == '#') {
        u.hash = _tsc_strdup_s(p, len);
    } else {
        u.hash = _tsc_strdup_s("", 0);
    }

    return u;
}

static inline TscURL tsc_url_parse_relative(String ref, TscURL *base) {
    TscURL u = {0};
    u.protocol = _tsc_strdup_s(base->protocol.data, base->protocol.length);
    u.host     = _tsc_strdup_s(base->host.data, base->host.length);
    u.hash     = _tsc_strdup_s("", 0);

    const char *r = ref.data;
    size_t rlen = ref.length;
    if (rlen > 0 && r[0] == '/') {
        u.pathname = _tsc_strdup_s(r, rlen);
        return u;
    }

    /* Build combined path: base_dir + ref */
    const char *base_path = base->pathname.data;
    size_t base_len = base->pathname.length;
    const char *last_slash = NULL;
    for (size_t i = 0; i < base_len; i++)
        if (base_path[i] == '/') last_slash = base_path + i;
    size_t dir_len = last_slash ? (size_t)(last_slash + 1 - base_path) : 0;
    size_t combined_len = dir_len + rlen;
    char *combined = (char *)malloc(combined_len + 1);
    memcpy(combined, base_path, dir_len);
    memcpy(combined + dir_len, r, rlen);
    combined[combined_len] = '\0';

    /* Resolve path using segment stack */
    char **segs = (char **)malloc((combined_len + 2) * sizeof(char *));
    size_t *seg_lens = (size_t *)malloc((combined_len + 2) * sizeof(size_t));
    int32_t nseg = 0;
    bool leading_slash = combined[0] == '/';
    char *tok = combined + (leading_slash ? 1 : 0);
    char *end = combined + combined_len;
    while (tok <= end) {
        char *next = tok;
        while (next < end && *next != '/') next++;
        size_t slen = (size_t)(next - tok);
        if (slen == 2 && tok[0] == '.' && tok[1] == '.') {
            if (nseg > 0) nseg--;
        } else if (!(slen == 1 && tok[0] == '.') && slen > 0) {
            segs[nseg] = tok;
            seg_lens[nseg] = slen;
            nseg++;
        }
        tok = next + 1;
    }
    /* Reconstruct */
    size_t out_len = leading_slash ? 1 : 0;
    for (int32_t i = 0; i < nseg; i++) out_len += seg_lens[i] + (i > 0 ? 1 : 0);
    char *out = (char *)malloc(out_len + 1);
    size_t pos = 0;
    if (leading_slash) out[pos++] = '/';
    for (int32_t i = 0; i < nseg; i++) {
        if (i > 0) out[pos++] = '/';
        memcpy(out + pos, segs[i], seg_lens[i]);
        pos += seg_lens[i];
    }
    out[pos] = '\0';
    free(segs); free(seg_lens); free(combined);

    u.pathname = (String){ .data = out, .length = pos, .capacity = out_len + 1 };
    return u;
}

static inline String tsc_url_search(TscURL *u) {
    /* Build ?key=value&... string */
    if (u->searchParams.count == 0) return _tsc_strdup_s("", 0);
    size_t total = 1; /* '?' */
    for (size_t i = 0; i < u->searchParams.count; i++) {
        total += u->searchParams.entries[i].key.length + 1; /* key + '=' */
        total += u->searchParams.entries[i].value.length;
        if (i + 1 < u->searchParams.count) total++;
    }
    char *buf = (char *)malloc(total + 1);
    size_t pos = 0;
    buf[pos++] = '?';
    for (size_t i = 0; i < u->searchParams.count; i++) {
        TscURLParam *e = &u->searchParams.entries[i];
        memcpy(buf + pos, e->key.data, e->key.length); pos += e->key.length;
        buf[pos++] = '=';
        memcpy(buf + pos, e->value.data, e->value.length); pos += e->value.length;
        if (i + 1 < u->searchParams.count) buf[pos++] = '&';
    }
    buf[pos] = '\0';
    return (String){ .data = buf, .length = pos, .capacity = total + 1 };
}

static inline void tsc_url_params_set(TscURL *u, String key, String value) {
    for (size_t i = 0; i < u->searchParams.count; i++) {
        if (tsc_string_eq(u->searchParams.entries[i].key, key)) {
            free(u->searchParams.entries[i].value.data);
            u->searchParams.entries[i].value = _tsc_strdup_s(value.data, value.length);
            return;
        }
    }
    if (u->searchParams.count < TSC_URL_MAX_PARAMS) {
        u->searchParams.entries[u->searchParams.count++] = (TscURLParam){
            .key   = _tsc_strdup_s(key.data, key.length),
            .value = _tsc_strdup_s(value.data, value.length)
        };
    }
}

static inline void tsc_url_params_delete(TscURL *u, String key) {
    for (size_t i = 0; i < u->searchParams.count; i++) {
        if (tsc_string_eq(u->searchParams.entries[i].key, key)) {
            free(u->searchParams.entries[i].key.data);
            free(u->searchParams.entries[i].value.data);
            /* shift remaining entries */
            for (size_t j = i; j + 1 < u->searchParams.count; j++)
                u->searchParams.entries[j] = u->searchParams.entries[j + 1];
            u->searchParams.count--;
            return;
        }
    }
}

static inline TscOptString tsc_search_params_get(TscURLSearchParams *sp, String key) {
    for (size_t i = 0; i < sp->count; i++) {
        if (tsc_string_eq(sp->entries[i].key, key))
            return (TscOptString){ .has_value = true, .value = sp->entries[i].value };
    }
    return (TscOptString){ .has_value = false };
}

static inline TscURLSearchParams tsc_search_params_parse(String s) {
    return _tsc_parse_query(s.data, s.length);
}

static inline void tsc_search_params_free(TscURLSearchParams *sp) {
    for (size_t i = 0; i < sp->count; i++) {
        free(sp->entries[i].key.data);
        free(sp->entries[i].value.data);
    }
    sp->count = 0;
}

static inline TscURLParamIter tsc_url_params_iter(TscURL *u) {
    return (TscURLParamIter){ ._params = &u->searchParams, ._idx = 0 };
}

static inline bool tsc_url_params_next(TscURLParamIter *it, TscURLParam *out) {
    if (it->_idx >= it->_params->count) return false;
    *out = it->_params->entries[it->_idx++];
    return true;
}

static inline void tsc_url_free(TscURL *u) {
    free(u->protocol.data);
    free(u->host.data);
    free(u->pathname.data);
    free(u->hash.data);
    tsc_search_params_free(&u->searchParams);
}
