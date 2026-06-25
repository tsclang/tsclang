#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    int32_t a = arr.data[0];
    int32_t b = arr.data[1];
    int32_t c = 100;
    printf("%d\n", (int32_t)((uint32_t)(int32_t)((uint32_t)a + (uint32_t)b) + (uint32_t)c));
    return 0;
}
