#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; int32_t base; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static int32_t _closure_0_fn(_closure_0_env *env, int32_t n) {
    if (n <= 0) {
        return env->base;
    }
    return n + _closure_0_fn(env, n - 1);
}

int main(void) {
    TSC_INIT();
    const int32_t base = 10;
    _closure_0_env *sumBase_env = tsc_malloc(sizeof(_closure_0_env));
    *sumBase_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .base = base};
    tsc_closure sumBase = {.env = sumBase_env, .fn = (void*)_closure_0_fn};
    printf("%d\n", ((int32_t (*)(void *, int32_t))sumBase.fn)(sumBase.env, 5));
    tsc_env_release(sumBase_env);
    return 0;
}
