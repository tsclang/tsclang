#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static String _lambda_0_string(String acc, int32_t x) {
    return tsc_string_concat(acc, tsc_i32_to_string(x));
}

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {1, 2, 3};
    const Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 3, .capacity = 3};
    const String result = tsc_array_reduce_i32_string(arr, _lambda_0_string, STR_LIT(""));
    printf("%s\n", result.data);
    tsc_string_release(result);
    return 0;
}
