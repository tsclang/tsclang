#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {1, 2, 3};
    const Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 3, .capacity = 3};
    const Array_i32 arr2 = tsc_array_with_i32(arr, 1, 99);
    printf("%d\n", arr2.data[1]);
    printf("%d\n", arr.data[1]);
    return 0;
}
