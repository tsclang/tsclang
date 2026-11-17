#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {10, 20};
    int32_t *_d_1 = (int32_t*)_tsc_xmalloc(2 * sizeof(int32_t));
    memcpy(_d_1, _lit_0, 2 * sizeof(int32_t));
    Array_i32 arr = {.data = _d_1, .length = 2, .capacity = 2};
    {
        const int32_t *r = &arr.data[0];
        printf("%d\n", *r);
    }
    tsc_array_push_i32(&arr, 30);
    printf("%zu\n", arr.length);
    tsc_array_free_i32(&arr);
    return 0;
}
