#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2};
    const Array_i32 a = {.data = _lit_0, .length = 2, .capacity = 2};
    int32_t _lit_1[] = {3, 4};
    const Array_i32 b = {.data = _lit_1, .length = 2, .capacity = 2};
    int32_t _lit_2[] = {a.data[0], a.data[1], b.data[0], b.data[1]};
    const Array_i32 c = {.data = _lit_2, .length = 4, .capacity = 4};
    printf("%d\n", c.data[0]);
    printf("%d\n", c.data[1]);
    printf("%d\n", c.data[2]);
    printf("%d\n", c.data[3]);
    return 0;
}
