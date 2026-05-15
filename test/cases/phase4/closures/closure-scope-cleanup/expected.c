#include "runtime.h"

typedef struct { int32_t a; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->a + 1;
}

int main(void) {
    TSC_INIT();
    int32_t result = 0;
    {
        int32_t a = 10;
        _closure_0_env f_env = {.a = a};
        tsc_closure f = {.env = &f_env, .fn = (void*)_closure_0_fn};
        result = ((int32_t (*)(void *))f.fn)(f.env);
    }
    printf("%d\n", result);
    return 0;
}
