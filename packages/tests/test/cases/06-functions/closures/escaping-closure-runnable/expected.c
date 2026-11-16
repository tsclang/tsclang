#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; int32_t n; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static int32_t _closure_0_fn(_closure_0_env *env, int32_t x) {
    return (int32_t)((uint32_t)x + (uint32_t)env->n);
}

tsc_closure makeAdder_i32(int32_t n) {
    _closure_0_env *_lambda_env_0 = tsc_malloc(sizeof(_closure_0_env));
    *_lambda_env_0 = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .n = n};
    return (tsc_closure){.env = _lambda_env_0, .fn = (void*)_closure_0_fn};
}

int main(void) {
    TSC_INIT();
    tsc_closure add5 = makeAdder_i32(5);
    tsc_closure add10 = makeAdder_i32(10);
    printf("%d\n", ((int32_t (*)(void *, int32_t))add5.fn)(add5.env, 3));
    printf("%d\n", ((int32_t (*)(void *, int32_t))add10.fn)(add10.env, 3));
    tsc_env_release(add10.env);
    tsc_env_release(add5.env);
    return 0;
}
