#include "runtime.h"

static int32_t _lambda_0_i32(void) {
    return 42;
}

int main(void) {
    TSC_INIT();
    tsc_closure f = {.env = NULL, .fn = (void*)_lambda_0_i32};
    printf("%d\n", ((int32_t (*)(void))f.fn)());
    return 0;
}
