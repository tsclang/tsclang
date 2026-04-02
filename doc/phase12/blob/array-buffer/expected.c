#include "runtime.h"

typedef struct { uint8_t *data; size_t size; } Blob;
typedef struct { uint8_t *data; size_t length; } Buffer;

int main(void) {
    TSC_INIT();
    uint8_t _blob_data_0[] = {10, 20};
    const Blob b = {.data = _blob_data_0, .size = 2};
    const Buffer buf = {.data = b.data, .length = b.size};
    printf("%zu\n", buf.length);
    return 0;
}
