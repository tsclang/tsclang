#include "runtime.h"

typedef struct { TscError _base; String stack; } AppError;
static AppError AppError_new(String msg) { AppError s = {0}; s._base.message = msg; s.stack = tsc_capture_stack(); return s; }

typedef struct { bool ok; union { int _dummy; AppError error; }; } Result_void_AppError;

Result_void_AppError fail(void) {
    return (Result_void_AppError){.ok = false, .error = AppError_new(STR_LIT("oops"))};
}

int main(void) {
    TSC_INIT();
    return 0;
}
