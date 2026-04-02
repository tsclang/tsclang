#include "runtime.h"

static void _lambda_0_fn(void) {
    printf("timeout\n");
}

int main(void) {
    TSC_INIT();
    tsc_set_timeout(_lambda_0_fn, 100);
    return 0;
}
