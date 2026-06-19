#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    Array_i32 arr = {.data = NULL, .length = 0, .capacity = 0};
    tsc_array_push_i32(&arr, 10);
    tsc_array_push_i32(&arr, 20);
    printf("%zu\n", arr.length);
    printf("%d\n", arr.data[0]);
    tsc_array_free_i32(&arr);
    return 0;
}
