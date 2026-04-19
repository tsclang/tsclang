#include "runtime.h"

typedef struct { int _dummy; } Calc;

static void Calc_set_inner(const Calc *self, int32_t x) {
    printf("%d\n", x);
}

static void Calc_set(const Calc *self, int32_t x) {
    const int32_t v = (x < 0) ? 0 : (x > 100) ? 100 : x;
    Calc_set_inner(self, v);
}

int main(void) {
    TSC_INIT();
    Calc c = {0};
    Calc_set(&c, -5);
    Calc_set(&c, 50);
    Calc_set(&c, 150);
    return 0;
}
