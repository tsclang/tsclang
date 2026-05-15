#include "runtime.h"

static void _lambda_0_void(int32_t x) {
    if (x < 0) {
        return -x;
    }
    return x;
}

int main(void) {
    TSC_INIT();
    tsc_closure abs = {.env = NULL, .fn = (void*)_lambda_0_void};
    printf("%d\n", ((void (*)(void *, int32_t))abs.fn)(abs.env, -7));
    return 0;
}
