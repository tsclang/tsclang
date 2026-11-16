#include "runtime.h"

typedef struct { double n; } _anon_0;

static _anon_0 o;

static double _lambda_0_f64(void *_env) {
    o.n = o.n + 1;
    return o.n;
}

static _anon_0 o = {.n = 1};

int main(void) {
    TSC_INIT();
    tsc_closure f = {.env = NULL, .fn = (void*)_lambda_0_f64};
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))f.fn)(f.env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))f.fn)(f.env))));
    printf("%s\n", tsc_dtoa((double)(o.n)));
    return 0;
}
