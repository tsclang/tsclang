#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

static bool _lambda_0_bool(double x) {
    return x > 2;
}

static bool _lambda_1_bool(double x) {
    return x > 10;
}

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3, 4};
    const Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 4, .capacity = 4};
    printf("%d\n", (int)tsc_array_find_last_index_f64(arr, _lambda_0_bool));
    printf("%d\n", (int)tsc_array_find_last_index_f64(arr, _lambda_1_bool));
    return 0;
}
