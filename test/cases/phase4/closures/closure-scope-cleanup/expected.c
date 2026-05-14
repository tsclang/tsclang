#include "runtime.h"

typedef struct { int32_t a; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->a + 1;
}

typedef struct { _closure_0_env env; int32_t (*fn)(_closure_0_env *); } _closure_0;

int main(void) {
    TSC_INIT();
    int32_t result = 0;
    {
        int32_t a = 10;
        _closure_0 f = {.env = {.a = a}, .fn = _closure_0_fn};
        result = f.fn(&f.env);
    }
    printf("%d\n", result);
    return 0;
}
