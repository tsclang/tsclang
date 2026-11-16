#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; int32_t x; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static int32_t _closure_1_fn(_closure_1_env *env) {
    return env->_outer->x;
}

void _tsc_main(void) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    env->x = 1;
    tsc_env_retain(env);
    _closure_1_env *fn_env = tsc_malloc(sizeof(_closure_1_env));
    *fn_env = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
    tsc_closure fn = {.env = fn_env, .fn = (void*)_closure_1_fn};
    env->x = 2;
    printf("%d\n", ((int32_t (*)(void *))fn.fn)(fn.env));
    tsc_env_release(fn_env);
    tsc_env_release(env);
}

int main(void) {
    TSC_INIT();
    _tsc_main();
    return 0;
}
