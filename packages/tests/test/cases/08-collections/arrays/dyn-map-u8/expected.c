#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

static double _lambda_0_f64(uint8_t x) {
    return x * 2;
}

#ifndef tsc_array_map_u8_f64
#define tsc_array_map_u8_f64(arr, fn) ({ \
    Array_u8 _a_ = (arr); \
    double *_d_ = (double*)_tsc_xmalloc(_a_.length * sizeof(double)); \
    for (size_t _i_ = 0; _i_ < _a_.length; _i_++) _d_[_i_] = (fn)(_a_.data[_i_]); \
    (Array_f64){ .data = _d_, .length = _a_.length, .capacity = _a_.length }; \
})
#endif

int main(void) {
    TSC_INIT();
    uint8_t _lit_0[] = {1, 2, 3, 4, 5};
    Array_u8 arr = {.data = _lit_0, .length = 5, .capacity = 5};
    Array_f64 doubled = tsc_array_map_u8_f64(arr, _lambda_0_f64);
    printf("%s\n", tsc_dtoa((double)(doubled.data[0])));
    printf("%s\n", tsc_dtoa((double)(doubled.data[4])));
    tsc_array_free_f64(&doubled);
    return 0;
}
