#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Point;
typedef struct { bool has_x; int32_t x; bool has_y; int32_t y; } _partial_Point;

Point merge_Point__partial_Point(Point base, _partial_Point patch) {
    return base;
}

int main(void) {
    TSC_INIT();
    const Point p = merge_Point__partial_Point((Point){.x = 1, .y = 2}, (_partial_Point){.y = 99});
    return 0;
}