#include "runtime.h"

typedef struct { TscError _base; } Err;
typedef struct { bool ok; union { int32_t value; Err error; }; } Result_i32_Err;

Result_i32_Err step1(void) {
    return (Result_i32_Err){.ok = true, .value = 1};
}

Result_i32_Err step2_i32(int32_t x) {
    return (Result_i32_Err){.ok = true, .value = x + 1};
}

Result_i32_Err run(void) {
    Result_i32_Err _res_0 = step1();
    if (!_res_0.ok) { return (Result_i32_Err){.ok = false, .error = _res_0.error}; }
    const int32_t a = _res_0.value;
    Result_i32_Err _res_1 = step2_i32(a);
    if (!_res_1.ok) { return (Result_i32_Err){.ok = false, .error = _res_1.error}; }
    const int32_t b = _res_1.value;
    return (Result_i32_Err){.ok = true, .value = b};
}

int main(void) {
    TSC_INIT();
    return 0;
}
