#include "runtime.h"

typedef struct { tsc_closure *data; size_t length; size_t capacity; } Array_tsc_closure;

static double i;

static double _lambda_0_f64(void *_env) {
    return i;
}

static double i;

#define tsc_array_free_tsc_closure(arr) do { Array_tsc_closure *_a_ = (arr); if (_a_->data) { for (size_t _i_ = 0; _i_ < _a_->length; _i_++) tsc_env_release(_a_->data[_i_].env); if (_a_->capacity > 0) free(_a_->data); } _a_->data = NULL; _a_->length = 0; _a_->capacity = 0; } while(0)
#define tsc_array_push_tsc_closure(arr, ...) do { Array_tsc_closure *_a_ = (arr); tsc_closure _v_ = (__VA_ARGS__); if (_a_->length >= _a_->capacity) { size_t _nc_ = _a_->capacity == 0 ? 8 : _a_->capacity * 2; _a_->data = (tsc_closure*)realloc(_a_->data, _nc_ * sizeof(tsc_closure)); _a_->capacity = _nc_; } _a_->data[_a_->length++] = _v_; } while(0)

int main(void) {
    TSC_INIT();
    const Array_tsc_closure fns = {0};
    for (i = 0; i < 3; i++) {
        tsc_array_push_tsc_closure(&fns, (tsc_closure){.env = NULL, .fn = (void*)_lambda_0_f64});
    }
    for (double k = 0; k < fns.length; k++) {
        String _tmp_0 = tsc_string_format("%s", tsc_dtoa(((double (*)(void *))fns.data[(size_t)(k)].fn)(fns.data[(size_t)(k)].env)));
        printf("%s\n", _tmp_0.data);
        tsc_string_release(_tmp_0);
    }
    tsc_array_free_tsc_closure(&fns);
    return 0;
}
