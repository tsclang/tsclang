#include "runtime.h"

typedef struct { double a; double b; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->a + env->b;
}

int main(void) {
    TSC_INIT();
    double a = 3.0;
    double b = 4.0;
    _closure_0_env sum_env = {.a = a, .b = b};
    tsc_closure sum = {.env = &sum_env, .fn = (void*)_closure_0_fn};
    printf("%d\n", ((int32_t (*)(void *))sum.fn)(sum.env));
    return 0;
}
