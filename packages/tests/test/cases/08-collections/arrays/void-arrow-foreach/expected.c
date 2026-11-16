#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static void _lambda_0_void(void *_env, int32_t x) {
    printf("%d\n", x);
}

static void _lambda_0_void_adapter(int32_t _p0) {
    _lambda_0_void(((void *)0), _p0);
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    const Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    tsc_array_foreach_i32(arr, _lambda_0_void_adapter);
    return 0;
}
