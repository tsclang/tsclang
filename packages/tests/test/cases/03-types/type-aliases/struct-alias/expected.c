#include "runtime.h"

typedef struct { double x; double y; } Point;

int main(void) {
    TSC_INIT();
    Point p = { .x = 1.0, .y = 2.0 };
    printf("%s\n", tsc_dtoa((double)(p.x)));
    printf("%s\n", tsc_dtoa((double)(p.y)));
    return 0;
}
