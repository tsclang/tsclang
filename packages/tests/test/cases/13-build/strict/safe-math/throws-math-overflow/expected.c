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
    int32_t z = 0;
    Result_i32_MathError r = add_i32_i32(2147483647, 1);
    if (!r.ok) {
        z = -1;
    } else {
        z = r.value;
    }
    printf("%d\n", z);
    return 0;
}
