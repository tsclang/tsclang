#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; int32_t factor; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static int32_t _closure_0_fn(_closure_0_env *env, int32_t x) {
    return (int32_t)((uint32_t)env->factor * (uint32_t)x);
}

int main(void) {
    TSC_INIT();
    const int32_t factor = 3;
    _closure_0_env *mul_env = tsc_malloc(sizeof(_closure_0_env));
    *mul_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .factor = factor};
    tsc_closure mul = {.env = mul_env, .fn = (void*)_closure_0_fn};
    printf("%d\n", ((int32_t (*)(void *, int32_t))mul.fn)(mul.env, 7));
    tsc_env_release(mul_env);
    return 0;
}
