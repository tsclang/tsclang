#include "runtime.h"

typedef struct { TscError _base; } Err;
typedef struct { bool ok; union { int32_t value; Err error; }; } Result_i32_Err;
typedef struct { bool ok; union { int _dummy; Err error; }; } Result_void_Err;

Result_i32_Err get(void) {
    return (Result_i32_Err){.ok = true, .value = 42};
}

Result_void_Err run(void) {
    Result_i32_Err _res_0 = get();
    if (!_res_0.ok) { return (Result_void_Err){.ok = false, .error = _res_0.error}; }
    const int32_t x = _res_0.value;
    printf("%d\n", x);
    return (Result_void_Err){.ok = true};
}

int main(void) {
    TSC_INIT();
    return 0;
}
