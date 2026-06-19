#include "runtime.h"

typedef struct { uint8_t *data; size_t length; } Buffer;

int main(void) {
    TSC_INIT();
    uint8_t _buf_data_0[256] = {0};
    const Buffer buf = {.data = _buf_data_0, .length = 256};
    printf("%zu\n", buf.length);
    return 0;
}
