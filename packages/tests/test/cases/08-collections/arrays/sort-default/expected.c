#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {3, 1, 4, 1, 5};
    Array_i32 arr = {.data = _lit_0, .length = 5, .capacity = 5};
    tsc_array_sort_i32(&arr, NULL);
    printf("%d\n", arr.data[0]);
    printf("%d\n", arr.data[4]);
    return 0;
}
