#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Point;
typedef struct { bool has_value; Point value; } opt_Point;
typedef struct { bool has_value; int32_t value; } opt_i32;

static Point Point_new(int32_t px, int32_t py) {
    Point self = {0};
    self.x = px;
    self.y = py;
    return self;
}

int main(void) {
    TSC_INIT();
    opt_Point p = {true, Point_new(10, 20)};
    opt_i32 x = p.has_value ? (opt_i32){true, p.value.x} : (opt_i32){false, 0};
    printf("%d\n", x.value);
    return 0;
}
