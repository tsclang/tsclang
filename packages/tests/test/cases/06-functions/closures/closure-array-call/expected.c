#include "runtime.h"

typedef struct { tsc_closure *data; size_t length; size_t capacity; } Array_tsc_closure;

#define tsc_array_free_tsc_closure(arr) do { Array_tsc_closure *_a_ = (arr); if (_a_->data) { for (size_t _i_ = 0; _i_ < _a_->length; _i_++) tsc_env_release(_a_->data[_i_].env); if (_a_->capacity > 0) free(_a_->data); } _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)
#define tsc_array_push_tsc_closure(arr, ...) do { Array_tsc_closure *_a_ = (arr); tsc_closure _v_ = (__VA_ARGS__); if (_a_->length >= _a_->capacity) { size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; _a_->data = (tsc_closure*)realloc(_a_->data, _nc_ * sizeof(tsc_closure)); _a_->capacity = _nc_; } _a_->data[_a_->length++] = _v_; } while(0)

typedef struct { tsc_env_hdr _hdr; double count; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static double _closure_1_fn(_closure_1_env *env) {
    env->_outer->count = env->_outer->count + 1;
    return env->_outer->count;
}

tsc_closure makeCounter(void) {
    _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
    *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
    env->count = 0;
    tsc_env_retain(env);
    _closure_1_env *_lambda_env_1 = tsc_malloc(sizeof(_closure_1_env));
    *_lambda_env_1 = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
    tsc_closure _ret_0 = (tsc_closure){.env = _lambda_env_1, .fn = (void*)_closure_1_fn};
    tsc_env_release(env);
    return _ret_0;
}

int main(void) {
    TSC_INIT();
    tsc_closure _fns_lit[] = {makeCounter(), makeCounter()};
    const Array_tsc_closure fns = {.data = _fns_lit, .length = 2, .capacity = 2};
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))fns.data[0].fn)(fns.data[0].env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))fns.data[0].fn)(fns.data[0].env))));
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))fns.data[1].fn)(fns.data[1].env))));
    for (size_t _ci = 0; _ci < fns.length; _ci++) tsc_env_release(fns.data[_ci].env);
    return 0;
}
