#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

Array_i32 take_ref_Array_i32(const Array_i32 *arr) {
    return tsc_array_slice_i32((*arr), 1, (int32_t)(*arr).length);
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {10, 20, 30};
    const Array_i32 src = {.data = _lit_0, .length = 3, .capacity = 3};
    const Array_i32 sub = take_ref_Array_i32(&src);
    printf("%d\n", sub.data[0]);
    printf("%zu\n", src.length);
    return 0;
}
