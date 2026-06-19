#include "runtime.h"

typedef struct { TscError _base; } IOError;
static IOError IOError_new(String msg) { IOError s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { String value; IOError error; }; } Result_string_IOError;
typedef enum { _Err_IOError = 0, _Err_MathError = 1 } _ErrTag_IOError_MathError;
typedef struct {
    _ErrTag_IOError_MathError tag;
    union { IOError _0; MathError _1; };
} _ErrUnion_IOError_MathError;

typedef struct {
    bool ok;
    union { String value; _ErrUnion_IOError_MathError error; };
} Result_string_IOError_MathError;

Result_string_IOError readFile_string(String path) {
    return (Result_string_IOError){.ok = false, .error = IOError_new(STR_LIT("not found"))};
}

Result_string_IOError_MathError process_string(String path) {
    MathError _func_math_err = {0};
    Result_string_IOError _res_0 = readFile_string(path);
    if (!_res_0.ok) { return (Result_string_IOError_MathError){.ok = false, .error = (_ErrUnion_IOError_MathError){.tag = _Err_IOError, ._0 = _res_0.error}}; }
    String content = _res_0.value;
    tsc_string_retain(content);
    return (Result_string_IOError_MathError){.ok = true, .value = content};
    _func_math_throw:
        _ErrUnion_IOError_MathError _math_union = {.tag = _Err_MathError, ._1 = _func_math_err};
        return (Result_string_IOError_MathError){.ok = false, .error = _math_union};
}

int main(void) {
    TSC_INIT();
    return 0;
}
