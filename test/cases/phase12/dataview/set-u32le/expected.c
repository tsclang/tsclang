#include "runtime.h"

typedef struct { uint8_t *data; size_t length; } Buffer;
typedef struct { uint8_t *data; size_t length; } DataView;

int main(void) {
    TSC_INIT();
    uint8_t _buf_data_0[8] = {0};
    const Buffer buf = {.data = _buf_data_0, .length = 8};
    DataView dv = {.data = buf.data, .length = buf.length};
    uint32_t _w32_0 = 0xDEADBEEF;
    memcpy(dv.data + 0, &_w32_0, 4);
    uint32_t _r32_0; memcpy(&_r32_0, dv.data + 0, 4);
    printf("%u\n", _r32_0);
    return 0;
}
