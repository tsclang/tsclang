#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

void process_Array_i32(Array_i32 arr) {
    Array_i32 sub = tsc_array_slice_i32(arr, 0, 2);
    printf("%d\n", arr.data[0]);
    printf("%d\n", sub.data[1]);
    tsc_array_free_i32(&sub);
}

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {10, 20, 30};
    process_Array_i32((Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3});
    return 0;
}
