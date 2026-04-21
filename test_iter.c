#include "runtime.h"

static int32_t _lambda_0_i32(void) {
    int32_t i = 0;
    if (i >= 3) {
        return NULL;
    }
    return i;
}

int main(void) {
    TSC_INIT();
    int32_t (*f)() = _lambda_0_i32;
    int32_t x = f();
    return 0;
}
