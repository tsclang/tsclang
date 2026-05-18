#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {1, 2, 3};
    Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 3, .capacity = 3};
    opt_i32 first = tsc_array_shift_i32(&arr);
    printf("%d\n", first.value);
    printf("%zu\n", arr.length);
    return 0;
}
