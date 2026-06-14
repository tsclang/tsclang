#include "runtime.h"

static bool _lambda_0_bool(uint8_t x) {
    return fmod(x, 2) == 0;
}

#ifndef tsc_array_filter_u8
#define tsc_array_filter_u8(arr, pred) ({ \
    Array_u8 _a_ = (arr); \
    Array_u8 _r_ = {NULL, 0, 0}; \
    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) { \
        if ((pred)(_a_.data[_i_])) { \
            if (_r_.length >= _r_.capacity) { \
                size_t _nc_ = _r_.capacity == 0 ? 8 : _r_.capacity * 2; \
                _r_.data = (uint8_t*)_tsc_xrealloc(_r_.data, _nc_ * sizeof(uint8_t)); _r_.capacity = _nc_; \
            } \
            _r_.data[_r_.length++] = _a_.data[_i_]; \
        } \
    } \
    _r_; \
})
#endif

int main(void) {
    TSC_INIT();
    uint8_t _lit_0[] = {1, 2, 3, 4, 5};
    Array_u8 arr = {.data = _lit_0, .length = 5, .capacity = 5};
    Array_u8 evens = tsc_array_filter_u8(arr, _lambda_0_bool);
    printf("%zu\n", evens.length);
    printf("%u\n", (unsigned)evens.data[0]);
    tsc_array_free_u8(&evens);
    return 0;
}
