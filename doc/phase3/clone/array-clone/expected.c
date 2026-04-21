#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {1, 2, 3};
    const Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 3, .capacity = 3};
    Array_i32 arr2 = tsc_array_slice_i32(arr, 0, (int32_t)arr.length);
    tsc_array_push_i32(&arr2, 4);
    printf("%zu\n", arr.length);
    printf("%zu\n", arr2.length);
    tsc_array_free_i32(&arr2);
    return 0;
}
