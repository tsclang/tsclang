#include "runtime.h"

typedef struct { double v; } Cell;

static Cell c;

static double _lambda_0_f64(void *_env) {
    c.v = c.v + 1;
    return c.v;
}

static Cell c = { .v = 1 };

int main(void) {
    TSC_INIT();
    tsc_closure f = {.env = NULL, .fn = (void*)_lambda_0_f64};
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))f.fn)(f.env))));
    printf("%s\n", tsc_dtoa((double)(c.v)));
    return 0;
}
