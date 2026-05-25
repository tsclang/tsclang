#include "runtime.h"
#include <stdio.h>
#include <stdlib.h>

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;
typedef struct { double *data; size_t length; size_t capacity; } Array_f64;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {3, 1, 7, 4};
    const Array_i32 arr_i32 = {.data = _lit_0, .length = 4, .capacity = 4};
    if (arr_i32.length == 0) { fprintf(stderr, "Math.min: empty array\n"); exit(1); }
    int32_t _min_1 = arr_i32.data[0];
    for (size_t _i_2 = 1; _i_2 < arr_i32.length; _i_2++) {
        if (arr_i32.data[_i_2] < _min_1) _min_1 = arr_i32.data[_i_2];
    }
    printf("%d\n", _min_1);
    if (arr_i32.length == 0) { fprintf(stderr, "Math.max: empty array\n"); exit(1); }
    int32_t _max_3 = arr_i32.data[0];
    for (size_t _i_4 = 1; _i_4 < arr_i32.length; _i_4++) {
        if (arr_i32.data[_i_4] > _max_3) _max_3 = arr_i32.data[_i_4];
    }
    printf("%d\n", _max_3);
    double _lit_5[] = {3.0, 1.0, 7.0, 4.0};
    const Array_f64 arr_f64 = {.data = _lit_5, .length = 4, .capacity = 4};
    if (arr_f64.length == 0) { fprintf(stderr, "Math.min: empty array\n"); exit(1); }
    double _min_6 = arr_f64.data[0];
    for (size_t _i_7 = 1; _i_7 < arr_f64.length; _i_7++) {
        if (arr_f64.data[_i_7] < _min_6) _min_6 = arr_f64.data[_i_7];
    }
    printf("%g\n", _min_6);
    if (arr_f64.length == 0) { fprintf(stderr, "Math.max: empty array\n"); exit(1); }
    double _max_8 = arr_f64.data[0];
    for (size_t _i_9 = 1; _i_9 < arr_f64.length; _i_9++) {
        if (arr_f64.data[_i_9] > _max_8) _max_8 = arr_f64.data[_i_9];
    }
    printf("%g\n", _max_8);
    return 0;
}
