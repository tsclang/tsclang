#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; String s; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
    tsc_string_release(env->s);
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static void _closure_1_fn(_closure_1_env *env) {
    { String _tsc_tmp = tsc_string_concat(env->_outer->s, STR_LIT("b")); tsc_string_release(env->_outer->s); env->_outer->s = _tsc_tmp; }
}

static String _lambda_0_string(void *_env) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    env->s = STR_LIT("a");
    tsc_env_retain(env);
    _closure_1_env *add_env = tsc_malloc(sizeof(_closure_1_env));
    *add_env = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
    tsc_closure add = {.env = add_env, .fn = (void*)_closure_1_fn};
    ((void (*)(void *))add.fn)(add.env);
    ((void (*)(void *))add.fn)(add.env);
    tsc_string_retain(env->s);
    String _ret_0 = env->s;
    tsc_env_release(add_env);
    tsc_env_release(env);
    return _ret_0;
}

int main(void) {
    TSC_INIT();
    tsc_closure f = {.env = NULL, .fn = (void*)_lambda_0_string};
    const String r = ((String (*)(void *))f.fn)(f.env);
    String _tmp_1 = r;
    printf("%s\n", _tmp_1.data);
    tsc_string_release(_tmp_1);
    tsc_string_release(r);
    return 0;
}
