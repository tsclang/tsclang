#include "runtime.h"

typedef struct { uint8_t *data; size_t length; } Buffer;

int main(void) {
    TSC_INIT();
    uint8_t _buf_data_0[4] = {0};
    const Buffer buf = {.data = _buf_data_0, .length = 4};
    memset(buf.data, 0xFF, buf.length);
    printf("%u\n", (unsigned)buf.data[0]);
    printf("%u\n", (unsigned)buf.data[3]);
    return 0;
}
