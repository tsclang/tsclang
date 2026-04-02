#include "runtime.h"

typedef struct { TscError _base; } AppError;

typedef struct { bool ok; union { int _dummy; AppError error; }; } Result_void_AppError;

Result_void_AppError ok_fn(void) {
    return (Result_void_AppError){.ok = true};
}

int main(void) {
    TSC_INIT();
    Result_void_AppError _res_0 = ok_fn();
    if (!_res_0.ok) {
        AppError e = _res_0.error;
        printf("error\n");
    }
    printf("done\n");
    return 0;
}
