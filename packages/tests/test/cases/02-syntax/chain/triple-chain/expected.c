#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

static double _lambda_0_f64(void *_env, int32_t x) {
    return x * 2;
}

static double _lambda_0_f64_adapter(int32_t _p0) {
    return _lambda_0_f64(((void *)0), _p0);
}

static bool _lambda_1_bool(void *_env, double x) {
    return x > 4;
}

static bool _lambda_1_bool_adapter(double _p0) {
    return _lambda_1_bool(((void *)0), _p0);
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3, 4, 5};
    const Array_i32 arr = {.data = _lit_0, .length = 5, .capacity = 5};
    Array_f64 _chain_1 = tsc_array_map_i32_f64(arr, _lambda_0_f64_adapter);
    printf("%zu\n", tsc_array_filter_f64(_chain_1, _lambda_1_bool_adapter).length);
    return 0;
}
