#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t a = 100;
    int32_t b = 200;
    String msg = STR_LIT("no");
    MathError _math_err_0 = {0};
    int32_t _math_1;
    if (__builtin_add_overflow((int32_t)(a), (int32_t)(b), &_math_1)) { _math_err_0.operation = "add"; goto _catch_0; }
    if (_math_1 > 250) {
        { String _tsc_tmp = STR_LIT("yes"); tsc_string_release(msg); msg = _tsc_tmp; }
    }
    goto _catch_end_0;
    _catch_0:
    { String _tsc_tmp = STR_LIT("error"); tsc_string_release(msg); msg = _tsc_tmp; }
    _catch_end_0:;
    printf("%s\n", msg.data);
    tsc_string_release(msg);
    return 0;
}
