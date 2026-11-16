#ifndef TSC_ENV_POOL_SIZE
#define TSC_ENV_POOL_SIZE 64
#endif
#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; int32_t n; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static int32_t _closure_0_fn(_closure_0_env *env) {
    return (int32_t)((uint32_t)env->n + (uint32_t)1);
}

tsc_closure make_i32(int32_t n) {
    _closure_0_env *_lambda_env_0 = tsc_env_alloc(sizeof(_closure_0_env));
    *_lambda_env_0 = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .n = n};
    return (tsc_closure){.env = _lambda_env_0, .fn = (void*)_closure_0_fn};
}

int main(void) {
    TSC_INIT();
    tsc_closure kept = make_i32(0);
    for (int16_t i = 0; i < 5; i++) {
        tsc_closure c = make_i32(i);
        { void *_old_env_0 = kept.env;
          kept = c;
          tsc_env_retain(kept.env);
          tsc_env_release(_old_env_0); }
        printf("%ld\n", (long)((int32_t (*)(void *))c.fn)(c.env));
        tsc_env_release(c.env);
    }
    printf("%ld\n", (long)((int32_t (*)(void *))kept.fn)(kept.env));
    tsc_closure b = kept;
    tsc_env_retain(b.env);
    printf("%ld\n", (long)((int32_t (*)(void *))b.fn)(b.env));
    tsc_env_release(b.env);
    tsc_env_release(kept.env);
    return 0;
}
