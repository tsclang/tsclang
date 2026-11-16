#include "runtime.h"

static double a;

static double _lambda_0_f64(void *_env) {
    return a + 1;
}

static double a = 1.0;

int main(void) {
    TSC_INIT();
    tsc_closure f = {.env = NULL, .fn = (void*)_lambda_0_f64};
    a = 10.0;
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))f.fn)(f.env))));
    return 0;
}
