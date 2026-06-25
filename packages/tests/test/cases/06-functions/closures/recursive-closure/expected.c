#include "runtime.h"

static int32_t _lambda_0_i32(int32_t n) {
    if (n <= 1) {
        return 1;
    }
    return n * _lambda_0_i32(n - 1);
}

int main(void) {
    TSC_INIT();
    tsc_closure factorial = {.env = NULL, .fn = (void*)_lambda_0_i32};
    printf("%d\n", ((int32_t (*)(int32_t))factorial.fn)(5));
    return 0;
}
