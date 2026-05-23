#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;
typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3};
    const Array_f64 src = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    Array_i32 _from_1 = src;
    Array_i32 copy = tsc_array_slice_i32(_from_1, 0, (int32_t)_from_1.length);
    printf("%zu\n", copy.length);
    printf("%d\n", copy.data[0]);
    printf("%d\n", copy.data[2]);
    tsc_array_free_i32(&copy);
    return 0;
}
