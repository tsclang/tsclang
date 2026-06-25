#include "runtime.h"

typedef struct { double *data; size_t length; size_t capacity; } Array_f64;
typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    double _arr_data_0[] = {1, 2, 3};
    const Array_f64 src = (Array_f64){.data = _arr_data_0, .length = 3, .capacity = 3};
    const Array_i32 copy = tsc_array_cast_f64_i32(src);
    printf("%zu\n", copy.length);
    printf("%d\n", copy.data[0]);
    printf("%d\n", copy.data[2]);
    return 0;
}
