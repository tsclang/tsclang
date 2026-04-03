#include "runtime.h"

typedef struct { float x; float y; } Vec2;

int main(void) {
    TSC_INIT();
    Vec2 v = {0};
    v.x = 1.0f;
    v.y = 2.0f;
    return 0;
}
