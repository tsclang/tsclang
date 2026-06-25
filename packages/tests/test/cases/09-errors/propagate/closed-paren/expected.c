#include "runtime.h"

typedef struct { TscError _base; } IOError;
typedef struct { bool ok; union { int32_t value; IOError error; }; } Result_i32_IOError;

Result_i32_IOError risky(void) {
    return (Result_i32_IOError){.ok = true, .value = 42};
}

int32_t consume_i32(int32_t v) {
    return v + 1;
}

Result_i32_IOError run(void) {
    Result_i32_IOError _res_0 = risky();
    if (!_res_0.ok) { return (Result_i32_IOError){.ok = false, .error = _res_0.error}; }
    return (Result_i32_IOError){.ok = true, .value = consume_i32(_res_0.value)};
}

int main(void) {
    TSC_INIT();
    return 0;
}
