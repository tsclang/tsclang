#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { Array_i32 *data; size_t length; size_t capacity; } Array_Array_i32;
typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

int main(void) {
    TSC_INIT();
    double _arr_data_1[] = {1, 2};
    double _arr_data_2[] = {3, 4, 5};
    double _arr_data_3[] = {6};
    Array_i32 _lit_0[] = {(Array_f64){.data = _arr_data_1, .length = 2, .capacity = 2}, (Array_f64){.data = _arr_data_2, .length = 3, .capacity = 3}, (Array_f64){.data = _arr_data_3, .length = 1, .capacity = 1}};
    Array_Array_i32 arr = {.data = _lit_0, .length = 3, .capacity = 3};
    const Array_i32 flat = tsc_array_flat_Array_i32(arr);
    printf("%zu\n", flat.length);
    printf("%d\n", flat.data[0]);
    printf("%d\n", flat.data[4]);
    return 0;
}
