#include "runtime.h"

typedef struct { TscError _base; } IOError;
typedef struct { bool ok; union { int32_t value; IOError error; }; } Result_i32_IOError;

Result_i32_IOError risky(void) {
    return (Result_i32_IOError){.ok = true, .value = 42};
}

void foo_i32(int32_t x) {
    printf("%d\n", x);
}

void caller(void) {
    Result_i32_IOError _res_0 = risky();
    if (!_res_0.ok) { tsc_panic(_res_0.error._base.message); }
    foo_i32(_res_0.value);
}

int main(void) {
    TSC_INIT();
    return 0;
}
