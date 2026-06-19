#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3, 4, 5};
    Array_i32 arr = {.data = _lit_0, .length = 5, .capacity = 5};
    const Array_i32 s = {.data = arr.data + 1, .length = 3 - 1, .capacity = 0};
    printf("%zu\n", s.length);
    return 0;
}
