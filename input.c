#include "runtime.h"

typedef struct { String message; } AppError;

typedef struct { bool _done; int32_t _result; bool _ok; AppError _error; } Promise_i32_AppError;

int main(void) {
    TSC_INIT();
    Promise_i32_AppError p = { ._done = true, ._ok = false, ._error = {0} };
    return 0;
}
