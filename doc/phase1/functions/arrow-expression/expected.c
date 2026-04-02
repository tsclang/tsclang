#include "runtime.h"

static int32_t _lambda_0_i32(int32_t x) {
    return x * x;
}

int main(void) {
    TSC_INIT();
    int32_t (*square)(int32_t) = _lambda_0_i32;
    printf("%d\n", square(5));
    return 0;
}
