#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3, 4, 5};
    const Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 5, .capacity = 5};
    const Array_f64 spliced = tsc_array_to_spliced_f64(arr, 1, 2, 10, 20);
    printf("%s\n", tsc_dtoa((double)(spliced.data[1])));
    printf("%zu\n", arr.length);
    return 0;
}
