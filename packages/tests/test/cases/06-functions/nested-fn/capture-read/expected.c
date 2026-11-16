#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; int32_t base; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

static int32_t _nested_1_addBase(_nested_0_env *env, int32_t x) {
    return (int32_t)((uint32_t)x + (uint32_t)env->base);
}

void _tsc_main(void) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    tsc_closure addBase = {.env = env, .fn = (void*)_nested_1_addBase};
    env->base = 10;
    printf("%d\n", ((int32_t (*)(void *, int32_t))addBase.fn)(addBase.env, 5));
    tsc_env_release(env);
}

int main(void) {
    TSC_INIT();
    _tsc_main();
    return 0;
}
