#include "runtime.h"

typedef struct { String prefix; } _closure_0_env;

static void _closure_0_destroy(void *_env) {
    _closure_0_env *env = (_closure_0_env *)_env;
    tsc_string_release(env->prefix);
    free(env);
}

static String _closure_0_fn(_closure_0_env *env, String name) {
    tsc_string_retain(tsc_string_concat(tsc_string_concat(env->prefix, STR_LIT(", ")), name));
    return tsc_string_concat(tsc_string_concat(env->prefix, STR_LIT(", ")), name);
}

typedef struct { _closure_0_env env; String (*fn)(_closure_0_env *, String); } _closure_0;

int main(void) {
    TSC_INIT();
    const String prefix = STR_LIT("Hello");
    tsc_string_retain(prefix);
    _closure_0 greet = {.env = {.prefix = prefix}, .fn = _closure_0_fn};
    printf("%s\n", greet.fn(&greet.env, STR_LIT("World")).data);
    tsc_string_release(greet.env.prefix);
    tsc_string_release(prefix);
    return 0;
}
