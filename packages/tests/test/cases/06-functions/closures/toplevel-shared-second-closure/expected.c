#include "runtime.h"

static double a;

static double _lambda_0_f64(void *_env) {
    a = a + 1;
    return a;
}

static double _lambda_1_f64(void *_env) {
    return a;
}

static double a = 1.0;

int main(void) {
    TSC_INIT();
    tsc_closure inc = {.env = NULL, .fn = (void*)_lambda_0_f64};
    tsc_closure get = {.env = NULL, .fn = (void*)_lambda_1_f64};
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))inc.fn)(inc.env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))get.fn)(get.env))));
    return 0;
}
