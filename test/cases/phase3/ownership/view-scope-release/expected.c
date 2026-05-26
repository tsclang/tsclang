#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { const int32_t *ptr; size_t length; } Slice_i32;

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {10, 20, 30};
    Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 3, .capacity = 3};
    {
        Slice_i32 s = (Slice_i32){ .ptr = arr.data + (0), .length = (size_t)(2) - (0) };
        printf("%d\n", s.ptr[0]);
    }
    tsc_array_push_i32(&arr, 40);
    printf("%zu\n", arr.length);
    tsc_array_free_i32(&arr);
    return 0;
}
