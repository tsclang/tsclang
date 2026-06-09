#include "runtime.h"

typedef struct { uint8_t *data; size_t length; } Buffer;
typedef struct { uint8_t *data; size_t byte_offset; size_t byte_length; } DataView;

int main(void) {
    TSC_INIT();
    uint8_t _buf_data_0[4] = {0};
    const Buffer buf = {.data = _buf_data_0, .length = 4};
    DataView dv = {.data = buf.data, .byte_offset = (size_t)(0), .byte_length = (size_t)(buf.length)};
    (dv.data + dv.byte_offset + 0)[0] = (uint8_t)0x01;
    (dv.data + dv.byte_offset + 1)[0] = (uint8_t)0x00;
    uint16_t _dv_1 = {0}; memcpy(&_dv_1, (dv.data + dv.byte_offset + 0), 2);
    printf("%u\n", (unsigned)(uint16_t)_dv_1);
    return 0;
}
