#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Point;

int main(void) {
    TSC_INIT();
    Point p = {0};
    p.x = 10;
    p.y = 20;
    const Point ro = p;
    printf("%d\n", ro.x);
    printf("%d\n", ro.y);
    return 0;
}
