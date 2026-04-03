#include "runtime.h"
#include "std/hal.h"

typedef struct { uint8_t *data; size_t length; size_t capacity; } Array_u8;

int main(void) {
    TSC_INIT();
    uint8_t _arr_data_0[] = {0x01, 0x02};
    Array_u8 data = {.data = _arr_data_0, .length = 2, .capacity = 2};
    tsc_i2c_write(0x48, data.data, data.length);
    Array_u8 rx = tsc_i2c_read(0x48, 2);
    (void)rx;
    return 0;
}
