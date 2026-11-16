#include "runtime.h"

typedef struct { int32_t value; } Box;

typedef struct { tsc_env_hdr _hdr; const Box *b; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->b->value;
}

int main(void) {
    TSC_INIT();
    Box b = {0};
    b.value = 42;
    _closure_0_env *fn_env = tsc_malloc(sizeof(_closure_0_env));
    *fn_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .b = &b};
    tsc_closure fn = {.env = fn_env, .fn = (void*)_closure_0_fn};
    printf("%d\n", ((int32_t (*)(void *))fn.fn)(fn.env));
    tsc_env_release(fn_env);
    return 0;
}
