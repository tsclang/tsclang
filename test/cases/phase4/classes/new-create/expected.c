#include "runtime.h"

typedef struct { double x; double y; } Point;

int main(void) {
    TSC_INIT();
    Point p = {0};
    p.x = 1.0;
    p.y = 2.0;
    printf("%g\n", p.x);
    return 0;
}
