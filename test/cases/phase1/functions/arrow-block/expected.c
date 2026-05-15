#include "runtime.h"

static int32_t _lambda_0_i32(int32_t x) {
    if (x < 0) {
        return -x;
    }
    return x;
}

int main(void) {
    TSC_INIT();
    tsc_closure abs = {.env = NULL, .fn = (void*)_lambda_0_i32};
    printf("%d\n", ((int32_t (*)(int32_t))abs.fn)(-7));
    return 0;
}
