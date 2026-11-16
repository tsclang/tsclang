#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static double _lambda_0_f64(void *_env, double acc, int32_t x) {
    return acc + x;
}

static double _lambda_0_f64_adapter(double _p0, int32_t _p1) {
    return _lambda_0_f64(((void *)0), _p0, _p1);
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3, 4};
    const Array_i32 arr = {.data = _lit_0, .length = 4, .capacity = 4};
    const double sum = tsc_array_reduce_i32_f64(arr, _lambda_0_f64_adapter, 0);
    printf("%s\n", tsc_dtoa((double)(sum)));
    return 0;
}
