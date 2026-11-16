#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static int32_t total;

static void _lambda_0_void(void *_env, int32_t x) {
    total = (int32_t)((uint32_t)total + (uint32_t)x);
}

static void _lambda_0_void_adapter(int32_t _p0) {
    _lambda_0_void(((void *)0), _p0);
}

static int32_t total = 0;

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {1, 2, 3};
    Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 3, .capacity = 3};
    tsc_array_foreach_i32(arr, _lambda_0_void_adapter);
    printf("%d\n", total);
    return 0;
}
