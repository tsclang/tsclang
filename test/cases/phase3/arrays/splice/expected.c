#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3, 4, 5};
    Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 5, .capacity = 5};
    const Array_f64 removed = tsc_array_splice_f64(&arr, 1, 2, 10, 20);
    printf("%zu\n", arr.length);
    printf("%g\n", arr.data[1]);
    printf("%zu\n", removed.length);
    return 0;
}
