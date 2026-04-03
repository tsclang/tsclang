#include "runtime.h"

typedef struct { TscError _base; } AppError;
static AppError AppError_new(String msg) { AppError s = {0}; s._base.message = msg; return s; }

typedef struct { bool _done; int32_t _result; bool _ok; AppError _error; } Promise_i32_AppError;

int main(void) {
    TSC_INIT();
    Promise_i32_AppError p = { ._done = true, ._ok = false, ._error = AppError_new(STR_LIT("fail")) };
    return 0;
}
