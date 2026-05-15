#include "runtime.h"

typedef struct { int32_t base; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env, int32_t x) {
    return env->base + x;
}

int main(void) {
    TSC_INIT();
    const int32_t base = 10;
    _closure_0_env add_env = {.base = base};
    tsc_closure add = {.env = &add_env, .fn = (void*)_closure_0_fn};
    printf("%d\n", ((int32_t (*)(void *, int32_t))add.fn)(add.env, 5));
    return 0;
}
