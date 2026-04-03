#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2};
    Array_i32 arr = {.data = _lit_0, .length = 2, .capacity = 2};
    tsc_array_resize_i32(&arr, 4, 99);
    printf("%zu\n", arr.length);
    printf("%d\n", arr.data[3]);
    tsc_array_free_i32(&arr);
    return 0;
}
