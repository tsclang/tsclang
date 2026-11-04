#include "runtime.h"

typedef struct { int32_t x; int32_t y; } Vec2;

int main(void) {
    TSC_INIT();
    Vec2 v = {0};
    v.x = 1;
    v.y = 2;
    return 0;
}
