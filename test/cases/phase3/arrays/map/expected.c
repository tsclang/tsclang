#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static int32_t _lambda_0_i32(int32_t x) {
    return x * 2;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    const Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    Array_i32 doubled = tsc_array_map_i32_i32(arr, (tsc_closure){.env = NULL, .fn = (void*)_lambda_0_i32});
    printf("%d\n", doubled.data[0]);
    printf("%d\n", doubled.data[1]);
    printf("%d\n", doubled.data[2]);
    tsc_array_free_i32(&doubled);
    return 0;
}
