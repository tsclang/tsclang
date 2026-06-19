#include "runtime.h"

typedef struct { TscError _base; } IOError;
typedef enum { _Err_MathError = 0, _Err_IOError = 1 } _ErrTag_MathError_IOError;
typedef struct {
    _ErrTag_MathError_IOError tag;
    union { MathError _0; IOError _1; };
} _ErrUnion_MathError_IOError;

typedef struct {
    bool ok;
    union { int32_t value; _ErrUnion_MathError_IOError error; };
} Result_i32_MathError_IOError;

Result_i32_MathError_IOError risky_i32_i32(int32_t a, int32_t b) {
    MathError _func_math_err = {0};
    int32_t _math_0;
    if (__builtin_add_overflow((int32_t)(a), (int32_t)(b), &_math_0)) { _func_math_err.operation = "add"; goto _func_math_throw; }
    return (Result_i32_MathError_IOError){.ok = true, .value = _math_0};
    _func_math_throw:
        _ErrUnion_MathError_IOError _math_union = {.tag = _Err_MathError, ._0 = _func_math_err};
        return (Result_i32_MathError_IOError){.ok = false, .error = _math_union};
}

static String _tsc_panic_msg_MathError_IOError(_ErrUnion_MathError_IOError e) {
    switch (e.tag) {
    case _Err_MathError: return e._0.message;
    case _Err_IOError: return e._1._base.message;
    }
    return STR_LIT("unknown error");
}

void caller(void) {
    Result_i32_MathError_IOError _unwrap_1 = risky_i32_i32(1, 2);
    if (!_unwrap_1.ok) { tsc_panic(_tsc_panic_msg_MathError_IOError(_unwrap_1.error)); }
    printf("%d\n", _unwrap_1.value);
}

int main(void) {
    TSC_INIT();
    return 0;
}
