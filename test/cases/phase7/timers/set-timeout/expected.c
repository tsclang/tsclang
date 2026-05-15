#include "runtime.h"

static void _lambda_0_void(void) {
    printf("timeout\n");
}

int main(void) {
    TSC_INIT();
    tsc_set_timeout((tsc_closure){.env = NULL, .fn = (void*)_lambda_0_void}, 100);
    return 0;
}
