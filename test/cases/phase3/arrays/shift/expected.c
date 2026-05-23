#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;
typedef struct { bool has_value; double value; } opt_f64;

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3};
    Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    opt_f64 first = tsc_array_shift_f64(&arr);
    printf("%g\n", first.value);
    printf("%zu\n", arr.length);
    return 0;
}
