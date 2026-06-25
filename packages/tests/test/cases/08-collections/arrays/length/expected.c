#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {10, 20, 30};
    const Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    printf("%zu\n", arr.length);
    return 0;
}
