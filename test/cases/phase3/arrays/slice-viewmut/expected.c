#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { int32_t *ptr; size_t length; } MutSlice_i32;

int main(void) {
    TSC_INIT();
    int32_t _arr_data_0[] = {1, 2, 3, 4, 5};
    Array_i32 arr = (Array_i32){.data = _arr_data_0, .length = 5, .capacity = 5};
    MutSlice_i32 ms = (MutSlice_i32){ .ptr = arr.data + (0), .length = (size_t)(3) - (0) };
    ms.ptr[1] = 99;
    printf("%d\n", arr.data[1]);
    printf("%d\n", ms.ptr[0]);
    printf("%d\n", ms.ptr[2]);
    return 0;
}
