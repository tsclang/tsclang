#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3, 4, 5};
    const Array_i32 arr = {.data = _lit_0, .length = 5, .capacity = 5};
    Array_i32 sub = tsc_array_slice_i32(arr, 1, 4);
    printf("%zu\n", sub.length);
    printf("%d\n", sub.data[0]);
    tsc_array_free_i32(&sub);
    return 0;
}
