#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static int32_t _lambda_0_i32(void *_env, int32_t a, int32_t b) {
    return (int32_t)((uint32_t)b - (uint32_t)a);
}

static int32_t _lambda_0_i32_adapter(int32_t _p0, int32_t _p1) {
    return _lambda_0_i32(((void *)0), _p0, _p1);
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {3, 1, 4};
    Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    tsc_array_sort_i32(&arr, _lambda_0_i32_adapter);
    printf("%d\n", arr.data[0]);
    return 0;
}
