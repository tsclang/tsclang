#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {10, 20, 30};
    const Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    Array_f64 arr2 = tsc_array_slice_f64(arr, 0, (int32_t)arr.length);
    tsc_array_push_f64(&arr2, 40);
    printf("%zu\n", arr.length);
    printf("%zu\n", arr2.length);
    tsc_array_free_f64(&arr2);
    return 0;
}
