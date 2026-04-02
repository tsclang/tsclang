#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Point;

static Point move_Point_i32(Point p, int32_t dx) {
    p.x += dx;
    return p;
}

int main(void) {
    TSC_INIT();
    Point p = {0};
    p.x = 0;
    p.y = 0;
    Point q = move_Point_i32(p, 5);
    (void)q;
    return 0;
}
