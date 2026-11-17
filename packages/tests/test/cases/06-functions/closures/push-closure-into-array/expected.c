#include "runtime.h"

typedef struct { tsc_closure *data; size_t length; size_t capacity; } Array_tsc_closure;

typedef struct { tsc_env_hdr _hdr; double i; } _nested_1_env;

static void _nested_1_env_destroy(void *_env) {
    _nested_1_env *env = (_nested_1_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_1_env *_outer; } _closure_2_env;

static void _closure_2_destroy(void *_env) {
    _closure_2_env *env = (_closure_2_env *)_env;
    tsc_env_release(env->_outer);
}

static double _closure_2_fn(_closure_2_env *env) {
    return env->_outer->i;
}

#define tsc_array_free_tsc_closure(arr) do { Array_tsc_closure *_a_ = (arr); if (_a_->data) { for (size_t _i_ = 0; _i_ < _a_->length; _i_++) tsc_env_release(_a_->data[_i_].env); if (_a_->capacity > 0) free(_a_->data); } _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)
#define tsc_array_push_tsc_closure(arr, ...) do { Array_tsc_closure *_a_ = (arr); tsc_closure _v_ = (__VA_ARGS__); if (_a_->length >= _a_->capacity) { size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; _a_->data = (tsc_closure*)realloc(_a_->data, _nc_ * sizeof(tsc_closure)); _a_->capacity = _nc_; } _a_->data[_a_->length++] = _v_; } while(0)

void run(void) {
    const Array_tsc_closure fns = {0};
    for (double i = 0; i < 3; i++) {
        _nested_1_env *env = tsc_malloc(sizeof(_nested_1_env));
        *env = (_nested_1_env){._hdr = {._refcount = 1, ._destroy = _nested_1_env_destroy}};
        env->i = i;
        tsc_env_retain(env);
        _closure_2_env *_lambda_env_2 = tsc_malloc(sizeof(_closure_2_env));
        *_lambda_env_2 = (_closure_2_env){._hdr = {._refcount = 1, ._destroy = _closure_2_destroy}, ._outer = env};
        tsc_array_push_tsc_closure(&fns, (tsc_closure){.env = _lambda_env_2, .fn = (void*)_closure_2_fn});
        i = env->i;
        tsc_env_release(env);
    }
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))fns.data[0].fn)(fns.data[0].env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))fns.data[1].fn)(fns.data[1].env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))fns.data[2].fn)(fns.data[2].env))));
    tsc_array_free_tsc_closure(&fns);
}

int main(void) {
    TSC_INIT();
    run();
    return 0;
}
