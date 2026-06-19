#include "runtime.h"

typedef struct { double x; double y; } Point;
typedef struct { Point center; double radius; } Shape;

int main(void) {
    TSC_INIT();
    Shape s = { .center = { .x = 1.0, .y = 2.0 }, .radius = 5.0 };
    Shape s2 = (Shape)(s);
    s2.radius = 10.0;
    printf("%g\n", (double)(s.radius));
    printf("%g\n", (double)(s2.radius));
    return 0;
}
