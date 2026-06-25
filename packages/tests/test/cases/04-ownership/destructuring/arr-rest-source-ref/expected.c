#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

size_t len_ref_Array_i32(const Array_i32 *r) {
    return r->length;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    const Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    const int32_t first = arr.data[0];
    Array_i32 rest = tsc_array_slice_i32(arr, 1, (int32_t)arr.length);
    printf("%zu\n", len_ref_Array_i32(&arr));
    printf("%d\n", first);
    tsc_array_free_i32(&rest);
    return 0;
}
