#include "runtime.h"

static void _lambda_0_void(void) {
    printf("tick\n");
}

int main(void) {
    TSC_INIT();
    const int32_t id = tsc_set_interval((tsc_closure){.env = NULL, .fn = (void*)_lambda_0_void}, 100);
    tsc_clear_interval(id);
    return 0;
}
