#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

static bool _lambda_0_bool(int32_t x) {
    return x > 4;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 5, 3, 8};
    const Array_i32 arr = {.data = _lit_0, .length = 4, .capacity = 4};
    printf("%d\n", (int)tsc_array_find_index_i32(arr, _lambda_0_bool));
    return 0;
}
