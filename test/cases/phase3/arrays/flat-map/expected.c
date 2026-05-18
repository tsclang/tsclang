#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static Array_i32 _lambda_0_Array_i32(int32_t x) {
    int32_t _arr_data_1[] = {x, x * 10};
    return (Array_i32){.data = _arr_data_1, .length = 2, .capacity = 2};
}

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {1, 2, 3};
    const Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 3, .capacity = 3};
    const Array_i32 result = tsc_array_flat_map_i32_i32(arr, _lambda_0_Array_i32);
    printf("%zu\n", result.length);
    printf("%d\n", result.data[1]);
    return 0;
}
