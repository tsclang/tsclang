#include "runtime.h"

typedef struct { int32_t x; int32_t y; int32_t z; } Vec3;

int32_t test(void) {
    Vec3 v = { .x = 1, .y = 2, .z = 3 };
    int32_t w = 4;
    return (int32_t)((uint32_t)(int32_t)((uint32_t)(int32_t)((uint32_t)v.x + (uint32_t)v.y) + (uint32_t)v.z) + (uint32_t)w);
}

int main(void) {
    TSC_INIT();
    return 0;
}
