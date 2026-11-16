#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double x; double y; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->x + env->y;
}

int main(void) {
    TSC_INIT();
    double x = 7.0;
    double y = 3.0;
    _closure_0_env *add_env = tsc_malloc(sizeof(_closure_0_env));
    *add_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .x = x, .y = y};
    tsc_closure add = {.env = add_env, .fn = (void*)_closure_0_fn};
    printf("%d\n", ((int32_t (*)(void *))add.fn)(add.env));
    tsc_env_release(add_env);
    return 0;
}
