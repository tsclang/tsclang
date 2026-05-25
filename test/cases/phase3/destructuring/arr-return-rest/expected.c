#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

Array_i32 tail_Array_i32(Array_i32 arr) {
    const int32_t _ = arr.data[0];
    Array_i32 rest = tsc_array_slice_i32(arr, 1, (int32_t)arr.length);
    return rest;
}

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {10, 20, 30};
    const Array_i32 result = tail_Array_i32((Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3});
    printf("%d\n", result.data[0]);
    printf("%d\n", result.data[1]);
    printf("%zu\n", result.length);
    return 0;
}
