#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3};
    const Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    const Array_f64 rev = tsc_array_to_reversed_f64(arr);
    printf("%g\n", (double)(rev.data[0]));
    printf("%g\n", (double)(arr.data[0]));
    return 0;
}
