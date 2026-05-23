#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {10, 20, 30};
    const Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    printf("%g\n", tsc_array_at_f64(arr, 0));
    printf("%g\n", tsc_array_at_f64(arr, -1));
    return 0;
}
