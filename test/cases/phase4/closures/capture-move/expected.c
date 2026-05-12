#include "runtime.h"

typedef struct { int32_t value; } Data;

typedef struct { Data d; } _closure_0_env;

static int32_t _closure_0_fn(_closure_0_env *env) {
    return env->d.value;
}

typedef struct { _closure_0_env env; int32_t (*fn)(_closure_0_env *); } _closure_0;

int main(void) {
    TSC_INIT();
    Data d = {0};
    d.value = 42;
    _closure_0 getVal = {.env = {.d = d}, .fn = _closure_0_fn};
    printf("%d\n", getVal.fn(&getVal.env));
    return 0;
}
