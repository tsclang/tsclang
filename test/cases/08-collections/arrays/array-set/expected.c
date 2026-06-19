#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {0, 0, 0, 0, 0};
    Array_i32 a = {.data = _lit_0, .length = 5, .capacity = 5};
    int32_t _lit_1[] = {10, 20, 30};
    const Array_i32 b = {.data = _lit_1, .length = 3, .capacity = 3};
    tsc_array_set_i32(&a, b, 1);
    printf("%d\n", a.data[0]);
    printf("%d\n", a.data[1]);
    printf("%d\n", a.data[2]);
    printf("%d\n", a.data[3]);
    return 0;
}
