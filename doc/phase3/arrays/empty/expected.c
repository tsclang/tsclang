#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    Array_i32 arr = {.data = NULL, .length = 0, .capacity = 0};
    printf("%zu\n", arr.length);
    return 0;
}
