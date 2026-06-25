#include "runtime.h"
#include "std/hal.h"

int main(void) {
    TSC_INIT();
    uint8_t _lit_0[] = {0x01, 0x02};
    const Array_u8 data = {.data = _lit_0, .length = 2, .capacity = 2};
    tsc_i2c_write(0x48, data.data, data.length);
    const Array_u8 rx = tsc_i2c_read(0x48, 2);
    (void)rx;
    return 0;
}
