#include "runtime.h"

typedef struct { int32_t factor; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env, int32_t x) {
    return env->factor * x;
}

int main(void) {
    TSC_INIT();
    const int32_t factor = 3;
    _closure_0_env mul_env = {.factor = factor};
    tsc_closure mul = {.env = &mul_env, .fn = (void*)_closure_0_fn};
    printf("%d\n", ((int32_t (*)(void *, int32_t))mul.fn)(mul.env, 7));
    return 0;
}
