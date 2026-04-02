#include "runtime.h"

typedef struct { uint8_t *data; size_t length; } Buffer;
typedef struct { uint8_t *data; size_t length; } DataView;

int main(void) {
    TSC_INIT();
    uint8_t _buf_data_0[4] = {0};
    const Buffer buf = {.data = _buf_data_0, .length = 4};
    DataView dv = {.data = buf.data, .length = buf.length};
    dv.data[0] = 0xFF;
    printf("%u\n", dv.data[0]);
    return 0;
}
