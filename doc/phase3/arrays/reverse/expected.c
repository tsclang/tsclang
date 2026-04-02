#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    tsc_array_reverse_i32(&arr);
    printf("%d\n", arr.data[0]);
    printf("%d\n", arr.data[2]);
    return 0;
}
