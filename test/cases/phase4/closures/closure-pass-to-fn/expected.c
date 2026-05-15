#include "runtime.h"

typedef struct { int32_t x; int32_t y; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->x + env->y;
}

int main(void) {
    TSC_INIT();
    int32_t x = 7;
    int32_t y = 3;
    _closure_0_env add_env = {.x = x, .y = y};
    tsc_closure add = {.env = &add_env, .fn = (void*)_closure_0_fn};
    printf("%d\n", ((int32_t (*)(void *))add.fn)(add.env));
    return 0;
}
