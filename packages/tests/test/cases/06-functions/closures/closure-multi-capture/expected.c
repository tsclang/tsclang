#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double a; double b; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->a + env->b;
}

int main(void) {
    TSC_INIT();
    double a = 3.0;
    double b = 4.0;
    _closure_0_env *sum_env = tsc_malloc(sizeof(_closure_0_env));
    *sum_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .a = a, .b = b};
    tsc_closure sum = {.env = sum_env, .fn = (void*)_closure_0_fn};
    printf("%d\n", ((int32_t (*)(void *))sum.fn)(sum.env));
    tsc_env_release(sum_env);
    return 0;
}
