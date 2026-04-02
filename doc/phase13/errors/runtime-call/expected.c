#include "runtime.h"

typedef struct { int _dummy; } Calc;

static int32_t Calc_sqrt_inner(const Calc *self, int32_t x) {
    (void)self;
    return x;
}

static int32_t Calc_sqrt(const Calc *self, int32_t x) {
    if (x < 0) {
        fprintf(stderr, "Error: too small\n");
        exit(1);
    }
    return Calc_sqrt_inner(self, x);
}

int main(void) {
    TSC_INIT();
    Calc c = {0};
    printf("%d\n", Calc_sqrt(&c, 4));
    return 0;
}
