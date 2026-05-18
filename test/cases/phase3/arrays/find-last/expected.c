#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { bool has_value; int32_t *value; } opt_ref_i32;

static bool _lambda_0_bool(int32_t x) {
    return x > 2;
}

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {1, 2, 3, 4};
    const Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 4, .capacity = 4};
    opt_ref_i32 found = tsc_array_find_last_i32(arr, _lambda_0_bool);
    printf("%d\n", found.has_value ? *found.value : -1);
    return 0;
}
