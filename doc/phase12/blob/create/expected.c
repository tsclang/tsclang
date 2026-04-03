#include "runtime.h"
#include "std/blob.h"

typedef struct { uint8_t *data; size_t length; } Buffer;

int main(void) {
    TSC_INIT();
    uint8_t _buf_data_0[3] = {0};
    const Buffer buf = {.data = _buf_data_0, .length = 3};
    buf.data[0] = 72; buf.data[1] = 105; buf.data[2] = 0;
    TscBlob b = tsc_blob_create(buf.data, buf.length, STR_LIT("text/plain"));
    printf("%zu\n", b.size);
    return 0;
}
