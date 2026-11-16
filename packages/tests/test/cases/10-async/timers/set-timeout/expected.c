#include "runtime.h"

static void _lambda_0_void(void *_env) {
    printf("timeout\n");
}

static void _lambda_0_void_adapter(void) { _lambda_0_void(((void *)0)); }

int main(void) {
    TSC_INIT();
    tsc_set_timeout(_lambda_0_void_adapter, 100);
    return 0;
}
