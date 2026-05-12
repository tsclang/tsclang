#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Point;

int main(void) {
    TSC_INIT();
    Point p = {0};
    p.x = 1;
    p.y = 2;
    const Point p2 = {.x = p.x, .y = p.y};
    printf("%d\n", p2.x);
    printf("%d\n", p2.y);
    return 0;
}
