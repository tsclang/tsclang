#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2};
    const Array_i32 a = {.data = _lit_0, .length = 2, .capacity = 2};
    int32_t _lit_1[] = {3, 4};
    const Array_i32 b = {.data = _lit_1, .length = 2, .capacity = 2};
    Array_i32 c = tsc_array_concat_i32(a, b);
    printf("%zu\n", c.length);
    printf("%d\n", c.data[2]);
    tsc_array_free_i32(&c);
    return 0;
}
