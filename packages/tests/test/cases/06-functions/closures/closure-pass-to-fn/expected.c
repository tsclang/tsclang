#include "runtime.h"

static double x;
static double y;

static int32_t _lambda_0_i32(void *_env) {
    return x + y;
}

static double x = 7.0;

static double y = 3.0;

int main(void) {
    TSC_INIT();
    tsc_closure add = {.env = NULL, .fn = (void*)_lambda_0_i32};
    printf("%d\n", ((int32_t (*)(void *))add.fn)(add.env));
    return 0;
}
