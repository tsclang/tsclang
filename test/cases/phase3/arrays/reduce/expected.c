#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static double _lambda_0_f64(double acc, int32_t x) {
    return acc + x;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3, 4};
    const Array_i32 arr = {.data = _lit_0, .length = 4, .capacity = 4};
    const double sum = tsc_array_reduce_i32_f64(arr, _lambda_0_f64, 0);
    printf("%g\n", (double)(sum));
    return 0;
}
