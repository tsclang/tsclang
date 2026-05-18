#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {1, 2, 3, 2, 1};
    const Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 5, .capacity = 5};
    printf("%d\n", (int)tsc_array_last_index_of_i32(arr, 2));
    printf("%d\n", (int)tsc_array_last_index_of_i32(arr, 99));
    return 0;
}
