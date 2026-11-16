#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; int32_t base; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

static int32_t _nested_1_get(_nested_0_env *env) {
    return env->base;
}

void _tsc_main(void) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    tsc_closure get = {.env = env, .fn = (void*)_nested_1_get};
    env->base = 0;
    env->base = 10;
    printf("%d\n", ((int32_t (*)(void *))get.fn)(get.env));
    tsc_env_release(env);
}

int main(void) {
    TSC_INIT();
    _tsc_main();
    return 0;
}
