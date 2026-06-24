#include "runtime.h"

static int32_t _lambda_0_i32(void) {
    return 99;
}

int32_t apply_fn_i32(tsc_closure fn) {
    return ((int32_t (*)(void))fn.fn)();
}

int main(void) {
    TSC_INIT();
    const int32_t result = apply_fn_i32((tsc_closure){.env = NULL, .fn = (void*)_lambda_0_i32});
    printf("%d\n", result);
    return 0;
}
