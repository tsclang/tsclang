#include "runtime.h"

typedef struct { tsc_env_hdr _hdr; double x; } _nested_1_env;

static void _nested_1_env_destroy(void *_env) {
    _nested_1_env *env = (_nested_1_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_1_env *_outer; } _closure_3_env;

static void _closure_3_destroy(void *_env) {
    _closure_3_env *env = (_closure_3_env *)_env;
    tsc_env_release(env->_outer);
}

static void _closure_3_fn(_closure_3_env *env) {
    env->_outer->x = env->_outer->x + 1;
}

double f(void) {
    {
        _nested_1_env *env = tsc_malloc(sizeof(_nested_1_env));
        *env = (_nested_1_env){._hdr = {._refcount = 1, ._destroy = _nested_1_env_destroy}};
        env->x = 1;
        {
            tsc_env_retain(env);
            _closure_3_env *bump_env = tsc_malloc(sizeof(_closure_3_env));
            *bump_env = (_closure_3_env){._hdr = {._refcount = 1, ._destroy = _closure_3_destroy}, ._outer = env};
            tsc_closure bump = {.env = bump_env, .fn = (void*)_closure_3_fn};
            ((void (*)(void *))bump.fn)(bump.env);
            ((void (*)(void *))bump.fn)(bump.env);
            tsc_env_release(bump_env);
        }
        double _ret_0 = env->x;
        tsc_env_release(env);
        return _ret_0;
    }
}

int main(void) {
    TSC_INIT();
    String _tmp_1 = tsc_string_format("%s", tsc_dtoa(f()));
    printf("%s\n", _tmp_1.data);
    tsc_string_release(_tmp_1);
    return 0;
}
