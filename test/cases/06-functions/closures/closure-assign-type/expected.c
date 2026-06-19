#include "runtime.h"

typedef struct { String prefix; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
    tsc_string_release(env->prefix);
    free(env);
}

static String _closure_0_fn(_closure_0_env *env, String name) {
    return tsc_string_concat(env->prefix, name);
}

tsc_closure makeGreeter_string(String prefix) {
    tsc_string_retain(prefix);
    _closure_0_env *_lambda_env_0 = tsc_malloc(sizeof(_closure_0_env));
    *_lambda_env_0 = (_closure_0_env){.prefix = prefix};
    return (tsc_closure){.env = _lambda_env_0, .fn = (void*)_closure_0_fn};
}

int main(void) {
    TSC_INIT();
    tsc_closure g = makeGreeter_string(STR_LIT("Hello, "));
    const tsc_closure g2 = g;
    printf("%s\n", ((String (*)(void *, String))g2.fn)(g2.env, STR_LIT("World")).data);
    return 0;
}
