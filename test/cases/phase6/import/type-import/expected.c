#include "runtime.h"

typedef struct { double x; double y; } shapes_Point;

static shapes_Point shapes_Point_new(double x, double y) {
    shapes_Point self = {0};
    self.x = x;
    self.y = y;
    return self;
}

double magnitude_Point(shapes_Point p) {
    return p.x * p.x + p.y * p.y;
}

int main(void) {
    TSC_INIT();
    return 0;
}
