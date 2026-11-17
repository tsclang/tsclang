#include "runtime.h"

typedef struct { tsc_closure *data; size_t length; size_t capacity; } Array_tsc_closure;
typedef struct { String key; int32_t value; } MapEntry_string_i32;
typedef struct { MapEntry_string_i32 *data; size_t length; size_t capacity; } Array_MapEntry_string_i32;

#define tsc_array_free_tsc_closure(arr) do { Array_tsc_closure *_a_ = (arr); if (_a_->data) { for (size_t _i_ = 0; _i_ < _a_->length; _i_++) tsc_env_release(_a_->data[_i_].env); if (_a_->capacity > 0) free(_a_->data); } _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)
#define tsc_array_push_tsc_closure(arr, ...) do { Array_tsc_closure *_a_ = (arr); tsc_closure _v_ = (__VA_ARGS__); if (_a_->length >= _a_->capacity) { size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; _a_->data = (tsc_closure*)realloc(_a_->data, _nc_ * sizeof(tsc_closure)); _a_->capacity = _nc_; } _a_->data[_a_->length++] = _v_; } while(0)

typedef struct { tsc_env_hdr _hdr; int32_t v; String k; } _nested_0_env;

static void _nested_0_env_destroy(void *_env) {
    _nested_0_env *env = (_nested_0_env *)_env;
    tsc_string_release(env->k);
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_1_env;

static void _closure_1_destroy(void *_env) {
    _closure_1_env *env = (_closure_1_env *)_env;
    tsc_env_release(env->_outer);
}

static int32_t _closure_1_fn(_closure_1_env *env) {
    return env->_outer->v;
}

typedef struct { tsc_env_hdr _hdr; _nested_0_env *_outer; } _closure_2_env;

static void _closure_2_destroy(void *_env) {
    _closure_2_env *env = (_closure_2_env *)_env;
    tsc_env_release(env->_outer);
}

static String _closure_2_fn(_closure_2_env *env) {
    return env->_outer->k;
}

int main(void) {
    TSC_INIT();
    TscMap_string_i32 m = tsc_map_create_string_i32();
    tsc_map_set_string_i32(&m, STR_LIT("a"), 1);
    tsc_map_set_string_i32(&m, STR_LIT("b"), 2);
    Array_tsc_closure vs = {0};
    Array_tsc_closure ks = {0};
    Array_MapEntry_string_i32 _entries_0 = tsc_map_entries_string_i32(&m);
    for (size_t _i_0 = 0; _i_0 < _entries_0.length; _i_0++) {
        String k = _entries_0.data[_i_0].key;
        int32_t v = _entries_0.data[_i_0].value;
        _nested_0_env *env = tsc_malloc(sizeof(_nested_0_env));
        *env = (_nested_0_env){._hdr = {._refcount = 1, ._destroy = _nested_0_env_destroy}};
        env->v = v;
        env->k = k;
        tsc_string_retain(env->k);
        tsc_env_retain(env);
        _closure_1_env *_lambda_env_1 = tsc_malloc(sizeof(_closure_1_env));
        *_lambda_env_1 = (_closure_1_env){._hdr = {._refcount = 1, ._destroy = _closure_1_destroy}, ._outer = env};
        tsc_array_push_tsc_closure(&vs, (tsc_closure){.env = _lambda_env_1, .fn = (void*)_closure_1_fn});
        tsc_env_retain(env);
        _closure_2_env *_lambda_env_2 = tsc_malloc(sizeof(_closure_2_env));
        *_lambda_env_2 = (_closure_2_env){._hdr = {._refcount = 1, ._destroy = _closure_2_destroy}, ._outer = env};
        tsc_array_push_tsc_closure(&ks, (tsc_closure){.env = _lambda_env_2, .fn = (void*)_closure_2_fn});
        env->v = env->v + 100;
        tsc_env_release(env);
    }
    String _tmp_1 = tsc_string_format("%d %d %.*s %.*s", ((int32_t (*)(void *))vs.data[0].fn)(vs.data[0].env), ((int32_t (*)(void *))vs.data[1].fn)(vs.data[1].env), (int)((String (*)(void *))ks.data[0].fn)(ks.data[0].env).length, ((String (*)(void *))ks.data[0].fn)(ks.data[0].env).data, (int)((String (*)(void *))ks.data[1].fn)(ks.data[1].env).length, ((String (*)(void *))ks.data[1].fn)(ks.data[1].env).data);
    printf("%s\n", _tmp_1.data);
    tsc_string_release(_tmp_1);
    tsc_array_free_tsc_closure(&ks);
    tsc_array_free_tsc_closure(&vs);
    return 0;
}
