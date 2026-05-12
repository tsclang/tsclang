#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {1, 2, 3};
    Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    opt_i32 x = tsc_array_pop_i32(&arr);
    printf("%d\n", x.value);
    printf("%zu\n", arr.length);
    return 0;
}
