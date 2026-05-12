#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int32_t len_ref_Array_i32(const Array_i32 *arr) {
    return (int32_t)arr->length;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3, 4};
    const Array_i32 nums = {.data = _lit_0, .length = 4, .capacity = 4};
    const int32_t a = len_ref_Array_i32(&nums);
    const int32_t b = len_ref_Array_i32(&nums);
    printf("%d\n", a + b);
    return 0;
}
