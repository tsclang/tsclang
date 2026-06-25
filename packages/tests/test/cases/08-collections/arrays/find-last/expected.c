#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;
typedef struct { bool has_value; double *value; } opt_ref_f64;

static bool _lambda_0_bool(double x) {
    return x > 2;
}

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3, 4};
    const Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 4, .capacity = 4};
    opt_ref_f64 found = tsc_array_find_last_f64(arr, _lambda_0_bool);
    printf("%s\n", found.has_value ? tsc_dtoa((double)(*found.value)) : "null");
    return 0;
}
