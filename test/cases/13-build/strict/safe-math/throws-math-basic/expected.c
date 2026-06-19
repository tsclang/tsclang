#include "runtime.h"

typedef struct { bool ok; union { int32_t value; MathError error; }; } Result_i32_MathError;

Result_i32_MathError add_i32_i32(int32_t a, int32_t b) {
    MathError _func_math_err = {0};
    int32_t _math_0;
    if (__builtin_add_overflow((int32_t)(a), (int32_t)(b), &_math_0)) { _func_math_err.operation = "add"; goto _func_math_throw; }
    return (Result_i32_MathError){.ok = true, .value = _math_0};
    _func_math_throw:
        return (Result_i32_MathError){.ok = false, .error = _func_math_err};
}

int main(void) {
    TSC_INIT();
    return 0;
}
