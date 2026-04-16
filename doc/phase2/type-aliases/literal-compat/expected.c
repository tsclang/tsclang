#include "runtime.h"

typedef struct { double x; double y; } Point;

double dist_Point(Point p) {
    return p.x * p.x + p.y * p.y;
}

int main(void) {
    TSC_INIT();
    printf("%g\n", dist_Point((Point){ .x = 3.0, .y = 4.0 }));
    return 0;
}
