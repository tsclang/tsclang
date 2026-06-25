#include "runtime.h"

typedef struct { double x; double y; } shapes_Point;

static shapes_Point shapes_Point_new(double x, double y) {
    shapes_Point self = {0};
    self.x = x;
    self.y = y;
    return self;
}

double magnitude_Point(shapes_Point p) {
    return (int32_t)((uint32_t)(int32_t)((uint32_t)p.x * (uint32_t)p.x) + (uint32_t)(int32_t)((uint32_t)p.y * (uint32_t)p.y));
}

int main(void) {
    TSC_INIT();
    return 0;
}
