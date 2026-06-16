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
    compute_i32_i32(1, 2);
    return 0;
}
