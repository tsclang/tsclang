#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static void _lambda_0_void(int32_t x) {
    printf("%d\n", x);
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    const Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    tsc_array_foreach_i32(arr, _lambda_0_void);
    return 0;
}
