#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    Array_i32 arr = {.data = NULL, .length = 0, .capacity = 0};
    opt_i32 x = tsc_array_pop_i32(&arr);
    printf("%s\n", x.has_value ? "some" : "null");
    return 0;
}
