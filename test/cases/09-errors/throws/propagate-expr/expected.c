#include "runtime.h"

typedef struct { TscError _base; } IOError;
typedef struct { bool ok; union { int32_t value; IOError error; }; } Result_i32_IOError;

Result_i32_IOError inner(void) {
    return (Result_i32_IOError){.ok = true, .value = 42};
}

Result_i32_IOError outer(void) {
    Result_i32_IOError _res_0 = inner();
    if (!_res_0.ok) { return (Result_i32_IOError){.ok = false, .error = _res_0.error}; }
    return (Result_i32_IOError){.ok = true, .value = _res_0.value + 1};
}

int main(void) {
    TSC_INIT();
    return 0;
}
