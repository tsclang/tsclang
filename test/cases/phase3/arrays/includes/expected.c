#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    const Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    printf("%s\n", tsc_array_includes_i32(arr, 2) ? "true" : "false");
    printf("%s\n", tsc_array_includes_i32(arr, 5) ? "true" : "false");
    return 0;
}
