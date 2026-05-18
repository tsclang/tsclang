#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static bool _lambda_0_bool(int32_t x) {
    return x > 2;
}

static bool _lambda_1_bool(int32_t x) {
    return x > 10;
}

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {1, 2, 3, 4};
    const Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 4, .capacity = 4};
    printf("%d\n", (int)tsc_array_find_last_index_i32(arr, _lambda_0_bool));
    printf("%d\n", (int)tsc_array_find_last_index_i32(arr, _lambda_1_bool));
    return 0;
}
