#include "runtime.h"

typedef struct { uint8_t *data; size_t length; } Buffer;

int main(void) {
    TSC_INIT();
    uint8_t _buf_data_0[10] = {0};
    const Buffer buf = {.data = _buf_data_0, .length = 10};
    const Buffer s = {.data = buf.data + 2, .length = 3};
    printf("%zu\n", s.length);
    return 0;
}
