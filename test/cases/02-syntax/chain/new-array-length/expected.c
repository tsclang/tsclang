#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    printf("%zu\n", tsc_array_create_i32(5).length);
    return 0;
}
