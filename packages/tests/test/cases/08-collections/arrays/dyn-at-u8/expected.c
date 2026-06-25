#include "runtime.h"

#ifndef tsc_array_at_u8
#define tsc_array_at_u8(arr, idx) ({ \
    Array_u8 _a_ = (arr); int32_t _i_ = (idx); \
    if (_i_ < 0) _i_ = (int32_t)_a_.length + _i_; \
    _a_.data[(size_t)_i_]; \
})
#endif

int main(void) {
    TSC_INIT();
    uint8_t _lit_0[] = {10, 20, 30};
    Array_u8 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    printf("%u\n", (unsigned)tsc_array_at_u8(arr, 0));
    printf("%u\n", (unsigned)tsc_array_at_u8(arr, -1));
    return 0;
}
