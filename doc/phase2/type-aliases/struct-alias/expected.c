#include "runtime.h"

typedef struct { double x; double y; } Point;

int main(void) {
    TSC_INIT();
    const Point p = {.x = 1.0, .y = 2.0};
    printf("%g\n", p.x);
    printf("%g\n", p.y);
    return 0;
}
