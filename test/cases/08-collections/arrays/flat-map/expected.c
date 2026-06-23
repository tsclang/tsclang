#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

static Array_f64 _lambda_0_Array_f64(double x) {
    double *_arr_data_1 = (double*)malloc(2 * sizeof(double));
    _arr_data_1[0] = x;
    _arr_data_1[1] = x * 10;
    return (Array_f64){.data = _arr_data_1, .length = 2, .capacity = 2};
}

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3};
    const Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    const Array_f64 result = tsc_array_flat_map_f64_f64(arr, _lambda_0_Array_f64);
    printf("%zu\n", result.length);
    printf("%s\n", tsc_dtoa((double)(result.data[1])));
    return 0;
}
