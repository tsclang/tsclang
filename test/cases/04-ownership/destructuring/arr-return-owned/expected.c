#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

Array_i32 build(void) {
    Array_i32 arr = tsc_array_create_i32(3);
    tsc_array_push_i32(&arr, 10);
    tsc_array_push_i32(&arr, 20);
    tsc_array_push_i32(&arr, 30);
    return arr;
}

int main(void) {
    TSC_INIT();
    const Array_i32 result = build();
    printf("%d\n", result.data[0]);
    printf("%d\n", result.data[1]);
    printf("%d\n", result.data[2]);
    return 0;
}
