#include "runtime.h"

typedef struct { TscError _base; } AppError;
static AppError AppError_new(String msg) { AppError s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { AppError error; }; } Result_void_AppError;

Result_void_AppError fail(void) {
    return (Result_void_AppError){.ok = false, .error = AppError_new(STR_LIT("boom"))};
}

int main(void) {
    TSC_INIT();
    Result_void_AppError _res_0 = fail();
    if (!_res_0.ok) {
        AppError e = _res_0.error;
        printf("%s\n", e._base.message.data);
    }
    return 0;
}
