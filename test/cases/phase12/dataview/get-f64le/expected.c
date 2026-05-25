#include "runtime.h"

typedef struct { uint8_t *data; size_t length; } Buffer;
typedef struct { uint8_t *data; size_t byte_offset; size_t byte_length; } DataView;

int main(void) {
    TSC_INIT();
    uint8_t _buf_data_0[8] = {0};
    const Buffer buf = {.data = _buf_data_0, .length = 8};
    DataView dv = {.data = buf.data, .byte_offset = (size_t)(0), .byte_length = (size_t)(buf.length)};
    double _dv_1 = (double)1.5;
    memcpy((void*)(dv.data + dv.byte_offset + 0), &_dv_1, 8);
    (void)0;
    double _dv_2; memcpy(&_dv_2, (dv.data + dv.byte_offset + 0), 8);
    printf("%g\n", (double)((double)_dv_2));
    return 0;
}
