#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

static String _lambda_0_string(void *_env, String acc, int32_t x) {
    return tsc_string_concat(acc, tsc_i32_to_string(x));
}

static String _lambda_0_string_adapter(String _p0, int32_t _p1) {
    return _lambda_0_string(((void *)0), _p0, _p1);
}

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3};
    const Array_f64 arr = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    const String result = tsc_array_reduce_f64_string(arr, _lambda_0_string_adapter, STR_LIT(""));
    printf("%s\n", result.data);
    tsc_string_release(result);
    return 0;
}
