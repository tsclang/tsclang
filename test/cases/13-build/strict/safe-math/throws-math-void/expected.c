#include "runtime.h"

typedef struct { bool ok; union { int _dummy; MathError error; }; } Result_void_MathError;

Result_void_MathError compute_i32_i32(int32_t a, int32_t b) {
    MathError _func_math_err = {0};
    int32_t _math_0;
    if (__builtin_add_overflow((int32_t)(a), (int32_t)(b), &_math_0)) { _func_math_err.operation = "add"; goto _func_math_throw; }
    int32_t z = _math_0;
    printf("%d\n", z);
    return (Result_void_MathError){.ok = true};
    _func_math_throw:
        return (Result_void_MathError){.ok = false, .error = _func_math_err};
}

int main(void) {
    TSC_INIT();
    MathError _math_err_1 = {0};
    Result_void_MathError _res_2 = compute_i32_i32(1, 2);
    if (!_res_2.ok) {
        _math_err_1 = _res_2.error;
        goto _catch_1;
    }
    goto _catch_end_1;
    _catch_1:
    printf("overflow\n");
    _catch_end_1:;
    return 0;
}
