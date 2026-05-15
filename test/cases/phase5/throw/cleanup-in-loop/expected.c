#include "runtime.h"

typedef struct { TscError _base; } Err;
static Err Err_new(String msg) { Err s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { int32_t value; Err error; }; } Result_i32_Err;

Result_i32_Err mayFail_i32(int32_t x) {
    if (x < 0) {
        return (Result_i32_Err){.ok = false, .error = Err_new(STR_LIT("negative"))};
    }
    return (Result_i32_Err){.ok = true, .value = x * 2};
}

void process(void) {
    int32_t total = 0;
    for (int32_t i = 0; i < 3; i++) {
        String s = STR_LIT("item");
        Result_i32_Err _res_0 = mayFail_i32(i - 1);
        if (_res_0.ok) {
            int32_t r = _res_0.value;
            total = total + r;
        } else {
            Err e = _res_0.error;
            (void)e;
            total = total + 100;
        }
    }
    printf("%d\n", total);
}

int main(void) {
    TSC_INIT();
    process();
    return 0;
}
