#include "runtime.h"

typedef struct { uint8_t *data; size_t length; } Buffer;
typedef struct { uint8_t *data; size_t byte_offset; size_t byte_length; } DataView;

int main(void) {
    TSC_INIT();
    uint8_t _buf_data_0[4] = {0};
    const Buffer buf = {.data = _buf_data_0, .length = 4};
    DataView dv = {.data = buf.data, .byte_offset = (size_t)(0), .byte_length = (size_t)(buf.length)};
    (dv.data + dv.byte_offset + 0)[0] = (uint8_t)0x01;
    (dv.data + dv.byte_offset + 1)[0] = (uint8_t)0x02;
    (dv.data + dv.byte_offset + 2)[0] = (uint8_t)0x03;
    (dv.data + dv.byte_offset + 3)[0] = (uint8_t)0x04;
    uint32_t _dv_1 = {0};
    uint8_t *_p = (uint8_t*)&_dv_1;
    uint8_t *_s = (dv.data + dv.byte_offset + 0);
    _p[3] = _s[0]; _p[2] = _s[1]; _p[1] = _s[2]; _p[0] = _s[3];
    printf("%u\n", (uint32_t)_dv_1);
    return 0;
}
