#include "runtime.h"

static int32_t _lambda_0_i32(int32_t x) {
    if (x < 0) {
        return -x;
    }
    return x;
}

int main(void) {
    TSC_INIT();
    int32_t (*abs)(int32_t) = _lambda_0_i32;
    printf("%d\n", abs(-7));
    return 0;
}
