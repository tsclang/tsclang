#include "runtime.h"

typedef struct { int32_t count; } Counter;

typedef struct { tsc_env_hdr _hdr; Counter *c; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; Counter *c; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
}

static void _closure_1_fn(_closure_1_env *env) {
    env->c->count = (int32_t)((uint32_t)env->c->count + (uint32_t)10);
}

static void _closure_0_fn(_closure_0_env *env) {
    env->c->count = (int32_t)((uint32_t)env->c->count + (uint32_t)1);
    _closure_1_env *inner_env = tsc_malloc(sizeof(_closure_1_env));
    *inner_env = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, .c = env->c};
    tsc_closure inner = {.env = inner_env, .fn = (void*)_closure_1_fn};
    ((void (*)(void *))inner.fn)(inner.env);
    tsc_env_release(inner_env);
}

int main(void) {
    TSC_INIT();
    Counter c = {0};
    c.count = 0;
    _closure_0_env *outer_env = tsc_malloc(sizeof(_closure_0_env));
    *outer_env = (_closure_0_env){._hdr = {._refcount = 1, ._destroy = _closure_0_destroy}, .c = &c};
    tsc_closure outer = {.env = outer_env, .fn = (void*)_closure_0_fn};
    ((void (*)(void *))outer.fn)(outer.env);
    printf("%d\n", c.count);
    tsc_env_release(outer_env);
    return 0;
}
