#include "runtime.h"

typedef struct { TscError _base; } AppError;
typedef struct { bool ok; union { int32_t value; AppError error; }; } Result_i32_AppError;

Result_i32_AppError ok_fn(void) {
    return (Result_i32_AppError){.ok = true, .value = 42};
}

int main(void) {
    TSC_INIT();
    Result_i32_AppError _res_0 = ok_fn();
    if (_res_0.ok) {
        const int32_t x = _res_0.value;
        printf("%d\n", x);
    } else {
        AppError e = _res_0.error;
        (void)e;
        printf("%s\n", "error");
    }
    return 0;
}
