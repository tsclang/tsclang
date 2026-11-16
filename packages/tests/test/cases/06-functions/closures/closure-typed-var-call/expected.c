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
    tsc_closure f = makeAdder_i32(5);
    const int32_t y = ((int32_t (*)(void *, int32_t))f.fn)(f.env, 3);
    printf("%d\n", y);
    tsc_env_release(f.env);
    return 0;
}
