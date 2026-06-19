#include "runtime.h"

typedef struct { TscError _base; } IOError;
typedef struct { bool ok; union { int32_t value; MathError error; }; } Result_i32_MathError;
typedef enum { _Err_MathError = 0, _Err_IOError = 1 } _ErrTag_MathError_IOError;
typedef struct {
    _ErrTag_MathError_IOError tag;
    union { MathError _0; IOError _1; };
} _ErrUnion_MathError_IOError;

typedef struct {
    bool ok;
    union { int32_t value; _ErrUnion_MathError_IOError error; };
} Result_i32_MathError_IOError;

Result_i32_MathError inner_i32_i32(int32_t a, int32_t b) {
    MathError _func_math_err = {0};
    int32_t _math_0;
    if (__builtin_add_overflow((int32_t)(a), (int32_t)(b), &_math_0)) { _func_math_err.operation = "add"; goto _func_math_throw; }
    return (Result_i32_MathError){.ok = true, .value = _math_0};
    _func_math_throw:
        return (Result_i32_MathError){.ok = false, .error = _func_math_err};
}

Result_i32_MathError_IOError outer_i32_i32(int32_t a, int32_t b) {
    MathError _func_math_err = {0};
    Result_i32_MathError _res_1 = inner_i32_i32(a, b);
    if (!_res_1.ok) { _func_math_err = _res_1.error; goto _func_math_throw; }
    return (Result_i32_MathError_IOError){.ok = true, .value = _res_1.value};
    _func_math_throw:
        _ErrUnion_MathError_IOError _math_union = {.tag = _Err_MathError, ._0 = _func_math_err};
        return (Result_i32_MathError_IOError){.ok = false, .error = _math_union};
}

int main(void) {
    TSC_INIT();
    int32_t z = 0;
    Result_i32_MathError_IOError r = outer_i32_i32(1, 2);
    if (!r.ok) {
        z = -1;
    } else {
        z = r.value;
    }
    printf("%d\n", z);
    return 0;
}
