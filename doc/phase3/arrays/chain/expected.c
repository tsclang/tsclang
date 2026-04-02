#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    Array_i32 arr = tsc_array_create_i32(50);
    tsc_array_resize_i32(&arr, 10, 0);
    tsc_array_fill_i32(&arr, 7, 0, 5);
    printf("%d\n", arr.data[0]);
    printf("%d\n", arr.data[4]);
    printf("%d\n", arr.data[5]);
    tsc_array_free_i32(&arr);
    return 0;
}
