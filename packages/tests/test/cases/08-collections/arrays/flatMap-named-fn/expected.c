#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

Array_i32 pair_i32(int32_t x) {
    const int32_t a = x;
    const int32_t b = x * 10;
    int32_t _arr_data_0[] = {a, b};
    return (Array_i32){.data = _arr_data_0, .length = 2, .capacity = 2};
}

int main(void) {
    TSC_INIT();
    int32_t _lit_1[] = {1, 2};
    const Array_i32 arr = {.data = _lit_1, .length = 2, .capacity = 2};
    const Array_i32 result = tsc_array_flat_map_i32_i32(arr, pair_i32);
    printf("%zu\n", result.length);
    printf("%d\n", result.data[0]);
    printf("%d\n", result.data[1]);
    printf("%d\n", result.data[2]);
    printf("%d\n", result.data[3]);
    return 0;
}
