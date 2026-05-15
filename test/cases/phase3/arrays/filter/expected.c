#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static bool _lambda_0_bool(int32_t x) {
    return x % 2 == 0;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3, 4, 5};
    const Array_i32 arr = {.data = _lit_0, .length = 5, .capacity = 5};
    Array_i32 evens = tsc_array_filter_i32(arr, _lambda_0_bool);
    printf("%zu\n", evens.length);
    printf("%d\n", evens.data[0]);
    tsc_array_free_i32(&evens);
    return 0;
}
