#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { bool has_value; int32_t *value; } opt_ref_i32;

static bool _lambda_0_bool(void *_env, int32_t x) {
    return x > 4;
}

static bool _lambda_0_bool_adapter(int32_t _p0) {
    return _lambda_0_bool(((void *)0), _p0);
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 5, 3, 8, 2};
    Array_i32 arr = {.data = _lit_0, .length = 5, .capacity = 5};
    opt_ref_i32 found = tsc_array_find_i32(arr, _lambda_0_bool_adapter);
    printf("%d\n", found.has_value ? *found.value : -1);
    return 0;
}
