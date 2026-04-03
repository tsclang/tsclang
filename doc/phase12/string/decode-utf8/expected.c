#include "runtime.h"

typedef struct { uint8_t *data; size_t length; size_t capacity; } Array_u8;

int main(void) {
    TSC_INIT();
    uint8_t _arr_data_0[] = {104, 105};
    Array_u8 bytes = {.data = _arr_data_0, .length = 2, .capacity = 2};
    String s = tsc_decode_utf8(bytes);
    printf("%s\n", s.data);
    return 0;
}
