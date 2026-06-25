#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Point;

int main(void) {
    TSC_INIT();
    Point p = {0};
    p.x = 10;
    p.y = 20;
    Point _obj_0 = p;
    String _keys_1_data[] = {STR_LIT("x"), STR_LIT("y")};
    Array_string _keys_1 = {.data = _keys_1_data, .length = 2, .capacity = 2};
    const Array_string keys = _keys_1;
    printf("%zu\n", keys.length);
    printf("%s\n", keys.data[0].data);
    printf("%s\n", keys.data[1].data);
    return 0;
}
