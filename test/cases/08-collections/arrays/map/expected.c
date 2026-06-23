#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

static double _lambda_0_f64(int32_t x) {
    return x * 2;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    const Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    Array_f64 doubled = tsc_array_map_i32_f64(arr, _lambda_0_f64);
    printf("%s\n", tsc_dtoa((double)(doubled.data[0])));
    printf("%s\n", tsc_dtoa((double)(doubled.data[1])));
    printf("%s\n", tsc_dtoa((double)(doubled.data[2])));
    tsc_array_free_f64(&doubled);
    return 0;
}
