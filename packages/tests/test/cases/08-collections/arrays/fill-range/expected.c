#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3, 4, 5};
    Array_i32 arr = {.data = _lit_0, .length = 5, .capacity = 5};
    tsc_array_fill_i32(&arr, 9, 1, 3);
    printf("%d\n", arr.data[0]);
    printf("%d\n", arr.data[1]);
    printf("%d\n", arr.data[2]);
    printf("%d\n", arr.data[3]);
    return 0;
}
