#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3};
    const Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    const Array_f64 arr2 = tsc_array_with_f64(arr, 1, 99);
    printf("%s\n", tsc_dtoa((double)(arr2.data[1])));
    printf("%s\n", tsc_dtoa((double)(arr.data[1])));
    return 0;
}
