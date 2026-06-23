#include "runtime.h"

static double _lambda_0_f64(double acc, uint8_t x) {
    return acc + x;
}

#ifndef tsc_array_reduce_u8_f64
#define tsc_array_reduce_u8_f64(arr, fn, init) ({ \
    Array_u8 _a_ = (arr); double _acc_ = (init); \
    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) _acc_ = (fn)(_acc_, _a_.data[_i_]); \
    _acc_; \
})
#endif

int main(void) {
    TSC_INIT();
    uint8_t _lit_0[] = {1, 2, 3, 4, 5};
    Array_u8 arr = {.data = _lit_0, .length = 5, .capacity = 5};
    const double sum = tsc_array_reduce_u8_f64(arr, _lambda_0_f64, 0);
    printf("%s\n", tsc_dtoa((double)(sum)));
    return 0;
}
