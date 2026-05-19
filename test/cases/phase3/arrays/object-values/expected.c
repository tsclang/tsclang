#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Point;
typedef struct { int32_t *data; size_t length; size_t capacity; } Array_i32;

int main(void) {
    TSC_INIT();
    Point p = {0};
    p.x = 10;
    p.y = 20;
    Point _obj_0 = p;
    int32_t _vals_1_data[] = {_obj_0.x, _obj_0.y};
    Array_i32 _vals_1 = {.data = _vals_1_data, .length = 2, .capacity = 2};
    const Array_i32 vals = _vals_1;
    printf("%zu\n", vals.length);
    printf("%d\n", vals.data[0]);
    printf("%d\n", vals.data[1]);
    return 0;
}
