#include "runtime.h"

typedef struct { TscError _base; } Err;
static Err Err_new(String msg) { Err s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { int32_t value; Err error; }; } Result_i32_Err;

Result_i32_Err step_i32(int32_t n) {
    if (n <= 0) {
        return (Result_i32_Err){.ok = false, .error = Err_new(STR_LIT("bad step"))};
    }
    return (Result_i32_Err){.ok = true, .value = n * 2};
}

Result_i32_Err process_i32(int32_t count) {
    int32_t result = 0;
    for (int32_t i = 0; i < count; i++) {
        Result_i32_Err _res_0 = step_i32(i);
        if (!_res_0.ok) { return (Result_i32_Err){.ok = false, .error = _res_0.error}; }
        int32_t val = _res_0.value;
        result += val;
    }
    return (Result_i32_Err){.ok = true, .value = result};
}

int main(void) {
    TSC_INIT();
    Result_i32_Err _unwrap_1 = process_i32(3);
    if (!_unwrap_1.ok) { tsc_panic(_unwrap_1.error._base.message); }
    printf("%d\n", _unwrap_1.value);
    return 0;
}
