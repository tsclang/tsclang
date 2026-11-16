#include "runtime.h"

typedef struct { double base; } Runner;
typedef struct { double step; } Counter;

static Counter c;

static double Runner_total(const Runner *self) {
    return self->base + c.step;
}

static void Runner_bump(const Runner *self) {
    (void)self;
    c.step = c.step + 1;
}

static Counter c = { .step = 1 };

int main(void) {
    TSC_INIT();
    Runner r = { .base = 5 };
    printf("%s\n", tsc_dtoa((double)(Runner_total(&r))));
    Runner_bump(&r);
    printf("%s\n", tsc_dtoa((double)(Runner_total(&r))));
    printf("%s\n", tsc_dtoa((double)(c.step)));
    return 0;
}
