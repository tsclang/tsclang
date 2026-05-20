#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Point;
typedef struct { int32_t **data; size_t length; size_t capacity; } Array_ref_i32;

int main(void) {
    TSC_INIT();
    Point p = {0};
    p.x = 10;
    p.y = 20;
    int32_t *_vals_0_data[] = {&p.x, &p.y};
    Array_ref_i32 _vals_0 = {.data = _vals_0_data, .length = 2, .capacity = 2};
    const Array_ref_i32 vals = _vals_0;
    printf("%zu\n", vals.length);
    printf("%d\n", *vals.data[0]);
    printf("%d\n", *vals.data[1]);
    return 0;
}
