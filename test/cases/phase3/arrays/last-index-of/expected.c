#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3, 2, 1};
    const Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 5, .capacity = 5};
    printf("%d\n", (int)tsc_array_last_index_of_f64(arr, 2));
    printf("%d\n", (int)tsc_array_last_index_of_f64(arr, 99));
    return 0;
}
