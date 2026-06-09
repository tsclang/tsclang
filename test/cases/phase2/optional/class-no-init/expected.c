#include "runtime.h"

typedef struct { double x; double y; } Point;

int main(void) {
    TSC_INIT();
    Point p = {0};
    printf("%g\n", (double)(p.x));
    return 0;
}
