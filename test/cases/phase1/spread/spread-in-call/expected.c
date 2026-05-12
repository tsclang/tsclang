#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int32_t sum_i32_i32_i32(int32_t a, int32_t b, int32_t c) {
    return a + b + c;
}

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    const Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    printf("%d\n", sum_i32_i32_i32(arr.data[0], arr.data[1], arr.data[2]));
    return 0;
}
