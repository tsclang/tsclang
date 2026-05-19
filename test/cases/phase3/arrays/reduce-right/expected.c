#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static int32_t _lambda_0_i32(int32_t acc, int32_t x) {
    return acc * 10 + x;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3, 4};
    const Array_i32 arr = {.data = _lit_0, .length = 4, .capacity = 4};
    const int32_t result = tsc_array_reduce_right_i32_i32(arr, _lambda_0_i32, 0);
    printf("%d\n", result);
    return 0;
}
