#include "runtime.h"

typedef struct { TscError _base; } MyError;
static MyError MyError_new(String msg) { MyError s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { int _dummy; MyError error; }; } Result_void_MyError;

Result_void_MyError risky(void) {
    return (Result_void_MyError){.ok = false, .error = MyError_new(STR_LIT("oops"))};
}

Result_void_MyError wrapper(void) {
    Result_void_MyError _res_0 = risky();
    if (!_res_0.ok) { return (Result_void_MyError){.ok = false, .error = _res_0.error}; }
    return (Result_void_MyError){.ok = true};
}

int main(void) {
    TSC_INIT();
    return 0;
}
