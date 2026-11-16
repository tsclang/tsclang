#include "runtime.h"

static double a;

static double _lambda_0_f64(void *_env) {
    a = a + 1;
    return a;
}

static double a = 1.0;

int main(void) {
    TSC_INIT();
    tsc_closure f = {.env = NULL, .fn = (void*)_lambda_0_f64};
    const tsc_closure g = f;
    tsc_env_retain(g.env);
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))g.fn)(g.env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))f.fn)(f.env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))g.fn)(g.env))));
    tsc_env_release(g.env);
    return 0;
}
