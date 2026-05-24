#include "runtime.h"

typedef struct { uint8_t *data; size_t length; } Buffer;
typedef struct { uint8_t *data; size_t byte_offset; size_t byte_length; } DataView;

int main(void) {
    TSC_INIT();
    uint8_t _buf_data_0[8] = {0};
    const Buffer buf = {.data = _buf_data_0, .length = 8};
    DataView dv = {.data = buf.data, .byte_offset = (size_t)(0), .byte_length = (size_t)(buf.length)};
    float _dv_1 = (float)(float)3.14;
    memcpy((void*)(dv.data + dv.byte_offset + 0), &_dv_1, 4);
    (void)0;
    float _dv_2; memcpy(&_dv_2, (dv.data + dv.byte_offset + 0), 4);
    printf("%g\n", (double)(float)_dv_2);
    return 0;
}
