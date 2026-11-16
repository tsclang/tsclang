#include "runtime.h"

static double n;
static double m;

static int32_t _lambda_0_i32(void *_env) {
    return n;
}

static int32_t _lambda_1_i32(void *_env) {
    return m;
}

static double n = 5.0;

static double m = 10.0;

int main(void) {
    TSC_INIT();
    tsc_closure add5 = {.env = NULL, .fn = (void*)_lambda_0_i32};
    tsc_closure add10 = {.env = NULL, .fn = (void*)_lambda_1_i32};
    printf("%d\n", ((int32_t (*)(void *))add5.fn)(add5.env));
    printf("%d\n", ((int32_t (*)(void *))add10.fn)(add10.env));
    return 0;
}
