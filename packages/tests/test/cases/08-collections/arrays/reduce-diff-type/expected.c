#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

static String _lambda_0_string(String acc, int32_t x) {
    return tsc_string_concat(acc, tsc_i32_to_string(x));
}

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3};
    const Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    const String result = tsc_array_reduce_f64_string(arr, _lambda_0_string, STR_LIT(""));
    printf("%s\n", result.data);
    tsc_string_release(result);
    return 0;
}
