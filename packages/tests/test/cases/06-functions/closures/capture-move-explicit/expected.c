#include "runtime.h"

typedef struct { int32_t value; } Data;

typedef struct { tsc_env_hdr _hdr; Data *d; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->d->value;
}

int main(void) {
    TSC_INIT();
    Data d = {0};
    d.value = 42;
    _closure_0_env *getVal_env = tsc_malloc(sizeof(_closure_0_env));
    *getVal_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .d = &d};
    tsc_closure getVal = {.env = getVal_env, .fn = (void*)_closure_0_fn};
    printf("%d\n", ((int32_t (*)(void *))getVal.fn)(getVal.env));
    tsc_env_release(getVal_env);
    return 0;
}
