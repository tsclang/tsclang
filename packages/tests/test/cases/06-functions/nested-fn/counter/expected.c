#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; int32_t count; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

static int32_t _nested_1_inc(_nested_0_env *env) {
    env->count = env->count + 1;
    return env->count;
}

tsc_closure makeCounter(void) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    tsc_closure inc = {.env = env, .fn = (void*)_nested_1_inc};
    env->count = 0;
    tsc_env_retain((inc).env);
    tsc_closure _ret_0 = inc;
    tsc_env_release(env);
    return _ret_0;
}

int main(void) {
    TSC_INIT();
    tsc_closure c = makeCounter();
    printf("%d\n", ((int32_t (*)(void *))c.fn)(c.env));
    printf("%d\n", ((int32_t (*)(void *))c.fn)(c.env));
    tsc_env_release(c.env);
    return 0;
}
