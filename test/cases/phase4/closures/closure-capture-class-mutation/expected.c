#include "runtime.h"

typedef struct { int32_t count; } Counter;

typedef struct { Counter *c; } _closure_0_env;

static void _closure_0_fn(_closure_0_env *env) {
    env->c->count += 1;
}

int main(void) {
    TSC_INIT();
    Counter c = {0};
    c.count = 0;
    _closure_0_env inc_env = {.c = &c};
    tsc_closure inc = {.env = &inc_env, .fn = (void*)_closure_0_fn};
    ((void (*)(void *))inc.fn)(inc.env);
    ((void (*)(void *))inc.fn)(inc.env);
    ((void (*)(void *))inc.fn)(inc.env);
    printf("%d\n", c.count);
    return 0;
}
