#include "runtime.h"

typedef struct { double x; double y; double z; } vec_Vec3;

static vec_Vec3 vec_Vec3_new(double x, double y, double z) {
    vec_Vec3 self = {0};
    self.x = x;
    self.y = y;
    self.z = z;
    return self;
}

double dot_Vec3_Vec3(vec_Vec3 a, vec_Vec3 b) {
    return (int32_t)((uint32_t)(int32_t)((uint32_t)(int32_t)((uint32_t)a.x * (uint32_t)b.x) + (uint32_t)(int32_t)((uint32_t)a.y * (uint32_t)b.y)) + (uint32_t)(int32_t)((uint32_t)a.z * (uint32_t)b.z));
}

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(dot_Vec3_Vec3(vec_Vec3_new(1, 2, 3), vec_Vec3_new(4, 5, 6)))));
    return 0;
}
