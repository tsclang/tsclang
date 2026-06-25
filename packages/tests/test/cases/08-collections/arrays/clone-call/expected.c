#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {10, 20, 30};
    const Array_i32 a = (Array_i32){.data = _arr_data_0, .length = 3, .capacity = 3};
    Array_i32 b = tsc_array_slice_i32(a, 0, (int32_t)a.length);
    b.data[0] = 99;
    printf("%d\n", a.data[0]);
    tsc_array_free_i32(&b);
    return 0;
}
