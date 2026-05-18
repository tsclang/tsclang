#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {10, 20, 30};
    const Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 3, .capacity = 3};
    printf("%d\n", tsc_array_at_i32(arr, 0));
    printf("%d\n", tsc_array_at_i32(arr, -1));
    return 0;
}
