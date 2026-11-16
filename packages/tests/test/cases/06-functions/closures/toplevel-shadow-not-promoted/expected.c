#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; int32_t a; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static int32_t _closure_0_fn(_closure_0_env *env) {
    int32_t a = 2;
    return a;
}

int main(void) {
    TSC_INIT();
    int32_t a = 1;
    _closure_0_env *f_env = tsc_malloc(sizeof(_closure_0_env));
    *f_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .a = a};
    tsc_closure f = {.env = f_env, .fn = (void*)_closure_0_fn};
    printf("%d\n", (int32_t)((uint32_t)((int32_t (*)(void *))f.fn)(f.env) + (uint32_t)a));
    tsc_env_release(f_env);
    return 0;
}
