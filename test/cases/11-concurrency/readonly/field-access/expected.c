#include "runtime.h"

typedef struct { int32_t x; int32_t y; int32_t z; } Vec;

void describe_Readonly_Vec(Vec v) {
    printf("%d\n", v.x);
    printf("%d\n", v.y);
    printf("%d\n", v.z);
}

int main(void) {
    TSC_INIT();
    Vec vec = {0};
    vec.x = 1;
    vec.y = 2;
    vec.z = 3;
    describe_Readonly_Vec(vec);
    return 0;
}
