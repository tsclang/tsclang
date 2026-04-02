#include "runtime.h"

static void _lambda_0_fn(void) {
    printf("never\n");
}

int main(void) {
    TSC_INIT();
    TscTimerId id = tsc_set_timeout(_lambda_0_fn, 1000);
    tsc_clear_timeout(id);
    return 0;
}
