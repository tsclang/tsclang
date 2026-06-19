#include "runtime.h"

typedef struct { uint8_t *data; size_t length; } Buffer;
typedef struct { uint8_t *data; size_t byte_offset; size_t byte_length; } DataView;

int main(void) {
    TSC_INIT();
    uint8_t _buf_data_0[4] = {0};
    const Buffer buf = {.data = _buf_data_0, .length = 4};
    DataView dv = {.data = buf.data, .byte_offset = (size_t)(0), .byte_length = (size_t)(buf.length)};
    (dv.data + dv.byte_offset + 0)[0] = (uint8_t)0xFF;
    printf("%u\n", (unsigned)(uint8_t)(dv.data + dv.byte_offset + 0)[0]);
    return 0;
}
