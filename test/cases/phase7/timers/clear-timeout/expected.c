#include "runtime.h"

static void _lambda_0_void(void) {
    printf("never\n");
}

int main(void) {
    TSC_INIT();
    const int32_t id = tsc_set_timeout(_lambda_0_void, 1000);
    tsc_clear_timeout(id);
    return 0;
}
