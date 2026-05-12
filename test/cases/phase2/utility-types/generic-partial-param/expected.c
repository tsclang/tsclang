#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Point;

Point merge_Point_Partial(Point base, Partial patch) {
    return base;
}

int main(void) {
    TSC_INIT();
    const Point p = merge_Point_Partial((Point){.x = 1, .y = 2}, { .y = 99 });
    return 0;
}
