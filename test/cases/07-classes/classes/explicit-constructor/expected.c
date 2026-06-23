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
    Point p = Point_new(3.0, 4.0);
    printf("%s\n", tsc_dtoa((double)(p.x)));
    printf("%s\n", tsc_dtoa((double)(p.y)));
    return 0;
}
