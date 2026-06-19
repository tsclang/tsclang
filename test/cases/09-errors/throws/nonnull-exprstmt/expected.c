#include "runtime.h"

typedef struct { TscError _base; } IOError;
typedef struct { bool ok; union { int _dummy; IOError error; }; } Result_void_IOError;

Result_void_IOError compute(void) {
    printf(" computing\n");
    return (Result_void_IOError){.ok = true};
}

void caller(void) {
    Result_void_IOError _res_0 = compute();
    if (!_res_0.ok) { tsc_panic(_res_0.error._base.message); }
    ((void)0);
}

int main(void) {
    TSC_INIT();
    return 0;
}
