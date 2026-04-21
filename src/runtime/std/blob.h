/* std/blob.h — TSClang Blob type */
#pragma once
#include <stdlib.h>
#include <string.h>

typedef struct {
    uint8_t *_data;
    size_t   size;
    String   type;
} TscBlob;

static inline TscBlob tsc_blob_create(const uint8_t *data, size_t len, String type) {
    uint8_t *buf = (uint8_t *)malloc(len);
    memcpy(buf, data, len);
    return (TscBlob){ ._data = buf, .size = len, .type = type };
}

static inline String tsc_blob_text(TscBlob *b) {
    char *s = (char *)malloc(b->size + 1);
    memcpy(s, b->_data, b->size);
    s[b->size] = '\0';
    return (String){ .data = s, .length = b->size, .capacity = b->size + 1 };
}

static inline String tsc_blob_to_string(TscBlob *b) {
    return tsc_blob_text(b);
}

static inline void tsc_blob_free(TscBlob *b) {
    free(b->_data);
    b->_data = NULL;
    b->size = 0;
}
