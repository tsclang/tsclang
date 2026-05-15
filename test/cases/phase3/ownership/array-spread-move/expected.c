#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    Array_i32 a = {.data = _lit_0, .length = 3, .capacity = 3};
    int32_t _lit_1[] = {a.data[0], a.data[1], a.data[2], 4, 5};
    Array_i32 b = {.data = _lit_1, .length = 5, .capacity = 5};
    printf("%zu\n", b.length);
    printf("%d\n", b.data[3]);
    return 0;
}
