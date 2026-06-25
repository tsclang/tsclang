#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    Array_i32 arr = tsc_array_create_i32(10);
    printf("%zu\n", arr.capacity);
    printf("%zu\n", arr.length);
    tsc_array_free_i32(&arr);
    return 0;
}
