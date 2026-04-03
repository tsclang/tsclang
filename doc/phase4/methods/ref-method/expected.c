#include "runtime.h"

typedef struct { double x; double y; } Point;

static double Point_distSquared(const Point *self) {
    return self->x * self->x + self->y * self->y;
}

int main(void) {
    TSC_INIT();
    Point p = {0};
    p.x = 3.0;
    p.y = 4.0;
    printf("%g\n", Point_distSquared(&p));
    return 0;
}
