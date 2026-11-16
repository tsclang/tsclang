#include "runtime.h"

static void _lambda_0_void(void *_env) {
    printf("never\n");
}

static void _lambda_0_void_adapter(void) { _lambda_0_void(((void *)0)); }

int main(void) {
    TSC_INIT();
    const int32_t id = tsc_set_timeout(_lambda_0_void_adapter, 1000);
    tsc_clear_timeout(id);
    return 0;
}
