#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {1, 2, 3, 4, 5};
    Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 5, .capacity = 5};
    const Array_i32 removed = tsc_array_splice_i32(&arr, 1, 2, 10, 20);
    printf("%zu\n", arr.length);
    printf("%d\n", arr.data[1]);
    printf("%zu\n", removed.length);
    return 0;
}
