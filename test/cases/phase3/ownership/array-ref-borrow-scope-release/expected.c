#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {10, 20};
    const Array_i32 arr = {.data = _lit_0, .length = 2, .capacity = 2};
    {
        const int32_t *r = &arr.data[0];
        printf("%d\n", *r);
    }
    tsc_array_push_i32(&arr, 30);
    printf("%zu\n", arr.length);
    tsc_array_free_i32(&arr);
    return 0;
}
