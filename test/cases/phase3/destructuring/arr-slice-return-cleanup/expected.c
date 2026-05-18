#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

Array_i32 getTail(void) {
    int32_t _lit_0[] = {1, 2, 3, 4};
    const Array_i32 arr = {.data = _lit_0, .length = 4, .capacity = 4};
    return tsc_array_slice_i32(arr, 2, (int32_t)arr.length);
}

int main(void) {
    TSC_INIT();
    const Array_i32 tail = getTail();
    printf("%d\n", tail.data[0]);
    printf("%zu\n", tail.length);
    return 0;
}
