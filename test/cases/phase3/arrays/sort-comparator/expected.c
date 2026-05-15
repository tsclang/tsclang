#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static int32_t _lambda_0_i32(int32_t a, int32_t b) {
    return b - a;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {3, 1, 4};
    Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    tsc_array_sort_i32(&arr, (tsc_closure){.env = NULL, .fn = (void*)_lambda_0_i32});
    printf("%d\n", arr.data[0]);
    return 0;
}
