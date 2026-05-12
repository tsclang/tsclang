#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Point;

static Point Point_new(int32_t x, int32_t y) {
    Point self = {0};
    self.x = x;
    self.y = y;
    return self;
}

int32_t _ext_Point_manhattanDistance(Point _self) {
    return _self.x + _self.y;
}

int main(void) {
    TSC_INIT();
    Point p = Point_new(3, 4);
    printf("%d\n", _ext_Point_manhattanDistance(p));
    return 0;
}
