#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {3, 1, 2};
    const Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    const Array_f64 sorted = tsc_array_to_sorted_f64(arr);
    printf("%s\n", tsc_dtoa((double)(sorted.data[0])));
    printf("%s\n", tsc_dtoa((double)(arr.data[0])));
    return 0;
}
