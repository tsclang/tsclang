#include "runtime.h"

static double a;
static double b;

static int32_t _lambda_0_i32(void *_env) {
    return a + b;
}

static double a = 3.0;

static double b = 4.0;

int main(void) {
    TSC_INIT();
    tsc_closure sum = {.env = NULL, .fn = (void*)_lambda_0_i32};
    printf("%d\n", ((int32_t (*)(void *))sum.fn)(sum.env));
    return 0;
}
