#include "runtime.h"

typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    int32_t _lit_0[] = {10, 20};
    Array_i32 arr = {.data = _lit_0, .length = 2, .capacity = 2};
    double _obj_x = 1;
    double _obj_y = 2;
    double x = _obj_x;
    int32_t a = arr.data[0];
    printf("%s\n", tsc_dtoa((double)(x + a)));
    return 0;
}
