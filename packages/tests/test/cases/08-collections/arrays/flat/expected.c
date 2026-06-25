#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3};
    const Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    const Array_f64 flat = tsc_array_flat_f64(arr);
    printf("%zu\n", flat.length);
    printf("%s\n", tsc_dtoa((double)(flat.data[0])));
    return 0;
}
