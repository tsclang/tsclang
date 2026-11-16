#include "runtime.h"

static int32_t count;

static void _lambda_0_void(void *_env) {
    count = (int32_t)((uint32_t)count + (uint32_t)1);
}

static void _lambda_0_void_adapter(void) { _lambda_0_void(((void *)0)); }

static int32_t count = 0;

int main(void) {
    TSC_INIT();
    tsc_set_interval(_lambda_0_void_adapter, 50);
    return 0;
}
