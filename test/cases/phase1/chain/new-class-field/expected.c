#include "runtime.h"

typedef struct { double x; double y; } Point;

static Point Point_new(double x, double y) {
    Point self = {0};
    self.x = x;
    self.y = y;
    return self;
}

int main(void) {
    TSC_INIT();
    printf("%g\n", Point_new(1.0, 2.0).x);
    return 0;
}
