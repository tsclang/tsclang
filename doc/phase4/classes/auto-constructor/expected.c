#include "runtime.h"

typedef struct { double x; double y; } Point;

static Point Point_new(double x, double y) {
    Point _self = {0};
    _self.x = x;
    _self.y = y;
    return _self;
}

int main(void) {
    TSC_INIT();
    const Point p = Point_new(3.0, 4.0);
    printf("%g\n", p.x);
    printf("%g\n", p.y);
    return 0;
}
