#include "runtime.h"

typedef struct { uint8_t *data; size_t length; } Buffer;
typedef struct { uint8_t *data; size_t length; } DataView;

int main(void) {
    TSC_INIT();
    uint8_t _buf_data_0[8] = {0};
    const Buffer buf = {.data = _buf_data_0, .length = 8};
    DataView dv = {.data = buf.data, .length = buf.length};
    double _wf64_0 = 1.5;
    memcpy(dv.data + 0, &_wf64_0, 8);
    double _rf64_0; memcpy(&_rf64_0, dv.data + 0, 8);
    printf("%g\n", _rf64_0);
    return 0;
}
