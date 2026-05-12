#include "runtime.h"

typedef struct { int _dummy; } Math;

static int32_t Math_sqrt_inner(const Math *self, int32_t x) {
    return x;
}

static int32_t Math_sqrt(const Math *self, int32_t x) {
    if (x < 0) {
        tsc_throw(STR_LIT("negative"));
    }
    return Math_sqrt_inner(self, x);
}

int main(void) {
    TSC_INIT();
    Math m = {0};
    printf("%d\n", Math_sqrt(&m, -1));
    return 0;
}
