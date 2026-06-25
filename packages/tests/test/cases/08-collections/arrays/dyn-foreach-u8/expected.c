#include "runtime.h"

static void _lambda_0_void(uint8_t x) {
    printf("%u\n", (unsigned)x);
}

#ifndef tsc_array_foreach_u8
#define tsc_array_foreach_u8(arr, fn) do { \
    Array_u8 _a_ = (arr); \
    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) (fn)(_a_.data[_i_]); \
} while(0)
#endif

int main(void) {
    TSC_INIT();
    uint8_t _lit_0[] = {10, 20, 30};
    Array_u8 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    tsc_array_foreach_u8(arr, _lambda_0_void);
    return 0;
}
