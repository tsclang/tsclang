#include "runtime.h"

typedef struct { int32_t count; } Counter;

typedef struct { Counter *c; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
    free(env);
}

static int32_t _closure_0_fn(_closure_0_env *env) {
    env->c->count += 1;
    return env->c->count;
}

int main(void) {
    TSC_INIT();
    Counter c = {0};
    c.count = 0;
    _closure_0_env *inc_env = tsc_malloc(sizeof(_closure_0_env));
    *inc_env = (_closure_0_env){.c = &c};
    tsc_closure inc = {.env = inc_env, .fn = (void*)_closure_0_fn};
    printf("%d\n", ((int32_t (*)(void *))inc.fn)(inc.env));
    printf("%d\n", ((int32_t (*)(void *))inc.fn)(inc.env));
    _closure_0_destroy(inc_env);
    return 0;
}
