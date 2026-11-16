#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; int32_t n; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

static int32_t _nested_1_get(_nested_0_env *env) {
    return env->n;
}

tsc_closure makeAdder_i32(int32_t n) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    env->n = n;
    tsc_closure get = {.env = env, .fn = (void*)_nested_1_get};
    tsc_env_retain((get).env);
    tsc_closure _ret_0 = get;
    tsc_env_release(env);
    return _ret_0;
}

int main(void) {
    TSC_INIT();
    tsc_closure _clo_1 = makeAdder_i32(7);
    printf("%d\n", ((int32_t (*)(void *))_clo_1.fn)(_clo_1.env));
    tsc_env_release(_clo_1.env);
    return 0;
}
