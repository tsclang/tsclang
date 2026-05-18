#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {1, 2, 3};
    const Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 3, .capacity = 3};
    const Array_i32 flat = tsc_array_flat_i32(arr);
    printf("%zu\n", flat.length);
    printf("%d\n", flat.data[0]);
    return 0;
}
