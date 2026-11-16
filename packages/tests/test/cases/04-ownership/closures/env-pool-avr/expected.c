#ifndef TSC_ENV_POOL_SIZE
#define TSC_ENV_POOL_SIZE 64
#endif
#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; int32_t n; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static int32_t _closure_1_fn(_closure_1_env *env) {
    return (int32_t)((uint32_t)env->_outer->n + (uint32_t)1);
}

tsc_closure make_i32(int32_t n) {
    _nested_0_env *env = tsc_env_alloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    env->n = n;
    tsc_env_retain(env);
    _closure_1_env *_lambda_env_1 = tsc_env_alloc(sizeof(_closure_1_env));
    *_lambda_env_1 = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
    tsc_closure _ret_0 = (tsc_closure){.env = _lambda_env_1, .fn = (void*)_closure_1_fn};
    tsc_env_release(env);
    return _ret_0;
}

int main(void) {
    TSC_INIT();
    tsc_closure kept = make_i32(0);
    for (int16_t i = 0; i < 5; i++) {
        tsc_closure c = make_i32(i);
        { void *_old_env_1 = kept.env;
          kept = c;
          tsc_env_retain(kept.env);
          tsc_env_release(_old_env_1); }
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
