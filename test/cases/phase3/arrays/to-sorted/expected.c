#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {3, 1, 2};
    const Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 3, .capacity = 3};
    const Array_i32 sorted = tsc_array_to_sorted_i32(arr);
    printf("%d\n", sorted.data[0]);
    printf("%d\n", arr.data[0]);
    return 0;
}
