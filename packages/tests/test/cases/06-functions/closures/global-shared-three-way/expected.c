#include "runtime.h"

static double a;

static double _lambda_0_f64(void *_env) {
    a = a + 1;
    return a;
}

static double a = 1.0;

void bump(void) {
    a = a + 100;
}

int main(void) {
    TSC_INIT();
    tsc_closure f = {.env = NULL, .fn = (void*)_lambda_0_f64};
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))f.fn)(f.env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))f.fn)(f.env))));
    bump();
    printf("%s\n", tsc_dtoa((double)(a)));
    return 0;
}
