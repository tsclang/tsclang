#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

static double _lambda_0_f64(int32_t x) {
    return x * 2;
}

static bool _lambda_1_bool(double x) {
    return x > 4;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3, 4, 5};
    const Array_i32 arr = {.data = _lit_0, .length = 5, .capacity = 5};
    Array_f64 _chain_1 = tsc_array_map_i32_f64(arr, _lambda_0_f64);
    printf("%zu\n", tsc_array_filter_f64(_chain_1, _lambda_1_bool).length);
    return 0;
}
