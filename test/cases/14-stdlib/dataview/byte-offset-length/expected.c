#include "runtime.h"

typedef struct { uint8_t *data; size_t length; } Buffer;
typedef struct { uint8_t *data; size_t byte_offset; size_t byte_length; } DataView;

int main(void) {
    TSC_INIT();
    uint8_t _buf_data_0[16] = {0};
    const Buffer buf = {.data = _buf_data_0, .length = 16};
    DataView dv = {.data = buf.data, .byte_offset = (size_t)(4), .byte_length = (size_t)(8)};
    printf("%d\n", (size_t)dv.byte_offset);
    printf("%d\n", (size_t)dv.byte_length);
    return 0;
}
