#include "runtime.h"

static void _lambda_0_void(void *_env) {
    printf("tick\n");
}

static void _lambda_0_void_adapter(void) { _lambda_0_void(((void *)0)); }

int main(void) {
    TSC_INIT();
    const int32_t id = tsc_set_interval(_lambda_0_void_adapter, 100);
    tsc_clear_interval(id);
    return 0;
}
