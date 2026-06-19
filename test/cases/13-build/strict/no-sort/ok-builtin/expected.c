#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {3, 1, 2};
    Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    tsc_array_sort_f64(&arr, NULL);
    printf("%g\n", (double)(arr.data[0]));
    return 0;
}
